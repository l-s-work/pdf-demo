import json
from pathlib import Path

import fitz
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal
from app.models import PdfIngestJob
from app.repositories.pdf_repository import get_ingest_job_by_id, list_unfinished_ingest_jobs
from app.services.ingest_service import ingest_pdf_with_manual_targets


# 创建上传提取任务记录，并保存初始请求信息。
async def create_ingest_job(
    session: AsyncSession,
    job_id: str,
    pdf_id: str,
    file_name: str,
    target_path: Path,
    items: list[dict[str, str | int]],
    upload_to_oss: bool = True
) -> PdfIngestJob:
    job = PdfIngestJob(
        id=job_id,
        pdf_id=pdf_id,
        file_name=file_name,
        file_path=str(target_path.resolve()),
        status='pending',
        request_payload=json.dumps(
            {
                'items': items,
                'uploadToOss': upload_to_oss
            },
            ensure_ascii=False
        )
    )
    session.add(job)
    await session.commit()
    return job


# 后台执行上传任务，完成 PDF 元信息与手工命中入库。
async def process_ingest_job(job_id: str) -> None:
    async with SessionLocal() as session:
        job = await get_ingest_job_by_id(session, job_id)
        if not job:
            return

        request_payload = json.loads(job.request_payload)
        request_items: list[dict[str, str | int]] = []
        upload_to_oss = True
        if isinstance(request_payload, list):
            request_items = [item for item in request_payload if isinstance(item, dict)]
        elif isinstance(request_payload, dict):
            raw_items = request_payload.get('items')
            if isinstance(raw_items, list):
                request_items = [item for item in raw_items if isinstance(item, dict)]

            raw_upload_to_oss = request_payload.get('uploadToOss', True)
            if isinstance(raw_upload_to_oss, bool):
                upload_to_oss = raw_upload_to_oss
            elif isinstance(raw_upload_to_oss, str):
                upload_to_oss = raw_upload_to_oss.strip().lower() in {'1', 'true', 'yes', 'y', 'on'}
            elif isinstance(raw_upload_to_oss, (int, float)):
                upload_to_oss = bool(raw_upload_to_oss)

        job.status = 'processing'
        job.error_message = None
        await session.commit()

        try:
            result = await ingest_pdf_with_manual_targets(
                session,
                pdf_id=job.pdf_id,
                file_name=job.file_name,
                target_path=Path(job.file_path),
                items=request_items,
                upload_to_oss=upload_to_oss
            )
            job.status = 'succeeded'
            job.result_payload = json.dumps(result, ensure_ascii=False)
            job.error_message = None
            await session.commit()
        except (fitz.FileDataError, FileNotFoundError, ValueError) as exc:
            await session.rollback()
            await _mark_job_failed(session, job_id, str(exc) or 'PDF 处理失败')
        except Exception as exc:
            await session.rollback()
            await _mark_job_failed(session, job_id, str(exc) or '后台任务执行失败')


# 将未完成任务标记为失败，避免服务重启后状态长期悬挂。
async def recover_unfinished_ingest_jobs() -> None:
    async with SessionLocal() as session:
        jobs = await list_unfinished_ingest_jobs(session)
        if not jobs:
            return

        for job in jobs:
            job.status = 'failed'
            job.error_message = '服务重启导致任务中断，请重新上传'
        await session.commit()


# 读取任务状态，并还原为前端可直接展示的结构。
def build_ingest_job_status(job: PdfIngestJob) -> dict[str, str | int | None | list[dict[str, str | int | list[int] | None]]]:
    result_payload = json.loads(job.result_payload) if job.result_payload else {}
    return {
        'jobId': job.id,
        'pdfId': job.pdf_id,
        'fileName': job.file_name,
        'status': job.status,
        'errorMessage': job.error_message,
        'totalPages': result_payload.get('totalPages'),
        'totalHits': result_payload.get('totalHits'),
        'items': result_payload.get('items', [])
    }


# 更新任务失败状态。
async def _mark_job_failed(session: AsyncSession, job_id: str, error_message: str) -> None:
    job = await get_ingest_job_by_id(session, job_id)
    if not job:
        return

    job.status = 'failed'
    job.error_message = error_message
    await session.commit()
