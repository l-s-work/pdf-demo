import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import type { HighlightHitItem } from '../../types/pdf';
import type { ViewportRect } from '../../components/pdf/HighlightOverlay';

// 将后端返回的原始坐标（PyMuPDF：左上角原点）转换为前端可绘制的视口矩形。
export function toViewportRect(viewport: PageViewport, activeHit: HighlightHitItem): ViewportRect {
  // 后端返回的是 PyMuPDF 原始坐标：当前页可视区域（crop 后）左上角原点。
  // pdf.js convertToViewportRectangle 需要“PDF 用户空间（左下角原点）坐标”，
  // 且该坐标要包含 viewBox 的 x/y 偏移（有些页 cropBox 不是从 0,0 开始）。
  const [viewX0, viewY0, viewX1, viewY1] = viewport.viewBox;
  const pageHeight = viewY1 - viewY0;

  const localX0 = activeHit.x;
  const localY0 = activeHit.y;
  const localX1 = activeHit.x + activeHit.w;
  const localY1 = activeHit.y + activeHit.h;

  const pdfX0 = viewX0 + localX0;
  const pdfX1 = viewX0 + localX1;
  const pdfY0 = viewY0 + (pageHeight - localY1);
  const pdfY1 = viewY0 + (pageHeight - localY0);

  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([pdfX0, pdfY0, pdfX1, pdfY1]);

  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}
