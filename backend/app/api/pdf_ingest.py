import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.settings import is_oss_ready
from app.repositories.pdf_repository import (
    count_unfinished_ingest_jobs,
    get_document_by_id,
    get_ingest_job_by_id,
    get_latest_ingest_job_by_pdf_id
)
from app.schemas.common import ApiResponse
from app.schemas.ingest import (
    IngestJobCreateResult,
    IngestJobStatusResult,
    IngestRequest,
    ManualHighlightBatchRequest,
    ManualHighlightInputItem
)
from app.services.ingest_job_service import build_ingest_job_status, create_ingest_job, process_ingest_job
from app.services.ingest_service import ingest_pdf_from_path, save_uploaded_pdf
from app.utils.file_utils import build_pdf_storage_path
from app.utils.oss_utils import download_pdf_file_from_oss, resolve_pdf_object_key

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


# 创建浏览器上传任务，快速返回 jobId，后台再异步提取测试命中。
@router.post('/upload', response_model=ApiResponse[IngestJobCreateResult])
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    items: str = Form(default='[]'),
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[IngestJobCreateResult]:
    file_name = Path(file.filename or 'uploaded.pdf').name
    if not file_name.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='仅支持上传 PDF 文件')

    manual_items = parse_manual_highlight_items(items, allow_empty=True)
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail='上传文件为空')

    try:
        pdf_id, safe_file_name, target_path = save_uploaded_pdf(file_name, file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()

    job_id = f'job_{uuid4().hex[:16]}'
    await create_ingest_job(session, job_id, pdf_id, safe_file_name, target_path, manual_items)
    background_tasks.add_task(process_ingest_job, job_id)

    return ApiResponse(
        data=IngestJobCreateResult(
            jobId=job_id,
            pdfId=pdf_id,
            status='pending'
        )
    )


# 给已上传文档追加手工测试项，后台异步提取命中。
@router.post('/{pdf_id}/manual-hits', response_model=ApiResponse[IngestJobCreateResult])
async def append_manual_hits(
    pdf_id: str,
    payload: ManualHighlightBatchRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session)
) -> ApiResponse[IngestJobCreateResult]:
    pending_count = await count_unfinished_ingest_jobs(session, pdf_id)
    if pending_count > 0:
        raise HTTPException(status_code=409, detail='当前文档仍有处理中的任务，请稍后再提交')

    document = await get_document_by_id(session, pdf_id)
    if document:
        file_name = document.file_name
        file_path = Path(document.file_path)
    else:
        latest_job = await get_latest_ingest_job_by_pdf_id(session, pdf_id)
        if not latest_job:
            raise HTTPException(status_code=404, detail='文档不存在，请先上传 PDF')
        file_name = latest_job.file_name
        file_path = Path(latest_job.file_path)

    if not file_path.exists():
        if not is_oss_ready():
            raise HTTPException(status_code=404, detail='PDF 文件不存在，请重新上传')

        try:
            target_local_path = build_pdf_storage_path(pdf_id, file_name)
            object_key = resolve_pdf_object_key(
                pdf_id,
                file_name,
                document.oss_object_key if document else None
            )
            await run_in_threadpool(download_pdf_file_from_oss, object_key, target_local_path)
            file_path = target_local_path

            if document:
                document.file_path = str(target_local_path.resolve())
                if not document.oss_object_key:
                    document.oss_object_key = object_key
                await session.commit()
        except Exception as exc:
            raise HTTPException(status_code=404, detail='PDF 文件不存在，请重新上传') from exc

    job_id = f'job_{uuid4().hex[:16]}'
    await create_ingest_job(
        session,
        job_id=job_id,
        pdf_id=pdf_id,
        file_name=file_name,
        target_path=file_path,
        items=[item.model_dump() for item in payload.items]
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
