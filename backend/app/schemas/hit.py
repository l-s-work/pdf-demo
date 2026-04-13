from pydantic import BaseModel


# 命中列表单项（per-hit）结构。
class HighlightHitItem(BaseModel):
    hitId: str
    pdfId: str
    fileName: str
    previewUrl: str
    pageNum: int
    keyword: str
    x: float
    y: float
    w: float
    h: float
    groupId: str | None = None


# 命中分页数据结构。
class HighlightHitPage(BaseModel):
    page: int
    pageSize: int
    total: int
    items: list[HighlightHitItem]
