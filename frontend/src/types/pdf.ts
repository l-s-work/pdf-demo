// 列表单条命中（per-hit）类型，每项只对应一个固定高亮位置。
export interface HighlightHitItem {
  hitId: string;
  pdfId: string;
  fileName: string;
  previewUrl: string;
  status: string;
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
  hasPendingJobs: boolean;
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
  ossObjectKey?: string | null;
  // 仅保证包含第一页尺寸，其余页在前端渲染时逐步纠偏。
  pageSizeList: PageSizeItem[];
}

// 浏览器上传时录入的手工命中配置。
export interface ManualHighlightInputItem {
  pageNum: number;
  keyword: string;
}

// 浏览器上传任务创建结果。
export interface PdfUploadJobCreateResult {
  jobId: string;
  pdfId: string;
  status: string;
}

// 单条手工命中配置的处理结果。
export interface PdfUploadJobResultItem {
  keyword: string;
  inputPageNum: number;
  matchedPageNums: number[];
  hitCount: number;
  status: string;
  groupId?: string | null;
  anchorHitId?: string | null;
  anchorPageNum?: number | null;
}

// 浏览器上传任务状态结果。
export interface PdfUploadJobStatusResult {
  jobId: string;
  pdfId: string;
  fileName: string;
  status: string;
  errorMessage?: string | null;
  totalPages?: number | null;
  totalHits?: number | null;
  items: PdfUploadJobResultItem[];
}

// PDF 预览地址（优先 OSS 直链）。
export interface PdfPreviewUrlResult {
  previewUrl: string;
  source: string;
}

// 预览来源模式：自动、强制本地代理、强制 OSS 直连。
export type PdfPreviewSourceMode = 'auto' | 'local' | 'oss';

// 统一响应包装类型。
export interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}
