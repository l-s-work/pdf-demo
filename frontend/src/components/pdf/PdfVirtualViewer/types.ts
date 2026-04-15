import type { HighlightHitItem, PdfMetaData } from '../../../types/pdf';
import type { ViewportRect } from '../HighlightOverlay';

// 主 Viewer 组件属性。
export interface PdfVirtualViewerProps {
  pdfId: string;
  pdfUrl: string;
  meta: PdfMetaData;
  viewerWidth?: number;
  activeHits?: HighlightHitItem[];
  targetPageNum?: number;
}

// 单页 Canvas 组件属性。
export interface PdfPageCanvasProps {
  pageNum: number;
  scale: number;
  warmupPage: (pageNum: number) => Promise<import('pdfjs-dist/types/src/display/api').PDFPageProxy | null>;
  activeHits?: HighlightHitItem[];
  onPageMeasured?: (pageNum: number, width: number, height: number) => void;
  onPrimaryHighlightReady?: (pageNum: number, rect: ViewportRect) => void;
  onPageReady?: (pageNum: number) => void;
}
