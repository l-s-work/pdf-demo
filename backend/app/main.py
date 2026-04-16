import logging

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.api import hits_router, pdf_file_router, pdf_ingest_router, pdf_meta_router
from app.core.database import engine, ensure_schema_compatibility
from app.models import Base
from app.services.ingest_job_service import recover_unfinished_ingest_jobs
from app.utils.pdf_extract import warmup_ocr_engine

app = FastAPI(title='PDF 高亮定位后端', version='0.1.0')
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
    allow_credentials=True,
    expose_headers=['Accept-Ranges', 'Content-Length', 'Content-Range', 'ETag']
)

app.include_router(hits_router)
app.include_router(pdf_meta_router)
app.include_router(pdf_file_router)
app.include_router(pdf_ingest_router)


@app.on_event('startup')
async def on_startup() -> None:
    # 启动时自动建表，并把存量 PDF 统一归一化为线性化版本。
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    await ensure_schema_compatibility()
    await recover_unfinished_ingest_jobs()
    try:
        await run_in_threadpool(warmup_ocr_engine)
    except Exception as exc:
        logger.warning('OCR 预热失败，扫描件命中将暂时不可用: %s', exc)


@app.get('/health')
async def health() -> dict[str, str]:
    # 提供基础健康检查接口。
    return {'status': 'ok'}
