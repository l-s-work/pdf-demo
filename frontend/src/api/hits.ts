import { requestClient, type RequestOptions } from './http';
import type { ApiResponse, HighlightHitPage } from '../types/pdf';

// 命中列表查询参数类型。
export interface FetchHitsParams {
  page: number;
  pageSize: number;
  pdfId?: string;
  keyword?: string;
}

// 获取分页命中列表，用于列表页展示和跳转。
export async function fetchHighlightHits(params: FetchHitsParams, options?: RequestOptions): Promise<HighlightHitPage> {
  const response = await requestClient.get<ApiResponse<HighlightHitPage>>('/api/highlight-hits', {
    ...options,
    params
  });
  return response.data;
}
