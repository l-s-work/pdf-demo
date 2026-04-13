from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PdfDocument, PdfHighlightHit, PdfPageMeta


# 查询分页命中列表。
async def list_highlight_hits(
    session: AsyncSession,
    page: int,
    page_size: int,
    pdf_id: str | None,
    keyword: str | None
) -> tuple[int, list[tuple[PdfHighlightHit, PdfDocument]]]:
    filters = []
    if pdf_id:
        filters.append(PdfHighlightHit.pdf_id == pdf_id)
    if keyword:
        filters.append(PdfHighlightHit.keyword.contains(keyword))

    condition = and_(*filters) if filters else None

    count_stmt = select(func.count()).select_from(PdfHighlightHit)
    if condition is not None:
        count_stmt = count_stmt.where(condition)

    total = (await session.execute(count_stmt)).scalar_one()

    query_stmt = (
        select(PdfHighlightHit, PdfDocument)
        .join(PdfDocument, PdfDocument.id == PdfHighlightHit.pdf_id)
        .order_by(PdfHighlightHit.created_at.desc(), PdfHighlightHit.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if condition is not None:
        query_stmt = query_stmt.where(condition)

    rows = (await session.execute(query_stmt)).all()
    return total, rows


# 按文档 ID 查询文档基础记录。
async def get_document_by_id(session: AsyncSession, pdf_id: str) -> PdfDocument | None:
    stmt = select(PdfDocument).where(PdfDocument.id == pdf_id)
    return (await session.execute(stmt)).scalar_one_or_none()


# 查询指定文档的全部页尺寸元信息。
async def list_page_meta_by_pdf_id(session: AsyncSession, pdf_id: str) -> list[PdfPageMeta]:
    stmt = select(PdfPageMeta).where(PdfPageMeta.pdf_id == pdf_id).order_by(PdfPageMeta.page_num.asc())
    return list((await session.execute(stmt)).scalars().all())
