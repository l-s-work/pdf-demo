import { useEffect, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PdfMetaData } from '../types/pdf';

interface UsePdfVirtualizerOptions {
  parentRef: RefObject<HTMLDivElement>;
  meta: PdfMetaData;
  scale: number;
  measuredPageHeights?: Record<number, number>;
  targetPageNum?: number;
}

// 构建 PDF 页面虚拟滚动能力，并在首次进入时滚动到目标页。
export function usePdfVirtualizer({ parentRef, meta, scale, measuredPageHeights, targetPageNum }: UsePdfVirtualizerOptions) {
  const firstPageMeta = meta.pageSizeList.find((item) => item.pageNum === 1) ?? meta.pageSizeList[0];
  const estimatedFirstPageHeight = firstPageMeta?.height ?? 842;

  const rowVirtualizer = useVirtualizer({
    count: meta.totalPages,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const pageNum = index + 1;
      const measuredHeight = measuredPageHeights?.[pageNum];
      const baseHeight = measuredHeight ?? estimatedFirstPageHeight;
      return baseHeight * scale + 18;
    },
    overscan: 3
  });

  useEffect(() => {
    // 已渲染页回填真实尺寸后，主动触发虚拟高度重算。
    rowVirtualizer.measure();
  }, [rowVirtualizer, measuredPageHeights, scale]);

  useEffect(() => {
    if (targetPageNum) {
      rowVirtualizer.scrollToIndex(Math.max(0, targetPageNum - 1), { align: 'center' });
    }
  }, [rowVirtualizer, targetPageNum]);

  return rowVirtualizer;
}
