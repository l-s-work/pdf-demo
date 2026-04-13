from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.repositories.pdf_repository import get_document_by_id
from app.utils.range_utils import iter_file_range, parse_range_header

router = APIRouter(prefix='/api/pdf', tags=['pdf-file'])


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
        raise HTTPException(status_code=404, detail='PDF 文件不存在')

    file_size = file_path.stat().st_size
    if not range_header:
        return FileResponse(
            path=file_path,
            media_type='application/pdf',
            filename=document.file_name,
            headers={'Accept-Ranges': 'bytes'}
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
            'Accept-Ranges': 'bytes',
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Content-Length': str(end - start + 1)
        }
    )
