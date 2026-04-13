import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import type { HighlightHitItem } from '../../types/pdf';
import type { ViewportRect } from '../../components/pdf/HighlightOverlay';

// 将后端返回的 PDF 原始坐标转换为前端可绘制的视口矩形。
export function toViewportRect(viewport: PageViewport, activeHit: HighlightHitItem): ViewportRect {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    activeHit.x,
    activeHit.y,
    activeHit.x + activeHit.w,
    activeHit.y + activeHit.h
  ]);

  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}
