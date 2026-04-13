from pydantic import BaseModel, Field


# 本地 PDF 入库请求结构。
class IngestRequest(BaseModel):
    localPath: str = Field(description='本地 PDF 文件绝对路径')
    keywords: list[str] = Field(default_factory=list, description='待提取关键词列表')


# 手工录入的高亮测试项。
class ManualHighlightInputItem(BaseModel):
    pageNum: int = Field(ge=1, description='期望命中的起始页码')
    keyword: str = Field(min_length=1, description='待定位的高亮关键词')


# 手工高亮测试批量请求结构。
class ManualHighlightBatchRequest(BaseModel):
    items: list[ManualHighlightInputItem] = Field(min_length=1, description='手工测试项列表')


# 浏览器上传任务创建返回结构。
class IngestJobCreateResult(BaseModel):
    jobId: str
    pdfId: str
    status: str


# 单个手工录入测试项的处理结果。
class IngestJobResultItem(BaseModel):
    keyword: str
    inputPageNum: int
    matchedPageNums: list[int]
    hitCount: int
    status: str
    groupId: str | None = None
    anchorHitId: str | None = None
    anchorPageNum: int | None = None


# 上传任务状态返回结构。
class IngestJobStatusResult(BaseModel):
    jobId: str
    pdfId: str
    fileName: str
    status: str
    errorMessage: str | None = None
    totalPages: int | None = None
    totalHits: int | None = None
    items: list[IngestJobResultItem] = Field(default_factory=list)
