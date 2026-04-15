from pathlib import Path

import fitz

from app.core.database import PDF_DIR


def build_pdf_storage_path(doc_id: str, file_name: str) -> Path:
    return PDF_DIR / f'{doc_id}_{Path(file_name).name}'


# 将源 PDF 复制到后端存储目录，并返回目标路径。
def copy_pdf_to_storage(doc_id: str, source_path: Path) -> Path:
    target_path = build_pdf_storage_path(doc_id, source_path.name)
    target_path.write_bytes(source_path.read_bytes())
    ensure_linearized_pdf_file(target_path)
    return target_path


# 将上传的 PDF 二进制内容写入存储目录，并返回目标路径。
def save_pdf_bytes_to_storage(doc_id: str, file_name: str, file_bytes: bytes) -> Path:
    target_path = build_pdf_storage_path(doc_id, file_name)
    target_path.write_bytes(file_bytes)
    ensure_linearized_pdf_file(target_path)
    return target_path


# 判断本地 PDF 是否已经是可快速加载的线性化文件。
def is_pdf_linearized(file_path: Path) -> bool:
    if not file_path.exists():
        raise FileNotFoundError(f'PDF 文件不存在: {file_path}')

    pdf_doc = fitz.open(file_path)
    try:
        return bool(pdf_doc.is_fast_webaccess)
    finally:
        pdf_doc.close()


# 将本地 PDF 重新保存为线性化文件，返回是否发生了重写。
def ensure_linearized_pdf_file(file_path: Path) -> bool:
    if not file_path.exists():
        raise FileNotFoundError(f'PDF 文件不存在: {file_path}')

    temp_path = file_path.with_name(f'{file_path.name}.linearized.tmp')
    if temp_path.exists():
        temp_path.unlink()

    pdf_doc = fitz.open(file_path)
    try:
        # 通过完整重建再线性化，尽量修正可能存在的坏 linearization dictionary。
        pdf_doc.save(
            temp_path,
            garbage=4,
            clean=1,
            deflate=1,
            use_objstms=0,
            linear=1
        )
    finally:
        pdf_doc.close()

    temp_doc = fitz.open(temp_path)
    try:
        if not bool(temp_doc.is_fast_webaccess):
            raise RuntimeError(f'PDF 线性化失败: {file_path}')
    finally:
        temp_doc.close()

    temp_path.replace(file_path)
    return True
