from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PdfDocument, PdfHighlightHit, PdfIngestJob, PdfPageMeta


# 查询分页命中列表。
async def list_highlight_hits(
    session: AsyncSession,
    page: int,
    page_size: int,
    pdf_id: str | None,
    keyword: str | None
) -> tuple[int, list[tuple[PdfHighlightHit, PdfDocument]]]:
    filters = [
        # 列表仅展示 group 锚点，避免同一测试项的多段矩形在列表中重复铺开。
        or_(PdfHighlightHit.group_id.is_(None), PdfHighlightHit.id == PdfHighlightHit.group_id)
    ]
    if pdf_id:
        filters.append(PdfHighlightHit.pdf_id == pdf_id)
    if keyword:
        filters.append(PdfHighlightHit.keyword.contains(keyword))

    condition = and_(*filters) if filters else None

    total_stmt = select(func.count()).select_from(PdfHighlightHit)
    if condition is not None:
        total_stmt = total_stmt.where(condition)
    total = int((await session.execute(total_stmt)).scalar_one())

    query_stmt = (
        select(PdfHighlightHit, PdfDocument)
        .join(PdfDocument, PdfDocument.id == PdfHighlightHit.pdf_id)
        .order_by(PdfHighlightHit.created_at.desc(), PdfHighlightHit.id.desc())
    )
    if condition is not None:
        query_stmt = query_stmt.where(condition)
    query_stmt = query_stmt.limit(page_size).offset((page - 1) * page_size)

    rows = list((await session.execute(query_stmt)).all())
    return total, rows


# 按文档 ID 查询文档基础记录。
async def get_document_by_id(session: AsyncSession, pdf_id: str) -> PdfDocument | None:
    stmt = select(PdfDocument).where(PdfDocument.id == pdf_id)
    return (await session.execute(stmt)).scalar_one_or_none()


# 查询指定文档的全部页尺寸元信息。
async def list_page_meta_by_pdf_id(session: AsyncSession, pdf_id: str) -> list[PdfPageMeta]:
    stmt = select(PdfPageMeta).where(PdfPageMeta.pdf_id == pdf_id).order_by(PdfPageMeta.page_num.asc())
    return list((await session.execute(stmt)).scalars().all())


# 按分组 ID 查询同一逻辑命中的全部矩形。
async def list_highlight_hits_by_group_id(session: AsyncSession, group_id: str) -> list[tuple[PdfHighlightHit, PdfDocument]]:
    stmt = (
        select(PdfHighlightHit, PdfDocument)
        .join(PdfDocument, PdfDocument.id == PdfHighlightHit.pdf_id)
        .where(PdfHighlightHit.group_id == group_id)
        .order_by(PdfHighlightHit.page_num.asc(), PdfHighlightHit.y.asc(), PdfHighlightHit.x.asc(), PdfHighlightHit.id.asc())
    )
    return list((await session.execute(stmt)).all())


# 查询指定文档的全部测试项锚点，用于预览页侧边栏。
async def list_test_hits_by_pdf_id(session: AsyncSession, pdf_id: str) -> list[tuple[PdfHighlightHit, PdfDocument]]:
    filters = [
        or_(PdfHighlightHit.group_id.is_(None), PdfHighlightHit.id == PdfHighlightHit.group_id),
        PdfHighlightHit.pdf_id == pdf_id
    ]
    stmt = (
        select(PdfHighlightHit, PdfDocument)
        .join(PdfDocument, PdfDocument.id == PdfHighlightHit.pdf_id)
        .where(and_(*filters))
        .order_by(PdfHighlightHit.page_num.asc(), PdfHighlightHit.y.asc(), PdfHighlightHit.x.asc(), PdfHighlightHit.id.asc())
    )
    return list((await session.execute(stmt)).all())


# 按任务 ID 查询上传任务。
async def get_ingest_job_by_id(session: AsyncSession, job_id: str) -> PdfIngestJob | None:
    stmt = select(PdfIngestJob).where(PdfIngestJob.id == job_id)
    return (await session.execute(stmt)).scalar_one_or_none()


# 查询仍处于处理中状态的任务。
async def list_unfinished_ingest_jobs(session: AsyncSession) -> list[PdfIngestJob]:
    stmt = select(PdfIngestJob).where(PdfIngestJob.status.in_(['pending', 'processing']))
    return list((await session.execute(stmt)).scalars().all())


# 统计未完成任务数量，支持按文档过滤。
async def count_unfinished_ingest_jobs(session: AsyncSession, pdf_id: str | None = None) -> int:
    stmt = select(func.count()).select_from(PdfIngestJob).where(PdfIngestJob.status.in_(['pending', 'processing']))
    if pdf_id:
        stmt = stmt.where(PdfIngestJob.pdf_id == pdf_id)
    return int((await session.execute(stmt)).scalar_one())


# 按文档 ID 查询最近一条任务记录。
async def get_latest_ingest_job_by_pdf_id(session: AsyncSession, pdf_id: str) -> PdfIngestJob | None:
    stmt = (
        select(PdfIngestJob)
        .where(PdfIngestJob.pdf_id == pdf_id)
        .order_by(PdfIngestJob.created_at.desc(), PdfIngestJob.id.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()
