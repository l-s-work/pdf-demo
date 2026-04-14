from pathlib import Path
from typing import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# 定义存储目录与数据库路径。
BACKEND_ROOT = Path(__file__).resolve().parents[2]
STORAGE_DIR = BACKEND_ROOT / 'storage'
PDF_DIR = STORAGE_DIR / 'pdf'
DB_PATH = STORAGE_DIR / 'app.db'

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
PDF_DIR.mkdir(parents=True, exist_ok=True)

# 创建异步 SQLite 引擎。
DATABASE_URL = f'sqlite+aiosqlite:///{DB_PATH.as_posix()}'
engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def ensure_schema_compatibility() -> None:
    # 对历史 SQLite 库做最小兼容迁移，避免手动删库。
    async with engine.begin() as connection:
        table_exists_result = await connection.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_documents'")
        )
        if not table_exists_result.first():
            return

        table_info_result = await connection.execute(text("PRAGMA table_info('pdf_documents')"))
        existing_columns = {str(row[1]) for row in table_info_result.fetchall()}
        if 'oss_object_key' not in existing_columns:
            await connection.execute(text('ALTER TABLE pdf_documents ADD COLUMN oss_object_key VARCHAR(512)'))


# 统一数据库会话依赖。
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
