import { requestClient, type RequestOptions } from './http';
import type { ApiResponse, PdfMetaData, PdfUploadResult } from '../types/pdf';

// 按文档 ID 获取轻量索引，用于计算每页尺寸和虚拟滚动。
export async function fetchPdfMeta(pdfId: string, options?: RequestOptions): Promise<PdfMetaData> {
  const response = await requestClient.get<ApiResponse<PdfMetaData>>(`/api/pdf/${pdfId}/meta`, options);
  return response.data;
}


// 上传 PDF 并触发后端提取命中结果。
export async function uploadPdf(file: File, keywords: string, options?: RequestOptions<FormData>): Promise<PdfUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('keywords', keywords);

  const response = await requestClient.post<ApiResponse<PdfUploadResult>, FormData>('/api/pdf/upload', formData, options);
  return response.data;
}
