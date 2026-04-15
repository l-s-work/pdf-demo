from pathlib import Path

import fitz
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.settings import is_oss_ready
from app.repositories.pdf_repository import get_document_by_id
from app.utils.file_utils import build_pdf_storage_path
from app.utils.oss_utils import download_pdf_file_from_oss, resolve_pdf_object_key
from app.utils.pdf_extract import open_pdf_document

router = APIRouter(prefix='/api/pdf', tags=['pdf-preview-image'])


# 渲染单页预览图，用于在 PDF 完整加载前尽早显示页面内容。
def render_pdf_page_preview_image(file_path: Path, page_num: int, scale: float) -> bytes:
    pdf_doc = open_pdf_document(file_path)
    try:
        if page_num < 1 or page_num > pdf_doc.page_count:
            raise ValueError('页码超出范围')

        page = pdf_doc[page_num - 1]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        return pixmap.tobytes('png')
    finally:
        pdf_doc.close()


# 获取指定页的 PNG 预览图，供前端在正文加载完成前快速占位显示。
@router.get('/{pdf_id}/page-preview')
async def get_pdf_page_preview(
    pdf_id: str,
    page_num: int = Query(default=1, alias='pageNum', ge=1),
    scale: float = Query(default=1.0, ge=0.1, le=4.0),
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
            file_path = build_pdf_storage_path(document.id, document.file_name)
            object_key = resolve_pdf_object_key(document.id, document.file_name, document.oss_object_key)
            await run_in_threadpool(download_pdf_file_from_oss, object_key, file_path)
        except Exception as exc:
            raise HTTPException(status_code=404, detail='PDF 文件不存在') from exc

    try:
        png_bytes = await run_in_threadpool(render_pdf_page_preview_image, file_path, page_num, scale)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=png_bytes,
        media_type='image/png',
        headers={
            'Cache-Control': 'public, max-age=300',
            'Content-Disposition': f'inline; filename="{document.id}-page-{page_num}.png"'
        }
    )
