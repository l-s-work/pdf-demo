from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PdfDocument, PdfHighlightHit, PdfPageMeta
from app.utils.file_utils import copy_pdf_to_storage, save_pdf_bytes_to_storage
from app.utils.pdf_extract import extract_keyword_hits, extract_page_meta, open_pdf_document


# 按本地 PDF 路径执行入库：提取页尺寸并按关键词生成 per-hit 命中。
async def ingest_pdf_from_path(
    session: AsyncSession,
    source_path: Path,
    keywords: list[str]
) -> str:
    if not source_path.exists():
        raise FileNotFoundError(f'源文件不存在: {source_path}')

    doc_id = f'doc_{uuid4().hex[:12]}'
    target_path = copy_pdf_to_storage(doc_id, source_path)
    await _persist_pdf_records(session, doc_id, source_path.name, target_path, keywords)
    return doc_id


# 按上传文件内容执行入库，并返回命中汇总用于前端回显。
async def ingest_pdf_from_upload(
    session: AsyncSession,
    file_name: str,
    file_bytes: bytes,
    keywords: list[str]
) -> dict[str, str | int | list[dict[str, str | int | list[int]]]]:
    if not file_bytes:
        raise ValueError('上传文件为空')

    doc_id = f'doc_{uuid4().hex[:12]}'
    safe_file_name = Path(file_name).name or 'uploaded.pdf'
    target_path = save_pdf_bytes_to_storage(doc_id, safe_file_name, file_bytes)
    summary = await _persist_pdf_records(session, doc_id, safe_file_name, target_path, keywords)

    return {
        'pdfId': doc_id,
        'fileName': safe_file_name,
        'totalPages': summary['totalPages'],
        'totalHits': summary['totalHits'],
        'keywordSummaries': summary['keywordSummaries']
    }


# 写入文档、页尺寸和命中记录，并生成上传结果摘要。
async def _persist_pdf_records(
    session: AsyncSession,
    doc_id: str,
    file_name: str,
    target_path: Path,
    keywords: list[str]
) -> dict[str, int | list[dict[str, str | int | list[int]]]]:
    doc = open_pdf_document(target_path)

    try:
        document = PdfDocument(
            id=doc_id,
            file_path=str(target_path.resolve()),
            file_name=file_name,
            total_pages=doc.page_count,
            file_size=target_path.stat().st_size,
            is_linearized=1
        )
        session.add(document)

        for page_meta in extract_page_meta(doc):
            session.add(
                PdfPageMeta(
                    pdf_id=doc_id,
                    page_num=int(page_meta['page_num']),
                    width=float(page_meta['width']),
                    height=float(page_meta['height']),
                    rotation=int(page_meta['rotation'])
                )
            )

        hit_items = extract_keyword_hits(doc, keywords)
        keyword_pages: dict[str, set[int]] = {keyword: set() for keyword in keywords}
        keyword_hit_counts: dict[str, int] = {keyword: 0 for keyword in keywords}

        for hit_item in hit_items:
            page_num = int(hit_item['page_num'])
            keyword = str(hit_item['keyword'])

            # 每个矩形单独落库，满足每条列表项只对应一个固定位置。
            session.add(
                PdfHighlightHit(
                    id=f'hit_{uuid4().hex[:16]}',
                    pdf_id=doc_id,
                    page_num=page_num,
                    keyword=keyword,
                    x=float(hit_item['x']),
                    y=float(hit_item['y']),
                    w=float(hit_item['w']),
                    h=float(hit_item['h']),
                    group_id=None
                )
            )
            keyword_pages.setdefault(keyword, set()).add(page_num)
            keyword_hit_counts[keyword] = keyword_hit_counts.get(keyword, 0) + 1

        await session.commit()

        return {
            'totalPages': doc.page_count,
            'totalHits': len(hit_items),
            'keywordSummaries': [
                {
                    'keyword': keyword,
                    'pageNums': sorted(keyword_pages.get(keyword, set())),
                    'hitCount': keyword_hit_counts.get(keyword, 0)
                }
                for keyword in keywords
            ]
        }
    finally:
        doc.close()
