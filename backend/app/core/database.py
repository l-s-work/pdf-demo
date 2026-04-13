from pathlib import Path
from typing import AsyncIterator

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


# 统一数据库会话依赖。
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
