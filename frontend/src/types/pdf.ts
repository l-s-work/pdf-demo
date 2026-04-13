// 列表单条命中（per-hit）类型，每项只对应一个固定高亮位置。
export interface HighlightHitItem {
  hitId: string;
  pdfId: string;
  fileName: string;
  previewUrl: string;
  pageNum: number;
  keyword: string;
  x: number;
  y: number;
  w: number;
  h: number;
  groupId?: string | null;
}

// 命中分页结果类型。
export interface HighlightHitPage {
  page: number;
  pageSize: number;
  total: number;
  items: HighlightHitItem[];
}

// 单页尺寸元信息类型。
export interface PageSizeItem {
  pageNum: number;
  width: number;
  height: number;
  rotation: number;
}

// PDF 轻量索引类型，用于 Viewer 的虚拟渲染和跳页。
export interface PdfMetaData {
  pdfId: string;
  totalPages: number;
  fileSize: number;
  isLinearized: boolean;
  pageSizeList: PageSizeItem[];
}

// 上传后单个关键词的命中页码汇总。
export interface PdfUploadKeywordSummary {
  keyword: string;
  pageNums: number[];
  hitCount: number;
}

// 浏览器上传 PDF 后的返回结果。
export interface PdfUploadResult {
  pdfId: string;
  fileName: string;
  totalPages: number;
  totalHits: number;
  keywordSummaries: PdfUploadKeywordSummary[];
}

// 统一响应包装类型。
export interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}
