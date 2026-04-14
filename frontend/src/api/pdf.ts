import { requestClient, type RequestOptions } from './http';
import type {
  ApiResponse,
  ManualHighlightInputItem,
  PdfMetaData,
  PdfPreviewSourceMode,
  PdfPreviewUrlResult,
  PdfUploadJobCreateResult
} from '../types/pdf';

// 按文档 ID 获取轻量索引，用于计算每页尺寸和虚拟滚动。
export async function fetchPdfMeta(pdfId: string, options?: RequestOptions): Promise<PdfMetaData> {
  const response = await requestClient.get<ApiResponse<PdfMetaData>>(`/api/pdf/${pdfId}/meta`, options);
  return response.data;
}


// 获取 PDF 预览地址，优先返回 OSS 签名直链。
export async function fetchPdfPreviewUrl(
  pdfId: string,
  previewSource: PdfPreviewSourceMode = 'auto',
  options?: RequestOptions
): Promise<PdfPreviewUrlResult> {
  const response = await requestClient.get<ApiResponse<PdfPreviewUrlResult>>(`/api/pdf/${pdfId}/preview-url`, {
    ...options,
    params: {
      ...(options?.params ?? {}),
      previewSource
    }
  });
  return response.data;
}


// 创建 PDF 上传任务，并立即返回任务 ID。
export async function createPdfUploadJob(
  file: File,
  items: ManualHighlightInputItem[] = [],
  uploadToOss = true,
  options?: RequestOptions<FormData>
): Promise<PdfUploadJobCreateResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadToOss', String(uploadToOss));
  if (items.length > 0) {
    formData.append('items', JSON.stringify(items));
  }

  const response = await requestClient.post<ApiResponse<PdfUploadJobCreateResult>, FormData>('/api/pdf/upload', formData, options);
  return response.data;
}


// 给已上传文档追加手工页码关键词测试项。
export async function appendManualHits(
  pdfId: string,
  items: ManualHighlightInputItem[],
  uploadToOss = true,
  options?: RequestOptions<{ items: ManualHighlightInputItem[]; uploadToOss: boolean }>
): Promise<PdfUploadJobCreateResult> {
  const response = await requestClient.post<ApiResponse<PdfUploadJobCreateResult>, { items: ManualHighlightInputItem[]; uploadToOss: boolean }>(
    `/api/pdf/${pdfId}/manual-hits`,
    { items, uploadToOss },
    options
  );
  return response.data;
}
