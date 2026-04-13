import type { HighlightHitItem } from '../../types/pdf';

// 路由 state 中携带的结构定义。
export interface PdfViewerLocationState {
  hit?: HighlightHitItem;
}
