import { useEffect, useMemo, useRef } from 'react';
import { Alert, Spin } from 'antd';
import { usePdfDocument } from '../../../hooks/usePdfDocument';
import { usePdfVirtualizer } from '../../../hooks/usePdfVirtualizer';
import { useViewerStore } from '../../../store/viewerStore';
import { getRequestErrorMessage } from '../../../api/http';
import { StyledContainer, StyledPageSlot, StyledScrollContainer } from './styles';
import type { PdfVirtualViewerProps } from './types';
import PdfPageCanvas from './PdfPageCanvas';

// PDF 虚拟页面组件：支持目标页优先打开，并预热附近页的数据。
export default function PdfVirtualViewer({ pdfId, pdfUrl, meta, activeHit }: PdfVirtualViewerProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const { pdfDoc, isLoading, error, warmupPage } = usePdfDocument(pdfId, pdfUrl);
  const { scale } = useViewerStore();
  const rowVirtualizer = usePdfVirtualizer({
    parentRef,
    meta,
    scale,
    targetPageNum: activeHit?.pageNum
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const pagesToWarmup = useMemo(() => {
    const pageSet = new Set<number>();

    if (activeHit?.pageNum) {
      for (let page = activeHit.pageNum - 2; page <= activeHit.pageNum + 2; page += 1) {
        if (page >= 1 && page <= meta.totalPages) {
          pageSet.add(page);
        }
      }
    }

    for (const item of virtualItems) {
      for (let page = item.index - 2; page <= item.index + 2; page += 1) {
        const pageNum = page + 1;
        if (pageNum >= 1 && pageNum <= meta.totalPages) {
          pageSet.add(pageNum);
        }
      }
    }

    return Array.from(pageSet).sort((left, right) => left - right);
  }, [activeHit?.pageNum, meta.totalPages, virtualItems]);

  useEffect(() => {
    if (!pdfDoc) {
      return;
    }

    // 提前预热当前页及附近页，帮助大文件在上下滚动时更快出图。
    void Promise.all(pagesToWarmup.map((pageNum) => warmupPage(pageNum)));
  }, [pagesToWarmup, pdfDoc, warmupPage]);

  return (
    <StyledContainer>
      <StyledScrollContainer ref={parentRef}>
        {isLoading ? <Spin tip="正在加载 PDF 文件..." /> : null}
        {error ? <Alert type="error" showIcon message={getRequestErrorMessage(error, '加载 PDF 文件失败')} /> : null}
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map((virtualItem) => {
            const pageNum = virtualItem.index + 1;
            return (
              <StyledPageSlot
                key={virtualItem.key}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                {pdfDoc ? (
                  <PdfPageCanvas
                    pageNum={pageNum}
                    scale={scale}
                    warmupPage={warmupPage}
                    activeHit={activeHit}
                  />
                ) : null}
              </StyledPageSlot>
            );
          })}
        </div>
      </StyledScrollContainer>
    </StyledContainer>
  );
}
