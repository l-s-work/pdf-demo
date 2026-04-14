from pathlib import Path

from app.core.database import PDF_DIR


def build_pdf_storage_path(doc_id: str, file_name: str) -> Path:
    return PDF_DIR / f'{doc_id}_{Path(file_name).name}'


# 将源 PDF 复制到后端存储目录，并返回目标路径。
def copy_pdf_to_storage(doc_id: str, source_path: Path) -> Path:
    target_path = build_pdf_storage_path(doc_id, source_path.name)
    target_path.write_bytes(source_path.read_bytes())
    return target_path


# 将上传的 PDF 二进制内容写入存储目录，并返回目标路径。
def save_pdf_bytes_to_storage(doc_id: str, file_name: str, file_bytes: bytes) -> Path:
    target_path = build_pdf_storage_path(doc_id, file_name)
    target_path.write_bytes(file_bytes)
    return target_path
