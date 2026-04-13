from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ORM 基类。
class Base(DeclarativeBase):
    pass


# PDF 文档主表。
class PdfDocument(Base):
    __tablename__ = 'pdf_documents'

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_pages: Mapped[int] = mapped_column(Integer, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    is_linearized: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    page_meta: Mapped[list['PdfPageMeta']] = relationship(back_populates='document', cascade='all, delete-orphan')
    hits: Mapped[list['PdfHighlightHit']] = relationship(back_populates='document', cascade='all, delete-orphan')


# PDF 页元信息表。
class PdfPageMeta(Base):
    __tablename__ = 'pdf_page_meta'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pdf_id: Mapped[str] = mapped_column(String(64), ForeignKey('pdf_documents.id'), index=True, nullable=False)
    page_num: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    height: Mapped[float] = mapped_column(Float, nullable=False)
    rotation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    document: Mapped['PdfDocument'] = relationship(back_populates='page_meta')


# per-hit 命中表，每条只记录一个高亮位置。
class PdfHighlightHit(Base):
    __tablename__ = 'pdf_highlight_hits'

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pdf_id: Mapped[str] = mapped_column(String(64), ForeignKey('pdf_documents.id'), index=True, nullable=False)
    page_num: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    keyword: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    w: Mapped[float] = mapped_column(Float, nullable=False)
    h: Mapped[float] = mapped_column(Float, nullable=False)
    group_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    document: Mapped['PdfDocument'] = relationship(back_populates='hits')


# PDF 上传提取任务表。
class PdfIngestJob(Base):
    __tablename__ = 'pdf_ingest_jobs'

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pdf_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default='pending')
    request_payload: Mapped[str] = mapped_column(String, nullable=False)
    result_payload: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
