import { useEffect, useMemo, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { ViewportRect } from '../HighlightOverlay';
import HighlightOverlay from '../HighlightOverlay';
import { resolveRequestUrl } from '../../../api/http';
import { toViewportRect } from '../../../utils/pdf/highlightCoordinates';
import {
  StyledCanvas,
  StyledPageFrame,
  StyledPagePreviewImage,
  StyledSelectionLayer,
  StyledSelectionRect,
  StyledTextLayer
} from './styles';
import type { PdfPageCanvasProps } from './types';

// 单页渲染组件：负责绘制页面 Canvas，并在命中页渲染高亮框。
export default function PdfPageCanvas({
  pdfId,
  pageNum,
  scale,
  isDocumentReady,
  pageWidth,
  pageHeight,
  pageRawWidth,
  pageRawHeight,
  warmupPage,
  activeHits,
  onPageMeasured,
  onPrimaryHighlightReady
}: PdfPageCanvasProps) {
  const pageFrameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const textLayerTaskRef = useRef<TextLayer | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [highlightRects, setHighlightRects] = useState<ViewportRect[]>([]);
  const [selectionRects, setSelectionRects] = useState<ViewportRect[]>([]);
  const [isPreviewImageReady, setIsPreviewImageReady] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const previewImageUrl = useMemo(() => {
    const normalizedScale = Math.max(0.1, Math.min(scale, 4));
    return resolveRequestUrl(
      `/api/pdf/${pdfId}/page-preview?pageNum=${pageNum}&scale=${normalizedScale.toFixed(4)}`
    );
  }, [pdfId, pageNum, scale]);

  // 预览阶段直接用页原始尺寸把命中坐标映射到当前展示尺寸，确保高亮先于 PDF 真正绘制出现。
  const previewHighlightRects = useMemo(() => {
    const pageHits = (activeHits ?? []).filter((item) => item.pageNum === pageNum);
    if (pageHits.length === 0) {
      return [];
    }

    const widthScale = pageRawWidth > 0 ? pageWidth / pageRawWidth : 1;
    const heightScale = pageRawHeight > 0 ? pageHeight / pageRawHeight : 1;

    return pageHits
      .map((item) => ({
        left: item.x * widthScale,
        top: item.y * heightScale,
        width: item.w * widthScale,
        height: item.h * heightScale
      }))
      .sort((left, right) => (left.top - right.top) || (left.left - right.left));
  }, [activeHits, pageHeight, pageNum, pageRawHeight, pageRawWidth, pageWidth]);

  function mergeSelectionRects(rects: ViewportRect[]): ViewportRect[] {
    const validRects = rects
      .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
      .sort((left, right) => (left.top - right.top) || (left.left - right.left));
    if (validRects.length === 0) {
      return [];
    }

    const area = (rect: ViewportRect) => rect.width * rect.height;
    const intersectionArea = (left: ViewportRect, right: ViewportRect) => {
      const overlapLeft = Math.max(left.left, right.left);
      const overlapTop = Math.max(left.top, right.top);
      const overlapRight = Math.min(left.left + left.width, right.left + right.width);
      const overlapBottom = Math.min(left.top + left.height, right.top + right.height);
      if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) {
        return 0;
      }
      return (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
    };
    const iou = (left: ViewportRect, right: ViewportRect) => {
      const overlap = intersectionArea(left, right);
      if (overlap <= 0) {
        return 0;
      }
      return overlap / (area(left) + area(right) - overlap);
    };

    // 第一步：去重（同位置多层 span 导致的重复 rect）。
    const dedupedRects: ViewportRect[] = [];
    for (const rect of validRects) {
      const duplicateIndex = dedupedRects.findIndex((item) => {
        const overlapRatio = iou(item, rect);
        if (overlapRatio >= 0.7) {
          return true;
        }

        const overlap = intersectionArea(item, rect);
        const minArea = Math.min(area(item), area(rect));
        return minArea > 0 && overlap / minArea >= 0.85;
      });

      if (duplicateIndex < 0) {
        dedupedRects.push({ ...rect });
        continue;
      }

      const duplicatedRect = dedupedRects[duplicateIndex];
      if (area(rect) > area(duplicatedRect)) {
        dedupedRects[duplicateIndex] = { ...rect };
      }
    }

    // 第二步：按行分组。
    type RectLine = {
      top: number;
      bottom: number;
      rects: ViewportRect[];
    };
    const lines: RectLine[] = [];

    for (const rect of dedupedRects) {
      const rectTop = rect.top;
      const rectBottom = rect.top + rect.height;
      const rectCenter = (rectTop + rectBottom) / 2;
      const line = lines.find((item) => {
        const itemCenter = (item.top + item.bottom) / 2;
        const verticalGap = Math.abs(itemCenter - rectCenter);
        const averageHeight = ((item.bottom - item.top) + rect.height) / 2;
        return verticalGap <= averageHeight * 0.6;
      });

      if (!line) {
        lines.push({
          top: rectTop,
          bottom: rectBottom,
          rects: [{ ...rect }]
        });
        continue;
      }

      line.top = Math.min(line.top, rectTop);
      line.bottom = Math.max(line.bottom, rectBottom);
      line.rects.push({ ...rect });
    }

    // 第三步：行内合并。
    const mergedRects: ViewportRect[] = [];
    for (const line of lines) {
      const lineRects = [...line.rects].sort((left, right) => left.left - right.left);
      const mergedLineRects: ViewportRect[] = [];

      for (const rect of lineRects) {
        const previousRect = mergedLineRects[mergedLineRects.length - 1];
        if (!previousRect) {
          mergedLineRects.push({ ...rect });
          continue;
        }

        const gap = rect.left - (previousRect.left + previousRect.width);
        const mergeGapThreshold = Math.max(4, Math.min(8, rect.height * 0.45));
        if (gap > mergeGapThreshold) {
          mergedLineRects.push({ ...rect });
          continue;
        }

        const nextLeft = Math.min(previousRect.left, rect.left);
        const nextTop = Math.min(previousRect.top, rect.top);
        const nextRight = Math.max(previousRect.left + previousRect.width, rect.left + rect.width);
        const nextBottom = Math.max(previousRect.top + previousRect.height, rect.top + rect.height);
        previousRect.left = nextLeft;
        previousRect.top = nextTop;
        previousRect.width = nextRight - nextLeft;
        previousRect.height = nextBottom - nextTop;
      }

      mergedRects.push(...mergedLineRects);
    }

    return mergedRects.sort((left, right) => (left.top - right.top) || (left.left - right.left));
  }

  function updateSelectionRects() {
    const frameElement = pageFrameRef.current;
    const textLayerElement = textLayerRef.current;
    if (!frameElement || !textLayerElement) {
      setSelectionRects([]);
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionRects([]);
      return;
    }

    const frameRect = frameElement.getBoundingClientRect();
    const textLayerRect = textLayerElement.getBoundingClientRect();
    const nextRects: ViewportRect[] = [];

    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      const clientRects = Array.from(range.getClientRects());
      for (const clientRect of clientRects) {
        const intersectionLeft = Math.max(clientRect.left, textLayerRect.left);
        const intersectionTop = Math.max(clientRect.top, textLayerRect.top);
        const intersectionRight = Math.min(clientRect.right, textLayerRect.right);
        const intersectionBottom = Math.min(clientRect.bottom, textLayerRect.bottom);

        if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) {
          continue;
        }

        nextRects.push({
          left: intersectionLeft - frameRect.left,
          top: intersectionTop - frameRect.top,
          width: intersectionRight - intersectionLeft,
          height: intersectionBottom - intersectionTop
        });
      }
    }

    if (nextRects.length === 0) {
      setSelectionRects([]);
      return;
    }

    setSelectionRects(mergeSelectionRects(nextRects));
  }

  useEffect(() => {
    function handleSelectionChange() {
      updateSelectionRects();
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('mouseup', handleSelectionChange);
    window.addEventListener('keyup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('mouseup', handleSelectionChange);
      window.removeEventListener('keyup', handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    setIsPreviewImageReady(false);
    setIsCanvasReady(false);
  }, [pdfId, pageNum, scale]);

  useEffect(() => {
    if (!isPreviewImageReady || isCanvasReady) {
      return;
    }

    setHighlightRects(previewHighlightRects);
    if (previewHighlightRects.length > 0) {
      onPrimaryHighlightReady?.(pageNum, previewHighlightRects[0]);
    }
  }, [
    isCanvasReady,
    isPreviewImageReady,
    onPrimaryHighlightReady,
    pageNum,
    previewHighlightRects
  ]);

  useEffect(() => {
    let disposed = false;

    async function renderPage() {
      if (!isDocumentReady) {
        return;
      }

      const canvasElement = canvasRef.current;
      const frameElement = pageFrameRef.current;
      if (!canvasElement || !frameElement) {
        return;
      }

      const page = await warmupPage(pageNum);
      if (!page || disposed) {
        return;
      }

      const viewport = page.getViewport({ scale });
      const context = canvasElement.getContext('2d');
      const textLayerElement = textLayerRef.current;
      if (!context) {
        return;
      }

      // 用真实渲染尺寸回填虚拟高度估算，逐页纠偏。
      onPageMeasured?.(pageNum, viewport.width / scale, viewport.height / scale);

      // 使用略高于设备像素比的超采样，降低文本边缘发糊感。
      const outputScale = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * 1.35));
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasElement.width = Math.floor(viewport.width * outputScale);
      canvasElement.height = Math.floor(viewport.height * outputScale);
      canvasElement.style.width = `${Math.floor(viewport.width)}px`;
      canvasElement.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      renderTaskRef.current?.cancel();
      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;

      // 渲染任务已经启动，但高亮先等页面真正绘制完成，避免空白页上先出现标记。

      try {
        await renderTask.promise;
      } catch (error) {
        const errorName = typeof error === 'object' && error !== null && 'name' in error
          ? String((error as { name?: string }).name ?? '')
          : '';
        if (disposed || errorName === 'RenderingCancelledException') {
          return;
        }
        return;
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      }

      if (disposed) {
        return;
      }

      setIsCanvasReady(true);

      const pageHits = (activeHits ?? []).filter((item) => item.pageNum === pageNum);
      const pageHighlightRects = pageHits
        .map((item) => toViewportRect(viewport, item))
        .sort((left, right) => (left.top - right.top) || (left.left - right.left));
      setHighlightRects(pageHighlightRects);
      if (pageHighlightRects.length > 0) {
        onPrimaryHighlightReady?.(pageNum, pageHighlightRects[0]);
      }

      if (textLayerElement) {
        textLayerTaskRef.current?.cancel();
        textLayerElement.replaceChildren();
        textLayerElement.style.width = `${Math.floor(viewport.width)}px`;
        textLayerElement.style.height = `${Math.floor(viewport.height)}px`;

        const textContent = await page.getTextContent();
        if (disposed) {
          return;
        }

        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerElement,
          viewport
        });
        textLayerTaskRef.current = textLayer;
        await textLayer.render();
        updateSelectionRects();
      }
    }

    void renderPage();
    return () => {
      // 阻止异步结果在组件卸载后继续回写。
      disposed = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerTaskRef.current?.cancel();
      textLayerTaskRef.current = null;
      setSelectionRects([]);
    };
  }, [
    activeHits,
    isDocumentReady,
    onPageMeasured,
    onPrimaryHighlightReady,
    pageNum,
    previewHighlightRects,
    scale,
    warmupPage
  ]);

  return (
    <StyledPageFrame ref={pageFrameRef} $pageWidth={pageWidth} $pageHeight={pageHeight}>
      <StyledPagePreviewImage
        alt={`第 ${pageNum} 页预览`}
        src={previewImageUrl}
        onLoad={() => setIsPreviewImageReady(true)}
        onError={() => setIsPreviewImageReady(true)}
        $isVisible={!isCanvasReady}
      />
      <StyledCanvas ref={canvasRef} $isVisible={isCanvasReady} />
      <StyledTextLayer ref={textLayerRef} />
      <StyledSelectionLayer>
        {selectionRects.map((rect, index) => (
          <StyledSelectionRect
            key={`${pageNum}-selection-${index}-${rect.left}-${rect.top}`}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
        ))}
      </StyledSelectionLayer>
      {highlightRects.map((rect, index) => (
        <HighlightOverlay key={`${pageNum}-${index}-${rect.left}-${rect.top}`} rect={rect} />
      ))}
    </StyledPageFrame>
  );
}
