from pathlib import Path

import fitz


# 打开 PDF 文档对象。
def open_pdf_document(file_path: Path) -> fitz.Document:
    return fitz.open(file_path)


# 提取所有页尺寸与旋转信息。
def extract_page_meta(pdf_doc: fitz.Document) -> list[dict[str, float | int]]:
    items: list[dict[str, float | int]] = []
    for index in range(pdf_doc.page_count):
        page = pdf_doc[index]
        rect = page.rect
        items.append({
            'page_num': index + 1,
            'width': float(rect.width),
            'height': float(rect.height),
            'rotation': int(page.rotation)
        })
    return items


# 按关键词提取每个矩形命中，满足 per-hit 单位置设计。
def extract_keyword_hits(pdf_doc: fitz.Document, keywords: list[str]) -> list[dict[str, float | int | str | None]]:
    hit_items: list[dict[str, float | int | str | None]] = []
    for index in range(pdf_doc.page_count):
        page = pdf_doc[index]
        for keyword in keywords:
            for hit_rect in page.search_for(keyword):
                hit_items.append({
                    'page_num': index + 1,
                    'keyword': keyword,
                    'x': float(hit_rect.x0),
                    'y': float(hit_rect.y0),
                    'w': float(hit_rect.width),
                    'h': float(hit_rect.height),
                    'group_id': None
                })
    return hit_items
