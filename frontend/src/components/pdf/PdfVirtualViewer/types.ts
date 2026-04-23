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
  targetAnchorKey?: string;
  preferStreaming?: boolean;
  onCurrentPageChange?: (page: number) => void;
}

// 单页 Canvas 组件属性。
export interface PdfPageCanvasProps {
  pdfId: string;
  pageNum: number;
  scale: number;
  isDocumentReady: boolean;
  pageWidth: number;
  pageHeight: number;
  warmupPage: (
    pageNum: number
  ) => Promise<import('pdfjs-dist/types/src/display/api').PDFPageProxy | null>;
  activeHits?: HighlightHitItem[];
  onPageMeasured?: (pageNum: number, width: number, height: number) => void;
  onPrimaryHighlightReady?: (pageNum: number, rect: ViewportRect) => void;
}
