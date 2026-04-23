import type { HighlightHitItem } from '../../types/pdf';

// 路由 state 中携带的结构定义。
export interface PdfViewerLocationState {
  hit?: HighlightHitItem;
  comparePdfId?: string;
}

// 单个文档可参与对比的锚点项。
export interface ComparableHitItem {
  compareKey: string;
  occurrenceIndex: number;
  hit: HighlightHitItem;
}

// 侧边栏展示的跨文档对比点结构。
export interface ComparePointItem {
  compareKey: string;
  keyword: string;
  occurrenceIndex: number;
  primaryHit: HighlightHitItem;
  compareHit: HighlightHitItem | null;
}
