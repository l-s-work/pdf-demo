import { requestClient, type RequestOptions } from './http';
import type { ApiResponse, HighlightHitItem, HighlightHitPage } from '../types/pdf';

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

// 获取同一 groupId 下的全部命中，用于预览页恢复连贯高亮效果。
export async function fetchHighlightGroupHits(groupId: string, options?: RequestOptions): Promise<HighlightHitItem[]> {
  const response = await requestClient.get<ApiResponse<HighlightHitItem[]>>(`/api/highlight-groups/${groupId}`, options);
  return response.data;
}
