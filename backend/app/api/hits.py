from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.repositories.pdf_repository import list_highlight_hits
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

    items = [
        HighlightHitItem(
            hitId=hit.id,
            pdfId=hit.pdf_id,
            fileName=document.file_name,
            previewUrl=f'/api/pdf/{hit.pdf_id}/file',
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

    return ApiResponse(
        data=HighlightHitPage(
            page=page,
            pageSize=page_size,
            total=total,
            items=items
        )
    )
