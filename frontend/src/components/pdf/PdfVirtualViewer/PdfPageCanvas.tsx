import { useEffect, useRef, useState } from 'react';
import type { ViewportRect } from '../HighlightOverlay';
import HighlightOverlay from '../HighlightOverlay';
import { toViewportRect } from '../../../utils/pdf/highlightCoordinates';
import { StyledCanvas, StyledPageFrame } from './styles';
import type { PdfPageCanvasProps } from './types';

// 单页渲染组件：负责绘制页面 Canvas，并在命中页渲染高亮框。
export default function PdfPageCanvas({ pageNum, scale, warmupPage, activeHits }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [highlightRects, setHighlightRects] = useState<ViewportRect[]>([]);

  useEffect(() => {
    let disposed = false;

    async function renderPage() {
      const canvasElement = canvasRef.current;
      if (!canvasElement) {
        return;
      }

      const page = await warmupPage(pageNum);
      if (!page || disposed) {
        return;
      }

      const viewport = page.getViewport({ scale });
      const context = canvasElement.getContext('2d');
      if (!context) {
        return;
      }

      canvasElement.width = Math.floor(viewport.width);
      canvasElement.height = Math.floor(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;

      if (disposed) {
        return;
      }

      const pageHits = (activeHits ?? []).filter((item) => item.pageNum === pageNum);
      setHighlightRects(pageHits.map((item) => toViewportRect(viewport, item)));
    }

    void renderPage();
    return () => {
      // 阻止异步结果在组件卸载后继续回写。
      disposed = true;
    };
  }, [activeHits, pageNum, scale, warmupPage]);

  return (
    <StyledPageFrame>
      <StyledCanvas ref={canvasRef} />
      {highlightRects.map((rect, index) => (
        <HighlightOverlay key={`${pageNum}-${index}-${rect.left}-${rect.top}`} rect={rect} />
      ))}
    </StyledPageFrame>
  );
}
