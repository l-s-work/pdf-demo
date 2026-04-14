from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import is_oss_ready
from app.core.database import get_session
from app.repositories.pdf_repository import get_document_by_id
from app.schemas.common import ApiResponse
from app.schemas.pdf import PdfPreviewUrlData
from app.utils.file_utils import build_pdf_storage_path
from app.utils.oss_utils import (
    build_signed_get_url,
    download_pdf_file_from_oss,
    object_exists_in_oss,
    resolve_pdf_object_key
)
from app.utils.range_utils import iter_file_range, parse_range_header

router = APIRouter(prefix='/api/pdf', tags=['pdf-file'])


# 获取预览地址：支持 auto/local/oss 三种模式。
@router.get('/{pdf_id}/preview-url', response_model=ApiResponse[PdfPreviewUrlData])
async def get_pdf_preview_url(
    pdf_id: str,
    preview_source: Literal['auto', 'local', 'oss'] = Query(default='auto', alias='previewSource'),
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[PdfPreviewUrlData]:
    document = await get_document_by_id(session, pdf_id)
    if not document:
        raise HTTPException(status_code=404, detail='文档不存在')

    if preview_source == 'local':
        return ApiResponse(
            data=PdfPreviewUrlData(
                previewUrl=f'/api/pdf/{pdf_id}/file',
                source='backend-proxy'
            )
        )

    if not is_oss_ready():
        if preview_source == 'oss':
            raise HTTPException(status_code=400, detail='OSS 未启用，无法返回直连预览地址')
        return ApiResponse(
            data=PdfPreviewUrlData(
                previewUrl=f'/api/pdf/{pdf_id}/file',
                source='backend-proxy'
            )
        )

    object_key = resolve_pdf_object_key(document.id, document.file_name, document.oss_object_key)
    object_exists = await run_in_threadpool(object_exists_in_oss, object_key)
    if object_exists:
        signed_url = await run_in_threadpool(build_signed_get_url, object_key)
        return ApiResponse(
            data=PdfPreviewUrlData(
                previewUrl=signed_url,
                source='oss-signed'
            )
        )
    if preview_source == 'oss':
        raise HTTPException(status_code=404, detail='OSS 中未找到该文档，请改用本地预览或重新上传并启用 OSS')

    return ApiResponse(
        data=PdfPreviewUrlData(
            previewUrl=f'/api/pdf/{pdf_id}/file',
            source='backend-proxy'
        )
    )


# 按文档 ID 输出 PDF 文件，支持 Range 流式读取。
@router.get('/{pdf_id}/file')
async def get_pdf_file(
    pdf_id: str,
    range_header: str | None = Header(default=None, alias='Range'),
    session: AsyncSession = Depends(get_session)
):
    document = await get_document_by_id(session, pdf_id)
    if not document:
        raise HTTPException(status_code=404, detail='文档不存在')

    file_path = Path(document.file_path)
    if not file_path.exists():
        if not is_oss_ready():
            raise HTTPException(status_code=404, detail='PDF 文件不存在')

        try:
            target_local_path = build_pdf_storage_path(document.id, document.file_name)
            object_key = resolve_pdf_object_key(document.id, document.file_name, document.oss_object_key)
            await run_in_threadpool(download_pdf_file_from_oss, object_key, target_local_path)
            file_path = target_local_path
        except Exception as exc:
            raise HTTPException(status_code=404, detail='PDF 文件不存在') from exc

    file_size = file_path.stat().st_size
    response_headers = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
    }
    if not range_header:
        return FileResponse(
            path=file_path,
            media_type='application/pdf',
            filename=document.file_name,
            headers=response_headers
        )

    try:
        start, end = parse_range_header(range_header, file_size)
    except ValueError as error:
        raise HTTPException(status_code=416, detail=str(error)) from error

    return StreamingResponse(
        iter_file_range(file_path, start, end),
        status_code=206,
        media_type='application/pdf',
        headers={
            **response_headers,
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Content-Length': str(end - start + 1)
        }
    )
