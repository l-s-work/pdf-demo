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
    return (ENV_VALUES.get(name, default) or '').strip()


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


# 判断 OSS 关键配置是否已准备完成。
def is_oss_ready() -> bool:
    return (
        OSS_ENABLED
        and bool(OSS_ENDPOINT)
        and bool(OSS_BUCKET_NAME)
        and bool(OSS_ACCESS_KEY_ID)
        and bool(OSS_ACCESS_KEY_SECRET)
    )
