from pathlib import Path

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import is_oss_ready
from app.models import PdfDocument
from app.utils.file_utils import ensure_linearized_pdf_file
from app.utils.oss_utils import download_pdf_file_from_oss, resolve_pdf_object_key, upload_pdf_file_to_oss


# 归一化存量 PDF 文件，确保本地与 OSS 都保存线性化版本。
async def normalize_pdf_storage(session: AsyncSession) -> None:
    document_stmt = select(PdfDocument).order_by(PdfDocument.created_at.asc(), PdfDocument.id.asc())
    documents = list((await session.execute(document_stmt)).scalars().all())
    if not documents:
        return

    has_updates = False
    for document in documents:
        file_path = Path(document.file_path)
        if not file_path.exists():
            if not is_oss_ready():
                continue

            object_key = resolve_pdf_object_key(document.id, document.file_name, document.oss_object_key)
            try:
                await run_in_threadpool(download_pdf_file_from_oss, object_key, file_path)
            except Exception:
                continue

        try:
            was_linearized = ensure_linearized_pdf_file(file_path)
        except Exception:
            continue

        file_size = file_path.stat().st_size
        document.file_path = str(file_path.resolve())
        if document.file_size != file_size:
            document.file_size = file_size
            has_updates = True
        if document.is_linearized != 1:
            document.is_linearized = 1
            has_updates = True
        if was_linearized:
            has_updates = True

        if is_oss_ready():
            object_key = resolve_pdf_object_key(document.id, document.file_name, document.oss_object_key)
            if not document.oss_object_key:
                document.oss_object_key = object_key
                has_updates = True

            try:
                # 直接覆盖同名对象，确保 OSS 中的副本也同步成线性化版本。
                await run_in_threadpool(upload_pdf_file_to_oss, document.id, document.file_name, file_path)
            except Exception:
                # 本地文件已经完成线性化，OSS 同步失败交给后续访问重试。
                continue

    if has_updates:
        await session.commit()
