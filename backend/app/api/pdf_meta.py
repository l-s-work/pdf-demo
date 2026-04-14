from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.repositories.pdf_repository import get_document_by_id, list_page_meta_by_pdf_id
from app.schemas.common import ApiResponse
from app.schemas.pdf import PdfMetaData, PdfPageSizeItem

router = APIRouter(prefix='/api/pdf', tags=['pdf-meta'])


# 获取文档轻量索引（总页数、线性化标记、pageSizeList）。
@router.get('/{pdf_id}/meta', response_model=ApiResponse[PdfMetaData])
async def get_pdf_meta(
    pdf_id: str,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[PdfMetaData]:
    document = await get_document_by_id(session, pdf_id)
    if not document:
        raise HTTPException(status_code=404, detail='文档不存在')

    page_meta_rows = await list_page_meta_by_pdf_id(session, pdf_id)
    return ApiResponse(
        data=PdfMetaData(
            pdfId=document.id,
            totalPages=document.total_pages,
            fileSize=document.file_size,
            isLinearized=bool(document.is_linearized),
            ossObjectKey=document.oss_object_key,
            pageSizeList=[
                PdfPageSizeItem(
                    pageNum=item.page_num,
                    width=item.width,
                    height=item.height,
                    rotation=item.rotation
                )
                for item in page_meta_rows
            ]
        )
    )
