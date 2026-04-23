import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'antd';
import { usePdfDocument } from '../../../hooks/usePdfDocument';
import { usePdfVirtualizer } from '../../../hooks/usePdfVirtualizer';
import { getRequestErrorMessage } from '../../../api/http';
import { StyledContainer, StyledPageSlot, StyledScrollContainer } from './styles';
import type { ViewportRect } from '../HighlightOverlay';
import type { PdfVirtualViewerProps } from './types';
import PdfPageCanvas from './PdfPageCanvas';

// PDF 虚拟页面组件：支持目标页优先打开，并预热附近页的数据。
export default function PdfVirtualViewer({
  pdfId,
  pdfUrl,
  meta,
  viewerWidth,
  activeHits,
  targetPageNum,
  targetAnchorKey,
  preferStreaming = true,
  onCurrentPageChange,
}: PdfVirtualViewerProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const { pdfDoc, error, warmupPage } = usePdfDocument(pdfId, pdfUrl, preferStreaming);
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [measuredPageHeights, setMeasuredPageHeights] = useState<Record<number, number>>({});
  const [highlightAlignVersion, setHighlightAlignVersion] = useState(0);
  const anchoredHighlightKeyRef = useRef<string | null>(null);
  const hasAutoAlignedHighlightRef = useRef(false);
  const currentHighlightAnchorRef = useRef<{
    pageNum: number;
    rect: ViewportRect;
  } | null>(null);
  const fallbackTargetPageNum = targetPageNum ?? activeHits?.[0]?.pageNum;
  const firstPageWidth = useMemo(() => {
    const firstPage = meta.pageSizeList.find(item => item.pageNum === 1) ?? meta.pageSizeList[0];
    return firstPage?.width ?? 0;
  }, [meta.pageSizeList]);

  useEffect(() => {
    setMeasuredPageHeights({});
  }, [pdfId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pdfId]);

  useEffect(() => {
    onCurrentPageChange?.(currentPage);
  }, [currentPage, onCurrentPageChange]);

  useEffect(() => {
    setHighlightAlignVersion(0);
    hasAutoAlignedHighlightRef.current = false;
    currentHighlightAnchorRef.current = null;
  }, [pdfId, pdfUrl]);

  useEffect(() => {
    anchoredHighlightKeyRef.current = null;
    hasAutoAlignedHighlightRef.current = false;
    currentHighlightAnchorRef.current = null;
  }, [activeHits, fallbackTargetPageNum, pdfId, scale]);

  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement || firstPageWidth <= 0) {
      return;
    }

    const updateScaleByContainerWidth = () => {
      const availableWidth = Math.max(1, scrollElement.clientWidth);
      const nextScale = Number((availableWidth / firstPageWidth).toFixed(4));
      if (Math.abs(nextScale - scale) < 0.001) {
        return;
      }
      setScale(nextScale);
    };

    updateScaleByContainerWidth();
    const resizeObserver = new ResizeObserver(updateScaleByContainerWidth);
    resizeObserver.observe(scrollElement);
    return () => resizeObserver.disconnect();
  }, [firstPageWidth, scale, setScale, viewerWidth]);

  // 回填单页真实高度，帮助虚拟列表逐步修正估算尺寸。
  const handlePageMeasured = useCallback((pageNum: number, _width: number, height: number) => {
    setMeasuredPageHeights(currentHeights => {
      const previousHeight = currentHeights[pageNum];
      if (previousHeight && Math.abs(previousHeight - height) < 0.5) {
        return currentHeights;
      }

      return {
        ...currentHeights,
        [pageNum]: height,
      };
    });
  }, []);

  const rowVirtualizer = usePdfVirtualizer({
    parentRef,
    meta,
    scale,
    measuredPageHeights,
    targetPageNum: fallbackTargetPageNum,
    targetAnchorKey,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const pagesToWarmup = useMemo(() => {
    const pageSet = new Set<number>();
    const anchorPage = fallbackTargetPageNum ?? 1;

    pageSet.add(anchorPage);

    for (const activeHit of activeHits ?? []) {
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

    return Array.from(pageSet)
      .sort((left, right) => {
        const leftDistance = Math.abs(left - anchorPage);
        const rightDistance = Math.abs(right - anchorPage);
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
        return left - right;
      })
      .slice(0, 8);
  }, [activeHits, fallbackTargetPageNum, meta.totalPages, virtualItems]);

  useEffect(() => {
    if (virtualItems.length === 0) {
      return;
    }

    const scrollOffset = rowVirtualizer.scrollOffset ?? 0;
    const currentItem =
      [...virtualItems].reverse().find(item => item.start <= scrollOffset + 1) ?? virtualItems[0];
    const nextCurrentPage = currentItem.index + 1;
    setCurrentPage(previousPage =>
      previousPage === nextCurrentPage ? previousPage : nextCurrentPage
    );
  }, [rowVirtualizer.scrollOffset, virtualItems]);

  useEffect(() => {
    if (!pdfDoc) {
      return;
    }

    let canceled = false;

    // 先预热最关键的几页，避免并发过多导致首屏渲染被后续请求挤占。
    const warmupSequentially = async () => {
      for (const pageNum of pagesToWarmup) {
        if (canceled) {
          return;
        }

        await warmupPage(pageNum);
      }
    };

    void warmupSequentially();

    return () => {
      canceled = true;
    };
  }, [pagesToWarmup, pdfDoc, warmupPage]);

  // 将当前命中的主高亮移动到视口偏上的可读区域。
  const alignHighlightAnchor = useCallback(
    (anchor: { pageNum: number; rect: ViewportRect }): boolean => {
      const scrollElement = parentRef.current;
      if (!scrollElement) {
        return false;
      }

      const targetVirtualItem = rowVirtualizer
        .getVirtualItems()
        .find(item => item.index === anchor.pageNum - 1);
      if (!targetVirtualItem) {
        rowVirtualizer.scrollToIndex(Math.max(0, anchor.pageNum - 1), {
          align: 'start',
        });
        return false;
      }

      const viewportAnchorTop = scrollElement.clientHeight * 0.25;
      const highlightCenterOffset = anchor.rect.top + anchor.rect.height / 2;
      const nextScrollTop = Math.max(
        0,
        targetVirtualItem.start + highlightCenterOffset - viewportAnchorTop
      );

      if (Math.abs(scrollElement.scrollTop - nextScrollTop) > 2) {
        scrollElement.scrollTo({ top: nextScrollTop, behavior: 'auto' });
      }

      return true;
    },
    [rowVirtualizer]
  );

  useEffect(() => {
    const anchor = currentHighlightAnchorRef.current;
    if (!anchor || hasAutoAlignedHighlightRef.current) {
      return;
    }

    const nextFrame = window.requestAnimationFrame(() => {
      const aligned = alignHighlightAnchor(anchor);
      if (aligned) {
        hasAutoAlignedHighlightRef.current = true;
        anchoredHighlightKeyRef.current = `${pdfId}-${fallbackTargetPageNum ?? 1}-${scale}`;
        currentHighlightAnchorRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [
    alignHighlightAnchor,
    highlightAlignVersion,
    measuredPageHeights,
    scale,
    rowVirtualizer,
    virtualItems,
  ]);

  // 首个高亮矩形可用后执行精确对齐，避免只滚到页首造成命中偏离视口。
  const handlePrimaryHighlightReady = useCallback(
    (pageNum: number, rect: ViewportRect) => {
      if (hasAutoAlignedHighlightRef.current) {
        return;
      }

      if (pageNum !== fallbackTargetPageNum) {
        return;
      }

      if (!parentRef.current) {
        return;
      }

      const anchorKey = `${pdfId}-${fallbackTargetPageNum ?? 1}-${scale}`;
      if (anchoredHighlightKeyRef.current === anchorKey) {
        return;
      }

      currentHighlightAnchorRef.current = {
        pageNum,
        rect,
      };
      setHighlightAlignVersion(currentVersion => currentVersion + 1);

      const aligned = alignHighlightAnchor({
        pageNum,
        rect,
      });
      if (aligned) {
        anchoredHighlightKeyRef.current = anchorKey;
        hasAutoAlignedHighlightRef.current = true;
        currentHighlightAnchorRef.current = null;
      }
    },
    [alignHighlightAnchor, fallbackTargetPageNum, pdfId, scale]
  );

  return (
    <StyledContainer $viewerWidth={viewerWidth}>
      <StyledScrollContainer ref={parentRef}>
        {error ? (
          <Alert
            type="error"
            showIcon
            message={getRequestErrorMessage(error, '加载 PDF 文件失败')}
          />
        ) : null}
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualItems.map(virtualItem => {
            const pageNum = virtualItem.index + 1;
            const pageMeta =
              meta.pageSizeList.find(item => item.pageNum === pageNum) ?? meta.pageSizeList[0];
            const pageRawWidth = pageMeta?.width ?? firstPageWidth ?? 800;
            const pageRawHeight = pageMeta?.height ?? pageMeta?.width ?? 842;
            const pageWidth = Math.max(1, Math.round(pageRawWidth * scale));
            const pageHeight = Math.max(1, Math.round(pageRawHeight * scale));
            return (
              <StyledPageSlot
                key={virtualItem.key}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <PdfPageCanvas
                  pdfId={pdfId}
                  pageNum={pageNum}
                  scale={scale}
                  isDocumentReady={Boolean(pdfDoc)}
                  pageWidth={pageWidth}
                  pageHeight={pageHeight}
                  warmupPage={warmupPage}
                  activeHits={activeHits}
                  onPageMeasured={handlePageMeasured}
                  onPrimaryHighlightReady={handlePrimaryHighlightReady}
                />
              </StyledPageSlot>
            );
          })}
        </div>
      </StyledScrollContainer>
    </StyledContainer>
  );
}
