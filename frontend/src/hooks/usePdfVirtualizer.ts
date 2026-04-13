import { useEffect, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PdfMetaData } from '../types/pdf';

interface UsePdfVirtualizerOptions {
  parentRef: RefObject<HTMLDivElement>;
  meta: PdfMetaData;
  scale: number;
  targetPageNum?: number;
}

// 构建 PDF 页面虚拟滚动能力，并在首次进入时滚动到目标页。
export function usePdfVirtualizer({ parentRef, meta, scale, targetPageNum }: UsePdfVirtualizerOptions) {
  const rowVirtualizer = useVirtualizer({
    count: meta.totalPages,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const pageSize = meta.pageSizeList[index];
      const baseHeight = pageSize?.height ?? 842;
      return baseHeight * scale + 18;
    },
    overscan: 3
  });

  useEffect(() => {
    if (targetPageNum) {
      rowVirtualizer.scrollToIndex(Math.max(0, targetPageNum - 1), { align: 'center' });
    }
  }, [rowVirtualizer, targetPageNum]);

  return rowVirtualizer;
}
