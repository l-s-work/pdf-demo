from .hits import router as hits_router
from .pdf_file import router as pdf_file_router
from .pdf_ingest import router as pdf_ingest_router
from .pdf_meta import router as pdf_meta_router

__all__ = ['hits_router', 'pdf_meta_router', 'pdf_file_router', 'pdf_ingest_router']
