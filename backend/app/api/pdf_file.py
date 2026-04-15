from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.settings import is_oss_ready
from app.repositories.pdf_repository import get_document_by_id
from app.schemas.common import ApiResponse
from app.schemas.pdf import PdfPreviewUrlData, PdfSourceUrlData
from app.utils.oss_utils import build_signed_get_url

router = APIRouter(prefix='/api/pdf', tags=['pdf-file'])


# 获取线性化预览 PDF 的签名直链。
@router.get('/{pdf_id}/preview-url', response_model=ApiResponse[PdfPreviewUrlData])
async def get_pdf_preview_url(
    pdf_id: str,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[PdfPreviewUrlData]:
    if not is_oss_ready():
        raise HTTPException(status_code=400, detail='OSS 未启用，无法获取预览地址')

    document = await get_document_by_id(session, pdf_id)
    if not document or not document.oss_object_key:
        raise HTTPException(status_code=404, detail='文档不存在或预览文件未生成')

    preview_url = await run_in_threadpool(build_signed_get_url, document.oss_object_key)
    return ApiResponse(data=PdfPreviewUrlData(previewUrl=preview_url, source='oss-signed'))


# 获取原始文件的签名下载直链。
@router.get('/{pdf_id}/source-url', response_model=ApiResponse[PdfSourceUrlData])
async def get_pdf_source_url(
    pdf_id: str,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[PdfSourceUrlData]:
    if not is_oss_ready():
        raise HTTPException(status_code=400, detail='OSS 未启用，无法获取下载地址')

    document = await get_document_by_id(session, pdf_id)
    if not document or not document.file_path:
        raise HTTPException(status_code=404, detail='文档不存在或源文件未找到')

    source_url = await run_in_threadpool(build_signed_get_url, document.file_path)
    return ApiResponse(data=PdfSourceUrlData(sourceUrl=source_url, source='oss-signed'))


# 兼容旧入口，直接跳转到预览直链。
@router.get('/{pdf_id}/file')
async def get_pdf_file(
    pdf_id: str,
    session: AsyncSession = Depends(get_session)
) -> RedirectResponse:
    preview_result = await get_pdf_preview_url(pdf_id, session=session)
    return RedirectResponse(url=preview_result.data.previewUrl, status_code=302)
