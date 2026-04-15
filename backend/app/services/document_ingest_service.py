from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from xml.sax.saxutils import escape as xml_escape

import fitz
from docx import Document as DocxDocument
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph as DocxParagraph
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.pdfmetrics import registerFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.models import PdfHighlightHit, PdfPageMeta, PdfPreviewResource
from app.repositories.pdf_repository import get_document_by_id, get_ingest_job_by_id
from app.utils.file_utils import ensure_linearized_pdf_file
from app.utils.oss_utils import (
    build_derived_pdf_object_key,
    build_page_preview_object_key,
    download_oss_object_to_file,
    upload_bytes_to_oss,
    upload_file_to_oss,
)
from app.utils.pdf_extract import (
    extract_first_page_meta,
    locate_keyword_anywhere,
    locate_keyword_near_page,
    open_pdf_document,
)

SourceFileKind = Literal['pdf', 'docx']
PREVIEW_VERSION = 1
PREVIEW_RENDER_SCALE = 1.6
DOCX_FONT_NAME = 'STSong-Light'


# 注册适合中文显示的内置 CID 字体，避免依赖外部字体文件。
try:
    registerFont(UnicodeCIDFont(DOCX_FONT_NAME))
except Exception:
    pass


# 识别上传文件类型。
def detect_source_file_kind(file_name: str) -> SourceFileKind:
    suffix = Path(file_name).suffix.lower()
    return 'docx' if suffix == '.docx' else 'pdf'


# 遍历 DOCX 中的段落和表格，并尽量保留原始顺序。
def iter_docx_blocks(document: DocxDocument) -> list[DocxParagraph | DocxTable]:
    body = document.element.body
    blocks: list[DocxParagraph | DocxTable] = []
    for child in body.iterchildren():
        if child.tag.endswith('}p'):
            blocks.append(DocxParagraph(child, document))
        elif child.tag.endswith('}tbl'):
            blocks.append(DocxTable(child, document))
    return blocks


# 将单个段落文本转换为 reportlab 可识别的富文本。
def build_docx_paragraph_markup(text: str) -> str:
    normalized_text = xml_escape((text or '').replace('\t', '    ')).replace('\n', '<br />')
    return normalized_text or '&nbsp;'


# 将 DOCX 直接转换为 PDF。
def convert_docx_to_pdf(source_path: Path, target_pdf_path: Path) -> Path:
    document = DocxDocument(source_path)
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        'DocxBody',
        parent=styles['BodyText'],
        fontName=DOCX_FONT_NAME,
        fontSize=11,
        leading=16,
        spaceAfter=6,
        wordWrap='CJK'
    )
    table_style = ParagraphStyle(
        'DocxTableCell',
        parent=styles['BodyText'],
        fontName=DOCX_FONT_NAME,
        fontSize=9.5,
        leading=12,
        wordWrap='CJK'
    )
    story: list[object] = []

    for block in iter_docx_blocks(document):
        if isinstance(block, DocxParagraph):
            text = (block.text or '').strip()
            if not text:
                story.append(Spacer(1, 4))
                continue

            story.append(Paragraph(build_docx_paragraph_markup(block.text or ''), body_style))
            story.append(Spacer(1, 3))
            continue

        # 表格在 reportlab 中容易因为“单行过高”导致整份文档生成失败。
        # 这里改为按行展开为普通段落，优先保证文本可检索和任务可完成。
        for row in block.rows:
            row_text_parts: list[str] = []
            for cell in row.cells:
                cell_text = (cell.text or '').strip()
                if cell_text:
                    row_text_parts.append(cell_text)

            row_text = ' '.join(row_text_parts).strip()
            if not row_text:
                story.append(Spacer(1, 3))
                continue

            story.append(Paragraph(build_docx_paragraph_markup(row_text), table_style))
            story.append(Spacer(1, 4))
            continue

    doc = SimpleDocTemplate(str(target_pdf_path))
    doc.build(story)
    return target_pdf_path


# 渲染单页预览 PNG。
def render_pdf_page_preview_image(file_path: Path, page_num: int, scale: float = PREVIEW_RENDER_SCALE) -> bytes:
    pdf_doc = open_pdf_document(file_path)
    try:
        if page_num < 1 or page_num > pdf_doc.page_count:
            raise ValueError('页码超出范围')

        page = pdf_doc[page_num - 1]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        return pixmap.tobytes('png')
    finally:
        pdf_doc.close()


# 保存第一页页尺寸元信息。
async def persist_first_page_meta(session: AsyncSession, pdf_id: str, pdf_doc: fitz.Document) -> None:
    first_page_meta = extract_first_page_meta(pdf_doc)
    if not first_page_meta:
        return

    await session.execute(delete(PdfPageMeta).where(PdfPageMeta.pdf_id == pdf_id))
    session.add(
        PdfPageMeta(
            pdf_id=pdf_id,
            page_num=int(first_page_meta['page_num']),
            width=float(first_page_meta['width']),
            height=float(first_page_meta['height']),
            rotation=int(first_page_meta['rotation'])
        )
    )


# 根据命中页生成预览图并上传到 OSS。
async def upload_preview_images(
    session: AsyncSession,
    pdf_id: str,
    page_nums: list[int],
    source_pdf_path: Path,
    version: int = PREVIEW_VERSION
) -> None:
    unique_page_nums = sorted({page_num for page_num in page_nums if page_num > 0})
    await session.execute(
        delete(PdfPreviewResource).where(
            PdfPreviewResource.pdf_id == pdf_id,
            PdfPreviewResource.version == version
        )
    )

    for page_num in unique_page_nums:
        png_bytes = await run_in_threadpool(render_pdf_page_preview_image, source_pdf_path, page_num, PREVIEW_RENDER_SCALE)
        object_key = build_page_preview_object_key(pdf_id, page_num, version)
        await run_in_threadpool(upload_bytes_to_oss, object_key, png_bytes, 'image/png')
        session.add(
            PdfPreviewResource(
                pdf_id=pdf_id,
                version=version,
                page_num=page_num,
                preview_object_key=object_key
            )
        )


# 处理上传任务，完成原始文件、线性化预览 PDF、命中记录与命中页预览图入库。
async def process_ingest_job(session: AsyncSession, job_id: str) -> dict[str, object]:
    job = await get_ingest_job_by_id(session, job_id)
    if not job:
        raise FileNotFoundError('上传任务不存在')

    request_payload = json.loads(job.request_payload)
    request_payload_dict = request_payload if isinstance(request_payload, dict) else {}
    request_items: list[dict[str, str | int]] = []
    if isinstance(request_payload_dict.get('items'), list):
        request_items = [item for item in request_payload_dict['items'] if isinstance(item, dict)]
    elif isinstance(request_payload, list):
        request_items = [item for item in request_payload if isinstance(item, dict)]

    source_file_kind = str(request_payload_dict.get('fileKind') or detect_source_file_kind(job.file_name))
    preview_version = int(request_payload_dict.get('previewVersion', PREVIEW_VERSION))
    source_object_key = str(request_payload_dict.get('sourceObjectKey') or job.file_path)
    derived_object_key = str(
        request_payload_dict.get('derivedObjectKey')
        or build_derived_pdf_object_key(job.pdf_id, preview_version)
    )

    document = await get_document_by_id(session, job.pdf_id)
    if not document:
        raise FileNotFoundError('文档不存在')

    with TemporaryDirectory(prefix=f'pdf_{job.pdf_id}_') as temp_dir:
        temp_root = Path(temp_dir)
        source_download_path = temp_root / job.file_name
        await run_in_threadpool(download_oss_object_to_file, source_object_key, source_download_path)

        working_pdf_path = source_download_path
        if source_file_kind == 'docx':
            converted_pdf_path = temp_root / f'{Path(job.file_name).stem}.pdf'
            await run_in_threadpool(convert_docx_to_pdf, source_download_path, converted_pdf_path)
            working_pdf_path = converted_pdf_path

        await run_in_threadpool(ensure_linearized_pdf_file, working_pdf_path)
        await run_in_threadpool(upload_file_to_oss, derived_object_key, working_pdf_path, 'application/pdf')

        pdf_doc = open_pdf_document(working_pdf_path)
        try:
            total_pages = pdf_doc.page_count
            hit_items: list[PdfHighlightHit] = []
            result_items: list[dict[str, object]] = []
            total_hits = 0
            preview_page_nums: list[int] = []

            for item in request_items:
                keyword = str(item.get('keyword', '')).strip()
                requested_page_num = int(item.get('pageNum', 1))
                start_page_num = min(max(1, requested_page_num), total_pages)
                rect_segments = locate_keyword_near_page(pdf_doc, keyword, start_page_num)
                if not rect_segments:
                    # DOCX 经过版式重排后，原始页码往往会偏移很大，兜底全局搜一次。
                    rect_segments = locate_keyword_anywhere(pdf_doc, keyword)

                if not rect_segments:
                    hit_items.append(
                        PdfHighlightHit(
                            id=f'hit_{job_id}_{len(hit_items)}',
                            pdf_id=job.pdf_id,
                            page_num=start_page_num,
                            keyword=keyword,
                            x=0.0,
                            y=0.0,
                            w=0.0,
                            h=0.0,
                            group_id=None
                        )
                    )
                    result_items.append({
                        'keyword': keyword,
                        'inputPageNum': requested_page_num,
                        'matchedPageNums': [],
                        'hitCount': 0,
                        'status': 'not_found',
                        'groupId': None,
                        'anchorHitId': None,
                        'anchorPageNum': start_page_num
                    })
                    continue

                group_id = f'group_{job_id}_{len(hit_items)}'
                anchor_hit_id: str | None = None
                for segment_index, rect in enumerate(rect_segments):
                    hit_id = group_id if segment_index == 0 else f'hit_{job_id}_{len(hit_items)}_{segment_index}'
                    if segment_index == 0:
                        anchor_hit_id = hit_id

                    hit_items.append(
                        PdfHighlightHit(
                            id=hit_id,
                            pdf_id=job.pdf_id,
                            page_num=int(rect['page_num']),
                            keyword=keyword,
                            x=float(rect['x']),
                            y=float(rect['y']),
                            w=float(rect['w']),
                            h=float(rect['h']),
                            group_id=group_id
                        )
                    )

                matched_page_nums = sorted({int(rect['page_num']) for rect in rect_segments})
                preview_page_nums.extend(matched_page_nums)
                total_hits += len(rect_segments)
                result_items.append({
                    'keyword': keyword,
                    'inputPageNum': requested_page_num,
                    'matchedPageNums': matched_page_nums,
                    'hitCount': len(rect_segments),
                    'status': 'matched',
                    'groupId': group_id,
                    'anchorHitId': anchor_hit_id,
                    'anchorPageNum': matched_page_nums[0] if matched_page_nums else start_page_num
                })

            await upload_preview_images(session, job.pdf_id, preview_page_nums, working_pdf_path, preview_version)
            await persist_first_page_meta(session, job.pdf_id, pdf_doc)

            document.file_path = source_object_key
            document.file_name = job.file_name
            document.oss_object_key = derived_object_key
            document.total_pages = total_pages
            document.file_size = working_pdf_path.stat().st_size
            document.is_linearized = 1

            await session.execute(delete(PdfHighlightHit).where(PdfHighlightHit.pdf_id == job.pdf_id))
            for hit_item in hit_items:
                session.add(hit_item)

            await session.commit()
        finally:
            pdf_doc.close()

    return {
        'pdfId': job.pdf_id,
        'fileName': job.file_name,
        'sourceObjectKey': source_object_key,
        'derivedObjectKey': derived_object_key,
        'totalPages': total_pages,
        'totalHits': total_hits,
        'items': result_items,
    }
