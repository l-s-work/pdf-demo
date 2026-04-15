from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.repositories.pdf_repository import (
    count_unfinished_ingest_jobs,
    list_highlight_hits,
    list_highlight_hits_by_group_id,
    list_test_hits_by_pdf_id
)
from app.schemas.common import ApiResponse
from app.schemas.hit import HighlightHitItem, HighlightHitPage

router = APIRouter(prefix='/api', tags=['hits'])


# 分页查询命中列表（per-hit）。
@router.get('/highlight-hits', response_model=ApiResponse[HighlightHitPage])
async def get_highlight_hits(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias='pageSize', ge=1, le=200),
    pdf_id: str | None = Query(default=None, alias='pdfId'),
    keyword: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[HighlightHitPage]:
    total, rows = await list_highlight_hits(session, page, page_size, pdf_id, keyword)
    has_pending_jobs = (await count_unfinished_ingest_jobs(session, pdf_id)) > 0

    items = []
    for hit, document in rows:
        items.append(
            HighlightHitItem(
                hitId=hit.id,
                pdfId=hit.pdf_id,
                fileName=document.file_name,
                previewUrl=f'/api/pdf/{hit.pdf_id}/preview-url',
                status='matched' if hit.w > 0 and hit.h > 0 else 'pending_coords',
                pageNum=hit.page_num,
                keyword=hit.keyword,
                x=hit.x,
                y=hit.y,
                w=hit.w,
                h=hit.h,
                groupId=hit.group_id
            )
        )

    return ApiResponse(
        data=HighlightHitPage(
            page=page,
            pageSize=page_size,
            total=total,
            hasPendingJobs=has_pending_jobs,
            items=items
        )
    )


# 查询同一逻辑命中的全部矩形，用于跨行或跨页高亮展示。
@router.get('/highlight-groups/{group_id}', response_model=ApiResponse[list[HighlightHitItem]])
async def get_highlight_group_hits(
    group_id: str,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[list[HighlightHitItem]]:
    rows = await list_highlight_hits_by_group_id(session, group_id)
    items = [
        HighlightHitItem(
            hitId=hit.id,
            pdfId=hit.pdf_id,
            fileName=document.file_name,
            previewUrl=f'/api/pdf/{hit.pdf_id}/preview-url',
            status='matched' if hit.w > 0 and hit.h > 0 else 'pending_coords',
            pageNum=hit.page_num,
            keyword=hit.keyword,
            x=hit.x,
            y=hit.y,
            w=hit.w,
            h=hit.h,
            groupId=hit.group_id
        )
        for hit, document in rows
    ]
    return ApiResponse(data=items)


# 查询文档下的全部测试项锚点，用于预览页左侧快速定位。
@router.get('/pdf/{pdf_id}/test-hits', response_model=ApiResponse[list[HighlightHitItem]])
async def get_pdf_test_hits(
    pdf_id: str,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[list[HighlightHitItem]]:
    rows = await list_test_hits_by_pdf_id(session, pdf_id)
    items = [
        HighlightHitItem(
            hitId=hit.id,
            pdfId=hit.pdf_id,
            fileName=document.file_name,
            previewUrl=f'/api/pdf/{hit.pdf_id}/preview-url',
            status='matched' if hit.w > 0 and hit.h > 0 else 'pending_coords',
            pageNum=hit.page_num,
            keyword=hit.keyword,
            x=hit.x,
            y=hit.y,
            w=hit.w,
            h=hit.h,
            groupId=hit.group_id
        )
        for hit, document in rows
    ]
    return ApiResponse(data=items)
