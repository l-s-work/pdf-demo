from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.settings import is_oss_ready
from app.repositories.pdf_repository import get_document_by_id, get_preview_resource_object_key
from app.utils.oss_utils import build_page_preview_object_key, build_signed_get_url, object_exists_in_oss

router = APIRouter(prefix='/api/pdf', tags=['pdf-preview-image'])


# 获取指定页的预览图签名直链，供前端快速展示命中页。
@router.get('/{pdf_id}/page-preview')
async def get_pdf_page_preview(
    pdf_id: str,
    page_num: int = Query(default=1, alias='pageNum', ge=1),
    version: int = Query(default=1, ge=1),
    session: AsyncSession = Depends(get_session)
) -> RedirectResponse:
    if not is_oss_ready():
        raise HTTPException(status_code=400, detail='OSS 未启用，无法获取预览图')

    document = await get_document_by_id(session, pdf_id)
    if not document:
        raise HTTPException(status_code=404, detail='文档不存在')

    object_key = await get_preview_resource_object_key(session, pdf_id, version, page_num)
    if not object_key:
        object_key = build_page_preview_object_key(pdf_id, page_num, version)

    exists = await run_in_threadpool(object_exists_in_oss, object_key)
    if not exists:
        raise HTTPException(status_code=404, detail='该页预览图未生成')

    signed_url = await run_in_threadpool(build_signed_get_url, object_key)
    return RedirectResponse(url=signed_url, status_code=302)
