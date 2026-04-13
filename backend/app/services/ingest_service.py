from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PdfDocument, PdfHighlightHit, PdfPageMeta
from app.utils.file_utils import copy_pdf_to_storage, save_pdf_bytes_to_storage
from app.utils.pdf_extract import extract_keyword_hits, extract_page_meta, locate_keyword_near_page, open_pdf_document


# 按本地 PDF 路径执行全量入库：提取页尺寸并按关键词生成 per-hit 命中。
async def ingest_pdf_from_path(
    session: AsyncSession,
    source_path: Path,
    keywords: list[str]
) -> str:
    if not source_path.exists():
        raise FileNotFoundError(f'源文件不存在: {source_path}')

    doc_id = f'doc_{uuid4().hex[:12]}'
    target_path = copy_pdf_to_storage(doc_id, source_path)
    await _persist_full_scan_pdf_records(session, doc_id, source_path.name, target_path, keywords)
    return doc_id


# 保存浏览器上传的 PDF 文件，并返回文档 ID 与存储路径。
def save_uploaded_pdf(file_name: str, file_bytes: bytes) -> tuple[str, str, Path]:
    if not file_bytes:
        raise ValueError('上传文件为空')

    doc_id = f'doc_{uuid4().hex[:12]}'
    safe_file_name = Path(file_name).name or 'uploaded.pdf'
    target_path = save_pdf_bytes_to_storage(doc_id, safe_file_name, file_bytes)
    return doc_id, safe_file_name, target_path


# 处理手工页码+关键词输入的快速测试场景，并返回命中汇总。
async def ingest_pdf_with_manual_targets(
    session: AsyncSession,
    pdf_id: str,
    file_name: str,
    target_path: Path,
    items: list[dict[str, str | int]]
) -> dict[str, int | list[dict[str, str | int | list[int] | None]]]:
    pdf_doc = open_pdf_document(target_path)

    try:
        document = await session.get(PdfDocument, pdf_id)
        if not document:
            session.add(
                PdfDocument(
                    id=pdf_id,
                    file_path=str(target_path.resolve()),
                    file_name=file_name,
                    total_pages=pdf_doc.page_count,
                    file_size=target_path.stat().st_size,
                    is_linearized=1
                )
            )

            for page_meta in extract_page_meta(pdf_doc):
                session.add(
                    PdfPageMeta(
                        pdf_id=pdf_id,
                        page_num=int(page_meta['page_num']),
                        width=float(page_meta['width']),
                        height=float(page_meta['height']),
                        rotation=int(page_meta['rotation'])
                    )
                )
        else:
            meta_count_stmt = select(PdfPageMeta.id).where(PdfPageMeta.pdf_id == pdf_id).limit(1)
            meta_exists = (await session.execute(meta_count_stmt)).first()
            if not meta_exists:
                for page_meta in extract_page_meta(pdf_doc):
                    session.add(
                        PdfPageMeta(
                            pdf_id=pdf_id,
                            page_num=int(page_meta['page_num']),
                            width=float(page_meta['width']),
                            height=float(page_meta['height']),
                            rotation=int(page_meta['rotation'])
                        )
                    )

        result_items: list[dict[str, str | int | list[int] | None]] = []
        total_hits = 0
        for item in items:
            keyword = str(item['keyword']).strip()
            input_page_num = int(item['pageNum'])
            rect_segments = locate_keyword_near_page(pdf_doc, keyword, input_page_num)

            if not rect_segments:
                result_items.append({
                    'keyword': keyword,
                    'inputPageNum': input_page_num,
                    'matchedPageNums': [],
                    'hitCount': 0,
                    'status': 'not_found',
                    'groupId': None,
                    'anchorHitId': None,
                    'anchorPageNum': None
                })
                continue

            group_id = f'group_{uuid4().hex[:16]}'
            anchor_hit_id: str | None = None
            for segment_index, rect in enumerate(rect_segments):
                hit_id = group_id if segment_index == 0 else f'hit_{uuid4().hex[:16]}'
                if segment_index == 0:
                    anchor_hit_id = hit_id

                session.add(
                    PdfHighlightHit(
                        id=hit_id,
                        pdf_id=pdf_id,
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
            total_hits += len(rect_segments)
            result_items.append({
                'keyword': keyword,
                'inputPageNum': input_page_num,
                'matchedPageNums': matched_page_nums,
                'hitCount': len(rect_segments),
                'status': 'matched',
                'groupId': group_id,
                'anchorHitId': anchor_hit_id,
                'anchorPageNum': matched_page_nums[0] if matched_page_nums else input_page_num
            })

        await session.commit()
        return {
            'totalPages': pdf_doc.page_count,
            'totalHits': total_hits,
            'items': result_items
        }
    except Exception:
        await session.rollback()
        raise
    finally:
        pdf_doc.close()


# 写入文档、页尺寸和全量关键词命中记录。
async def _persist_full_scan_pdf_records(
    session: AsyncSession,
    doc_id: str,
    file_name: str,
    target_path: Path,
    keywords: list[str]
) -> None:
    pdf_doc = open_pdf_document(target_path)

    try:
        session.add(
            PdfDocument(
                id=doc_id,
                file_path=str(target_path.resolve()),
                file_name=file_name,
                total_pages=pdf_doc.page_count,
                file_size=target_path.stat().st_size,
                is_linearized=1
            )
        )

        for page_meta in extract_page_meta(pdf_doc):
            session.add(
                PdfPageMeta(
                    pdf_id=doc_id,
                    page_num=int(page_meta['page_num']),
                    width=float(page_meta['width']),
                    height=float(page_meta['height']),
                    rotation=int(page_meta['rotation'])
                )
            )

        for hit_item in extract_keyword_hits(pdf_doc, keywords):
            session.add(
                PdfHighlightHit(
                    id=f'hit_{uuid4().hex[:16]}',
                    pdf_id=doc_id,
                    page_num=int(hit_item['page_num']),
                    keyword=str(hit_item['keyword']),
                    x=float(hit_item['x']),
                    y=float(hit_item['y']),
                    w=float(hit_item['w']),
                    h=float(hit_item['h']),
                    group_id=None
                )
            )

        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        pdf_doc.close()
