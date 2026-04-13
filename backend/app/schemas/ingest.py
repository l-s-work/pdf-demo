from pydantic import BaseModel, Field


# 本地 PDF 入库请求结构。
class IngestRequest(BaseModel):
    localPath: str = Field(description='本地 PDF 文件绝对路径')
    keywords: list[str] = Field(default_factory=list, description='待提取关键词列表')


# 单个关键词的命中页码汇总结构。
class IngestKeywordSummary(BaseModel):
    keyword: str
    pageNums: list[int]
    hitCount: int


# 浏览器上传 PDF 后的返回结构。
class IngestUploadResult(BaseModel):
    pdfId: str
    fileName: str
    totalPages: int
    totalHits: int
    keywordSummaries: list[IngestKeywordSummary]
