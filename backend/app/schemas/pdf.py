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
    ossObjectKey: str | None = None
    pageSizeList: list[PdfPageSizeItem]


# 预览地址信息（优先 OSS 签名直链，失败时回退后端代理）。
class PdfPreviewUrlData(BaseModel):
    previewUrl: str
    source: str
