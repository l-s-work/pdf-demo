from pathlib import Path

import oss2

from app.core.settings import (
    OSS_ACCESS_KEY_ID,
    OSS_ACCESS_KEY_SECRET,
    OSS_BUCKET_NAME,
    OSS_ENDPOINT,
    OSS_OBJECT_PREFIX,
    OSS_SIGN_EXPIRES_SECONDS,
    is_oss_ready
)


# 规范化 OSS endpoint，兼容未带协议前缀的配置。
def normalize_oss_endpoint(endpoint: str) -> str:
    if endpoint.startswith('http://') or endpoint.startswith('https://'):
        return endpoint
    return f'https://{endpoint}'


# 基于文档 ID 与文件名生成原始文件对象键。
def build_source_object_key(pdf_id: str, file_name: str) -> str:
    safe_file_name = Path(file_name).name or 'uploaded.pdf'
    return f'{OSS_OBJECT_PREFIX}/original/{pdf_id}/{safe_file_name}'


# 基于文档 ID 生成线性化后的预览 PDF 对象键。
def build_derived_pdf_object_key(pdf_id: str, revision: int = 1) -> str:
    return f'{OSS_OBJECT_PREFIX}/derived/{pdf_id}/{revision}.pdf'


# 基于文档 ID、版本和页码生成页面预览图对象键。
def build_page_preview_object_key(pdf_id: str, page_num: int, revision: int = 1) -> str:
    return f'{OSS_OBJECT_PREFIX}/preview/{pdf_id}/{revision}/page-{page_num}.png'


# 优先使用已存储对象键，不存在时回退到原始文件对象键。
def resolve_pdf_object_key(pdf_id: str, file_name: str, stored_object_key: str | None = None) -> str:
    if stored_object_key and stored_object_key.strip():
        return stored_object_key.strip()

    return build_source_object_key(pdf_id, file_name)


# 创建 OSS Bucket 客户端实例。
def create_oss_bucket() -> oss2.Bucket:
    auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
    return oss2.Bucket(auth, normalize_oss_endpoint(OSS_ENDPOINT), OSS_BUCKET_NAME)


# 上传文件到 OSS，并返回对象键。
def upload_file_to_oss(object_key: str, file_path: Path, content_type: str = 'application/octet-stream') -> str:
    if not is_oss_ready():
        raise RuntimeError('OSS 未配置完成，请检查 OSS_ENABLED / endpoint / bucket / AK / SK')

    if not file_path.exists():
        raise FileNotFoundError(f'待上传文件不存在: {file_path}')

    bucket = create_oss_bucket()
    with file_path.open('rb') as file_obj:
        bucket.put_object(
            object_key,
            file_obj,
            headers={'Content-Type': content_type}
        )
    return object_key


# 直接将文件流上传到 OSS，并返回对象键。
def upload_stream_to_oss(object_key: str, file_obj, content_type: str = 'application/octet-stream') -> str:
    if not is_oss_ready():
        raise RuntimeError('OSS 未配置完成，请检查 OSS_ENABLED / endpoint / bucket / AK / SK')

    bucket = create_oss_bucket()
    bucket.put_object(
        object_key,
        file_obj,
        headers={'Content-Type': content_type}
    )
    return object_key


# 直接将字节内容上传到 OSS，并返回对象键。
def upload_bytes_to_oss(object_key: str, payload: bytes, content_type: str = 'application/octet-stream') -> str:
    if not is_oss_ready():
        raise RuntimeError('OSS 未配置完成，请检查 OSS_ENABLED / endpoint / bucket / AK / SK')

    bucket = create_oss_bucket()
    bucket.put_object(
        object_key,
        payload,
        headers={'Content-Type': content_type}
    )
    return object_key


# 兼容旧代码的 PDF 上传包装器。
def upload_pdf_file_to_oss(pdf_id: str, file_name: str, file_path: Path) -> str:
    object_key = build_source_object_key(pdf_id, file_name)
    return upload_file_to_oss(object_key, file_path, content_type='application/pdf')


# 检查目标对象在 OSS 中是否存在。
def object_exists_in_oss(object_key: str) -> bool:
    if not is_oss_ready():
        return False

    bucket = create_oss_bucket()
    return bool(bucket.object_exists(object_key))


# 生成对象的临时签名下载链接。
def build_signed_get_url(object_key: str, expires_seconds: int | None = None) -> str:
    if not is_oss_ready():
        raise RuntimeError('OSS 未配置完成，无法生成签名链接')

    bucket = create_oss_bucket()
    return bucket.sign_url(
        'GET',
        object_key,
        expires_seconds if expires_seconds and expires_seconds > 0 else OSS_SIGN_EXPIRES_SECONDS
    )


# 从 OSS 下载文件到本地目标路径。
def download_oss_object_to_file(object_key: str, target_path: Path) -> Path:
    if not is_oss_ready():
        raise RuntimeError('OSS 未配置完成，无法下载文件')

    bucket = create_oss_bucket()
    target_path.parent.mkdir(parents=True, exist_ok=True)
    bucket.get_object_to_file(object_key, str(target_path))
    return target_path


# 兼容旧代码的 PDF 下载包装器。
def download_pdf_file_from_oss(object_key: str, target_path: Path) -> Path:
    return download_oss_object_to_file(object_key, target_path)
