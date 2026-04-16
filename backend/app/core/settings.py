import os
from pathlib import Path

from dotenv import dotenv_values


BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE_PATH = BACKEND_ROOT / '.env'
ENV_VALUES = {
    str(key): str(value)
    for key, value in dotenv_values(ENV_FILE_PATH).items()
    if key and value is not None
}


# 读取环境变量字符串并做去空白处理。
def _get_env_value(name: str, default: str = '') -> str:
    return (os.environ.get(name, ENV_VALUES.get(name, default)) or '').strip()


# 将环境变量值转换为布尔值。
def _to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default

    return value.strip().lower() in {'1', 'true', 'yes', 'y', 'on'}


# 对象存储配置（阿里云 OSS）。
OSS_ENABLED = _to_bool(_get_env_value('OSS_ENABLED'), default=False)
OSS_ENDPOINT = _get_env_value('OSS_ENDPOINT')
OSS_BUCKET_NAME = _get_env_value('OSS_BUCKET_NAME')
OSS_ACCESS_KEY_ID = _get_env_value('OSS_ACCESS_KEY_ID')
OSS_ACCESS_KEY_SECRET = _get_env_value('OSS_ACCESS_KEY_SECRET')
OSS_OBJECT_PREFIX = _get_env_value('OSS_OBJECT_PREFIX', 'pdf').strip('/')
try:
    OSS_SIGN_EXPIRES_SECONDS = int(_get_env_value('OSS_SIGN_EXPIRES_SECONDS', '1800'))
except ValueError:
    OSS_SIGN_EXPIRES_SECONDS = 1800


# OCR 处理配置，供扫描件命中时兜底使用。
OCR_LANGUAGE = _get_env_value('OCR_LANGUAGE', 'ch').strip() or 'ch'
OCR_CACHE_DIR = _get_env_value(
    'PADDLE_PDX_CACHE_HOME',
    _get_env_value('PADDLE_OCR_BASE_DIR', str(BACKEND_ROOT / 'storage' / 'paddlex-cache'))
).strip()
OCR_CACHE_PATH = Path(OCR_CACHE_DIR)
if not OCR_CACHE_PATH.is_absolute():
    OCR_CACHE_PATH = (BACKEND_ROOT / OCR_CACHE_PATH).resolve()

OCR_CACHE_PATH.mkdir(parents=True, exist_ok=True)
OCR_CACHE_DIR = str(OCR_CACHE_PATH)
os.environ.setdefault('PADDLE_PDX_CACHE_HOME', OCR_CACHE_DIR)
os.environ.setdefault('PADDLE_OCR_BASE_DIR', OCR_CACHE_DIR)
os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')
try:
    OCR_DPI = int(_get_env_value('OCR_DPI', '150'))
except ValueError:
    OCR_DPI = 150


# worker 开发态热重载开关，仅用于本地调试。
WORKER_RELOAD = _to_bool(_get_env_value('WORKER_RELOAD'), default=False)
WORKER_RELOAD_PATHS = _get_env_value('WORKER_RELOAD_PATHS', str(BACKEND_ROOT / 'app'))


# 判断 OSS 关键配置是否已准备完成。
def is_oss_ready() -> bool:
    return (
        OSS_ENABLED
        and bool(OSS_ENDPOINT)
        and bool(OSS_BUCKET_NAME)
        and bool(OSS_ACCESS_KEY_ID)
        and bool(OSS_ACCESS_KEY_SECRET)
    )
