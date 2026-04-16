from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi.concurrency import run_in_threadpool

from app.core.database import engine, ensure_schema_compatibility, SessionLocal
from app.core.settings import BACKEND_ROOT, WORKER_RELOAD, WORKER_RELOAD_PATHS
from app.models import Base
from app.repositories.pdf_repository import list_pending_ingest_jobs
from app.services.ingest_job_service import process_ingest_job, requeue_processing_ingest_jobs
from app.utils.pdf_extract import warmup_ocr_engine

logger = logging.getLogger(__name__)
POLL_INTERVAL_SECONDS = 2.0
BATCH_SIZE = 1


# 将 worker 运行路径解析为绝对路径，避免从不同目录启动时找不到监听目录。
def _resolve_worker_watch_paths() -> list[Path]:
    raw_paths = [item.strip() for item in WORKER_RELOAD_PATHS.split(',') if item.strip()]
    if not raw_paths:
        raw_paths = ['app']

    resolved_paths: list[Path] = []
    for raw_path in raw_paths:
        path = Path(raw_path)
        if not path.is_absolute():
            path = (BACKEND_ROOT / path).resolve()
        resolved_paths.append(path)

    return resolved_paths


# 初始化 worker 所需的数据库结构和 OCR 运行环境。
async def bootstrap_worker() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    await ensure_schema_compatibility()

    requeued_count = await requeue_processing_ingest_jobs()
    if requeued_count:
        logger.info('已将 %s 个处理中任务重新放回队列', requeued_count)

    try:
        await run_in_threadpool(warmup_ocr_engine)
    except Exception as exc:
        logger.warning('OCR 预热失败，扫描件任务仍可继续处理但可能更慢: %s', exc)


# 轮询 pending 任务并顺序执行，避免 OCR 进程占用 API 线程。
async def run_worker_loop() -> None:
    await bootstrap_worker()
    logger.info('worker 已启动，开始轮询待处理任务')

    while True:
        async with SessionLocal() as session:
            pending_jobs = await list_pending_ingest_jobs(session, limit=BATCH_SIZE)

        if not pending_jobs:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue

        for job in pending_jobs:
            logger.info('开始处理任务: job_id=%s pdf_id=%s', job.id, job.pdf_id)
            try:
                await process_ingest_job(job.id)
            except Exception as exc:
                logger.exception('任务执行异常: job_id=%s, error=%s', job.id, exc)


def run_worker_once() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker_loop())


def main() -> None:
    if not WORKER_RELOAD:
        run_worker_once()
        return

    try:
        from watchfiles import run_process
    except ImportError as exc:
        raise RuntimeError('启用 WORKER_RELOAD 需要安装 watchfiles 依赖') from exc

    watch_paths = _resolve_worker_watch_paths()
    logger.info('worker 已开启热重载，将监听: %s', ', '.join(str(path) for path in watch_paths))
    run_process(*watch_paths, target=run_worker_once, target_type='function')


if __name__ == '__main__':
    main()
