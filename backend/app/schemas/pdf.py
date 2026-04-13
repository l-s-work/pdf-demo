from pydantic import BaseModel


# 每页尺寸信息。
class PdfPageSizeItem(BaseModel):
    pageNum: int
    width: float
    height: float
    rotation: int


# 轻量索引返回结构。
class PdfMetaData(BaseModel):
    pdfId: str
    totalPages: int
    fileSize: int
    isLinearized: bool
    pageSizeList: list[PdfPageSizeItem]
