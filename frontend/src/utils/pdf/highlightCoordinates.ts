import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import type { HighlightHitItem } from '../../types/pdf';
import type { ViewportRect } from '../../components/pdf/HighlightOverlay';

// 将后端返回的 PDF 原始坐标转换为前端可绘制的视口矩形。
export function toViewportRect(viewport: PageViewport, activeHit: HighlightHitItem): ViewportRect {
  // 后端（PyMuPDF）使用左上角为原点，pdf.js convertToViewportRectangle 使用左下角为原点。
  // 因此先将 y 坐标转换到 PDF 用户空间，再交给 viewport 做缩放与旋转映射。
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const pdfX0 = activeHit.x;
  const pdfY0 = pageHeight - (activeHit.y + activeHit.h);
  const pdfX1 = activeHit.x + activeHit.w;
  const pdfY1 = pageHeight - activeHit.y;

  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    pdfX0,
    pdfY0,
    pdfX1,
    pdfY1
  ]);

  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}
