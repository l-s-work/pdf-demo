import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.settings import is_oss_ready
from app.models import PdfDocument
from app.repositories.pdf_repository import get_ingest_job_by_id
from app.schemas.common import ApiResponse
from app.schemas.ingest import IngestJobCreateResult, IngestJobStatusResult, ManualHighlightInputItem
from app.services.ingest_job_service import build_ingest_job_status, create_ingest_job, process_ingest_job
from app.services.document_ingest_service import detect_source_file_kind
from app.utils.oss_utils import build_derived_pdf_object_key, build_source_object_key, upload_stream_to_oss

router = APIRouter(prefix='/api/pdf', tags=['pdf-ingest'])


# 解析上传表单中的手工高亮输入项。
def parse_manual_highlight_items(raw_items: str, allow_empty: bool = False) -> list[dict[str, str | int]]:
    try:
        payload = json.loads(raw_items)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail='items 不是合法的 JSON 数组') from exc

    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail='items 必须是数组')
    if not payload:
        if allow_empty:
            return []
        raise HTTPException(status_code=400, detail='items 至少需要包含一条页码与关键词配置')

    try:
        return [item.model_dump() for item in (ManualHighlightInputItem.model_validate(entry) for entry in payload)]
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f'items 参数不合法: {exc.errors()}') from exc


# 通过本地路径触发 PDF 预处理入库。
@router.post('/ingest', response_model=ApiResponse[dict[str, str]])
async def ingest_pdf() -> ApiResponse[dict[str, str]]:
    raise HTTPException(status_code=410, detail='当前版本不再支持本地路径入库，请使用上传接口')


# 创建浏览器上传任务，快速返回 jobId，后台再异步提取测试命中。
@router.post('/upload', response_model=ApiResponse[IngestJobCreateResult])
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    items: str = Form(default='[]'),
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[IngestJobCreateResult]:
    file_name = Path(file.filename or 'uploaded.pdf').name
    safe_file_name = file_name
    file_kind = detect_source_file_kind(file_name)
    if file_kind not in {'pdf', 'docx'}:
        raise HTTPException(status_code=400, detail='仅支持上传 PDF 或 Word 文件')

    if not is_oss_ready():
        raise HTTPException(status_code=400, detail='当前版本要求启用 OSS 才能上传和预览')

    manual_items = parse_manual_highlight_items(items, allow_empty=False)

    pdf_id = f'doc_{uuid4().hex[:12]}'
    source_object_key = build_source_object_key(pdf_id, safe_file_name)
    derived_object_key = build_derived_pdf_object_key(pdf_id)

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    content_type = (
        'application/pdf'
        if file_kind == 'pdf'
        else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    session.add(
        PdfDocument(
            id=pdf_id,
            file_path=source_object_key,
            file_name=safe_file_name,
            oss_object_key=derived_object_key,
            total_pages=0,
            file_size=file_size,
            is_linearized=0
        )
    )

    try:
        await run_in_threadpool(upload_stream_to_oss, source_object_key, file.file, content_type)
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await file.close()

    job_id = f'job_{uuid4().hex[:16]}'
    await create_ingest_job(
        session,
        job_id,
        pdf_id,
        safe_file_name,
        source_object_key,
        manual_items,
        source_file_kind=file_kind,
        derived_object_key=derived_object_key
    )
    background_tasks.add_task(process_ingest_job, job_id)

    return ApiResponse(
        data=IngestJobCreateResult(
            jobId=job_id,
            pdfId=pdf_id,
            status='pending'
        )
    )


# 查询浏览器上传任务状态，供前端轮询展示进度。
@router.get('/upload-jobs/{job_id}', response_model=ApiResponse[IngestJobStatusResult])
async def get_upload_job_status(
    job_id: str,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[IngestJobStatusResult]:
    job = await get_ingest_job_by_id(session, job_id)
    if not job:
        raise HTTPException(status_code=404, detail='上传任务不存在')

    return ApiResponse(data=IngestJobStatusResult(**build_ingest_job_status(job)))
