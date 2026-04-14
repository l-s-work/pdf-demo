from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PdfDocument, PdfHighlightHit, PdfIngestJob, PdfPageMeta


# 查询分页命中列表。
async def list_highlight_hits(
    session: AsyncSession,
    page: int,
    page_size: int,
    pdf_id: str | None,
    keyword: str | None
) -> tuple[int, list[dict[str, object]]]:
    filters = []
    if pdf_id:
        filters.append(PdfHighlightHit.pdf_id == pdf_id)
    if keyword:
        filters.append(PdfHighlightHit.keyword.contains(keyword))

    condition = and_(*filters) if filters else None

    query_stmt = (
        select(PdfHighlightHit, PdfDocument)
        .join(PdfDocument, PdfDocument.id == PdfHighlightHit.pdf_id)
        .order_by(PdfHighlightHit.created_at.desc(), PdfHighlightHit.id.desc())
    )
    if condition is not None:
        query_stmt = query_stmt.where(condition)

    rows = (await session.execute(query_stmt)).all()

    grouped_rows: dict[str, dict[str, object]] = {}
    for hit, document in rows:
        group_key = hit.group_id or hit.id
        group = grouped_rows.get(group_key)
        if group is None:
            grouped_rows[group_key] = {
                'representative_hit': hit,
                'document': document,
                'hits': [hit],
                'latest_created_at': hit.created_at
            }
            continue

        group_hits: list[PdfHighlightHit] = group['hits']  # type: ignore[assignment]
        group_hits.append(hit)

        representative_hit: PdfHighlightHit = group['representative_hit']  # type: ignore[assignment]
        if (
            hit.page_num < representative_hit.page_num
            or (hit.page_num == representative_hit.page_num and hit.y < representative_hit.y)
            or (hit.page_num == representative_hit.page_num and hit.y == representative_hit.y and hit.x < representative_hit.x)
            or (
                hit.page_num == representative_hit.page_num
                and hit.y == representative_hit.y
                and hit.x == representative_hit.x
                and hit.id < representative_hit.id
            )
        ):
            group['representative_hit'] = hit

        latest_created_at = group['latest_created_at']
        if hit.created_at > latest_created_at:  # type: ignore[operator]
            group['latest_created_at'] = hit.created_at

    ordered_rows = sorted(
        grouped_rows.items(),
        key=lambda item: (
            item[1]['latest_created_at'],
            item[1]['representative_hit'].id  # type: ignore[index]
        ),
        reverse=True
    )
    total = len(ordered_rows)
    offset = (page - 1) * page_size
    paged_rows = [row for _, row in ordered_rows[offset:offset + page_size]]

    for row in paged_rows:
        row['hits'] = sorted(
            row['hits'],  # type: ignore[index]
            key=lambda item: (item.page_num, item.y, item.x, item.id)
        )

    return total, paged_rows


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
