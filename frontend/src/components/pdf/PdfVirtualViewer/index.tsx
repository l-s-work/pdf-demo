import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Spin } from "antd";
import { usePdfDocument } from "../../../hooks/usePdfDocument";
import { usePdfVirtualizer } from "../../../hooks/usePdfVirtualizer";
import { useViewerStore } from "../../../store/viewerStore";
import { getRequestErrorMessage } from "../../../api/http";
import {
  StyledContainer,
  StyledPageSlot,
  StyledScrollContainer,
} from "./styles";
import type { ViewportRect } from "../HighlightOverlay";
import type { PdfVirtualViewerProps } from "./types";
import PdfPageCanvas from "./PdfPageCanvas";

// PDF 虚拟页面组件：支持目标页优先打开，并预热附近页的数据。
export default function PdfVirtualViewer({
  pdfId,
  pdfUrl,
  meta,
  viewerWidth = 800,
  activeHits,
  targetPageNum,
}: PdfVirtualViewerProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const { pdfDoc, isLoading, error, warmupPage } = usePdfDocument(
    pdfId,
    pdfUrl,
  );
  const { scale, setScale, setCurrentPage } = useViewerStore();
  const [measuredPageHeights, setMeasuredPageHeights] = useState<
    Record<number, number>
  >({});
  const anchoredHighlightKeyRef = useRef<string | null>(null);
  const fallbackTargetPageNum = targetPageNum ?? activeHits?.[0]?.pageNum;
  const firstPageWidth = useMemo(() => {
    const firstPage =
      meta.pageSizeList.find((item) => item.pageNum === 1) ??
      meta.pageSizeList[0];
    return firstPage?.width ?? 0;
  }, [meta.pageSizeList]);

  useEffect(() => {
    setMeasuredPageHeights({});
  }, [pdfId]);

  useEffect(() => {
    anchoredHighlightKeyRef.current = null;
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

  const handlePageMeasured = useCallback(
    (pageNum: number, _width: number, height: number) => {
      setMeasuredPageHeights((currentHeights) => {
        const previousHeight = currentHeights[pageNum];
        if (previousHeight && Math.abs(previousHeight - height) < 0.5) {
          return currentHeights;
        }

        return {
          ...currentHeights,
          [pageNum]: height,
        };
      });
    },
    [],
  );

  const rowVirtualizer = usePdfVirtualizer({
    parentRef,
    meta,
    scale,
    measuredPageHeights,
    targetPageNum: fallbackTargetPageNum,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const pagesToWarmup = useMemo(() => {
    const pageSet = new Set<number>();

    for (const activeHit of activeHits ?? []) {
      for (
        let page = activeHit.pageNum - 2;
        page <= activeHit.pageNum + 2;
        page += 1
      ) {
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
  }, [activeHits, meta.totalPages, virtualItems]);

  useEffect(() => {
    if (virtualItems.length === 0) {
      return;
    }

    const scrollOffset = rowVirtualizer.scrollOffset ?? 0;
    const currentItem =
      [...virtualItems]
        .reverse()
        .find((item) => item.start <= scrollOffset + 1) ?? virtualItems[0];
    setCurrentPage(currentItem.index + 1);
  }, [rowVirtualizer.scrollOffset, setCurrentPage, virtualItems]);

  useEffect(() => {
    if (!pdfDoc) {
      return;
    }

    // 提前预热当前页及附近页，帮助大文件在上下滚动时更快出图。
    void Promise.all(pagesToWarmup.map((pageNum) => warmupPage(pageNum)));
  }, [pagesToWarmup, pdfDoc, warmupPage]);

  const handlePrimaryHighlightReady = useCallback(
    (pageNum: number, rect: ViewportRect) => {
      const scrollElement = parentRef.current;
      if (!scrollElement) {
        return;
      }

      const anchorKey = `${pdfId}-${fallbackTargetPageNum ?? 1}-${scale}`;
      if (anchoredHighlightKeyRef.current === anchorKey) {
        return;
      }

      const targetVirtualItem = rowVirtualizer
        .getVirtualItems()
        .find((item) => item.index === pageNum - 1);
      if (!targetVirtualItem) {
        return;
      }

      const viewportAnchorTop = scrollElement.clientHeight * 0.25;
      const highlightCenterOffset = rect.top + rect.height / 2;
      const nextScrollTop = Math.max(
        0,
        targetVirtualItem.start + highlightCenterOffset - viewportAnchorTop,
      );

      scrollElement.scrollTo({ top: nextScrollTop, behavior: "auto" });
      anchoredHighlightKeyRef.current = anchorKey;
    },
    [fallbackTargetPageNum, pdfId, rowVirtualizer, scale],
  );

  return (
    <StyledContainer $viewerWidth={viewerWidth}>
      <StyledScrollContainer ref={parentRef}>
        {isLoading ? <Spin tip="正在加载 PDF 文件..." /> : null}
        {error ? (
          <Alert
            type="error"
            showIcon
            message={getRequestErrorMessage(error, "加载 PDF 文件失败")}
          />
        ) : null}
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
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
                    activeHits={activeHits}
                    onPageMeasured={handlePageMeasured}
                    onPrimaryHighlightReady={handlePrimaryHighlightReady}
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
