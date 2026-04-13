from pathlib import Path
from uuid import uuid4

import fitz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import PDF_DIR
from app.models import PdfDocument, PdfHighlightHit, PdfPageMeta


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

    target_path = PDF_DIR / source_pdf.name
    if not target_path.exists():
        target_path.write_bytes(source_pdf.read_bytes())

    doc_id = 'doc_test_pdf'
    pymu_doc = fitz.open(target_path)

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
    for index in range(pymu_doc.page_count):
        page = pymu_doc[index]
        rect = page.rect

        # 写入每页尺寸信息。
        session.add(
            PdfPageMeta(
                pdf_id=doc_id,
                page_num=index + 1,
                width=float(rect.width),
                height=float(rect.height),
                rotation=int(page.rotation)
            )
        )

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
