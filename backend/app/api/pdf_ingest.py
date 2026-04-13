from pathlib import Path

import fitz
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.schemas.common import ApiResponse
from app.schemas.ingest import IngestRequest, IngestUploadResult
from app.services.ingest_service import ingest_pdf_from_path, ingest_pdf_from_upload

router = APIRouter(prefix='/api/pdf', tags=['pdf-ingest'])


# 解析上传表单中的关键词文本，支持逗号、中文逗号和换行分隔。
def parse_keywords(raw_keywords: str) -> list[str]:
    normalized_text = (
        raw_keywords.replace('，', ',')
        .replace('；', ',')
        .replace(';', ',')
        .replace('\r\n', '\n')
        .replace('\r', '\n')
        .replace('\n', ',')
    )

    keyword_items: list[str] = []
    for item in normalized_text.split(','):
        keyword = item.strip()
        if keyword and keyword not in keyword_items:
            keyword_items.append(keyword)

    return keyword_items or ['test']


# 通过本地路径触发 PDF 预处理入库。
@router.post('/ingest', response_model=ApiResponse[dict[str, str]])
async def ingest_pdf(
    payload: IngestRequest,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[dict[str, str]]:
    source_path = Path(payload.localPath)
    if not source_path.exists():
        raise HTTPException(status_code=400, detail='localPath 文件不存在')

    keywords = payload.keywords if payload.keywords else ['test']
    pdf_id = await ingest_pdf_from_path(session, source_path, keywords)
    return ApiResponse(data={'pdfId': pdf_id})


# 接收浏览器上传的 PDF 文件并返回命中摘要。
@router.post('/upload', response_model=ApiResponse[IngestUploadResult])
async def upload_pdf(
    file: UploadFile = File(...),
    keywords: str = Form(default=''),
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[IngestUploadResult]:
    file_name = Path(file.filename or 'uploaded.pdf').name
    if not file_name.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='仅支持上传 PDF 文件')

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail='上传文件为空')

    try:
        upload_result = await ingest_pdf_from_upload(session, file_name, file_bytes, parse_keywords(keywords))
    except (fitz.FileDataError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or 'PDF 解析失败') from exc
    finally:
        await file.close()

    return ApiResponse(data=IngestUploadResult(**upload_result))
