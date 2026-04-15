from pathlib import Path
from uuid import uuid4

import fitz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PdfDocument, PdfHighlightHit, PdfPageMeta
from app.utils.file_utils import copy_pdf_to_storage


# 初始化演示数据，方便本地直接联调。
async def bootstrap_demo_data(session: AsyncSession) -> None:
    exists_stmt = select(PdfDocument.id).limit(1)
    exists = (await session.execute(exists_stmt)).first()
    if exists:
        return

    workspace_root = Path(__file__).resolve().parents[3]
    source_pdf = workspace_root / 'test.pdf'
    if not source_pdf.exists():
        return

    target_path = copy_pdf_to_storage('doc_test_pdf', source_pdf)

    doc_id = 'doc_test_pdf'
    pymu_doc = fitz.open(target_path)
    try:
        document = PdfDocument(
            id=doc_id,
            file_path=str(target_path.resolve()),
            file_name=target_path.name,
            total_pages=pymu_doc.page_count,
            file_size=target_path.stat().st_size,
            is_linearized=1
        )
        session.add(document)

        hit_count = 0
        first_page = pymu_doc[0] if pymu_doc.page_count > 0 else None
        if first_page is not None:
            first_rect = first_page.rect
            # 启动演示数据同样只写第一页尺寸，其他页由前端渲染时逐步纠偏。
            session.add(
                PdfPageMeta(
                    pdf_id=doc_id,
                    page_num=1,
                    width=float(first_rect.width),
                    height=float(first_rect.height),
                    rotation=int(first_page.rotation)
                )
            )

        for index in range(pymu_doc.page_count):
            page = pymu_doc[index]

            # 以 test 关键词做示例提取（每个矩形作为单条 per-hit）。
            for hit_rect in page.search_for('test'):
                hit_count += 1
                session.add(
                    PdfHighlightHit(
                        id=f'hit_{uuid4().hex[:16]}',
                        pdf_id=doc_id,
                        page_num=index + 1,
                        keyword='test',
                        x=float(hit_rect.x0),
                        y=float(hit_rect.y0),
                        w=float(hit_rect.width),
                        h=float(hit_rect.height),
                        group_id=None
                    )
                )

        # 若未检索到命中，则写入一个演示命中位置。
        if hit_count == 0:
            session.add(
                PdfHighlightHit(
                    id=f'hit_{uuid4().hex[:16]}',
                    pdf_id=doc_id,
                    page_num=1,
                    keyword='示例关键词',
                    x=100.0,
                    y=100.0,
                    w=80.0,
                    h=16.0,
                    group_id=None
                )
            )

        await session.commit()
    finally:
        pymu_doc.close()
