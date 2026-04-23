import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PdfMetaData } from '../types/pdf';

interface UsePdfVirtualizerOptions {
  parentRef: RefObject<HTMLDivElement>;
  meta: PdfMetaData;
  scale: number;
  measuredPageHeights?: Record<number, number>;
  targetPageNum?: number;
  targetAnchorKey?: string;
}

// 构建 PDF 页面虚拟滚动能力，并在首次进入时滚动到目标页。
export function usePdfVirtualizer({
  parentRef,
  meta,
  scale,
  measuredPageHeights,
  targetPageNum,
  targetAnchorKey,
}: UsePdfVirtualizerOptions) {
  const initialScrollKeyRef = useRef<string | null>(null);
  const lastMeasureKeyRef = useRef<string | null>(null);
  const firstPageMeta = meta.pageSizeList.find(item => item.pageNum === 1) ?? meta.pageSizeList[0];
  const estimatedFirstPageHeight = firstPageMeta?.height ?? 842;

  const rowVirtualizer = useVirtualizer({
    count: meta.totalPages,
    getScrollElement: () => parentRef.current,
    estimateSize: index => {
      const pageNum = index + 1;
      const measuredHeight = measuredPageHeights?.[pageNum];
      const baseHeight = measuredHeight ?? estimatedFirstPageHeight;
      return baseHeight * scale + 18;
    },
    overscan: 3,
  });

  useLayoutEffect(() => {
    // 仅在尺寸签名变化时重算，避免 measure 触发同步更新后再次进入死循环。
    const measureKey = [
      scale.toFixed(4),
      ...Object.entries(measuredPageHeights ?? {})
        .sort(([leftKey], [rightKey]) => Number(leftKey) - Number(rightKey))
        .map(([pageNum, height]) => `${pageNum}:${height.toFixed(2)}`),
    ].join('|');

    if (lastMeasureKeyRef.current === measureKey) {
      return;
    }

    lastMeasureKeyRef.current = measureKey;
    rowVirtualizer.measure();
  }, [rowVirtualizer, measuredPageHeights, scale]);

  useLayoutEffect(() => {
    if (!targetPageNum) {
      return;
    }

    const currentKey = `${meta.pdfId}-${targetPageNum}-${targetAnchorKey ?? 'none'}-${scale.toFixed(4)}`;
    if (initialScrollKeyRef.current === currentKey) {
      return;
    }

    initialScrollKeyRef.current = currentKey;
    // 等缩放稳定后再定位，避免首轮估算尺寸变化导致目标页跑偏。
    const nextFrame = window.requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(Math.max(0, targetPageNum - 1), { align: 'start' });
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [meta.pdfId, rowVirtualizer, targetAnchorKey, targetPageNum, scale]);

  return rowVirtualizer;
}
