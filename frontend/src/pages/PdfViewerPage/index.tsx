import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Spin,
  Typography,
} from "antd";
import { getRequestErrorMessage } from "../../api/http";
import { fetchHighlightGroupHits, fetchPdfTestHits } from "../../api/hits";
import {
  fetchPdfMeta,
  fetchPdfPreviewUrl,
  fetchPdfSourceUrl,
} from "../../api/pdf";
import PdfVirtualViewer from "../../components/pdf/PdfVirtualViewer";
import type { HighlightHitItem } from "../../types/pdf";
import {
  StyledBody,
  StyledContainer,
  StyledPageIndicator,
  StyledSidebar,
  StyledSidebarCard,
  StyledSidebarHeader,
  StyledSidebarHeaderMeta,
  StyledSidebarItem,
  StyledSidebarItemMeta,
  StyledSidebarItemTitle,
  StyledSidebarList,
  StyledViewerGrid,
  StyledViewerPane,
  StyledViewerPaneBody,
  StyledViewerPaneHeader,
  StyledViewerPaneMeta,
  StyledViewerWrapper,
} from "./styles";
import type {
  ComparableHitItem,
  ComparePointItem,
  PdfViewerLocationState,
} from "./types";

// 测试项锚点排序规则，保证列表与对比匹配的稳定性。
function sortAnchorHits(left: HighlightHitItem, right: HighlightHitItem) {
  if (left.pageNum !== right.pageNum) {
    return left.pageNum - right.pageNum;
  }
  if (left.keyword !== right.keyword) {
    return left.keyword.localeCompare(right.keyword);
  }
  if (left.y !== right.y) {
    return left.y - right.y;
  }
  if (left.x !== right.x) {
    return left.x - right.x;
  }
  return left.hitId.localeCompare(right.hitId);
}

// 将关键词归一化为跨文档可复用的匹配键。
function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLocaleLowerCase();
}

// 规范化对比文档 ID，避免 URL 与输入框里出现空白值。
function normalizePdfId(rawValue?: string | null): string {
  return rawValue?.trim() ?? "";
}

// 判断命中是否具备可渲染的高亮矩形。
function isRenderableHit(
  hit?: HighlightHitItem | null,
): hit is HighlightHitItem {
  return Boolean(hit && hit.pageNum > 0 && hit.w > 0 && hit.h > 0);
}

// 将单文档锚点扩展为带 occurrenceIndex 的可对比结构。
function buildComparableHitItems(
  hits: HighlightHitItem[],
): ComparableHitItem[] {
  const occurrenceMap = new Map<string, number>();

  return [...hits].sort(sortAnchorHits).map((hit) => {
    const normalizedKeyword = normalizeKeyword(hit.keyword);
    const occurrenceIndex = occurrenceMap.get(normalizedKeyword) ?? 0;
    occurrenceMap.set(normalizedKeyword, occurrenceIndex + 1);

    return {
      compareKey: `${normalizedKeyword}::${occurrenceIndex}`,
      occurrenceIndex,
      hit,
    };
  });
}

// 根据锚点与 group 明细组装当前 viewer 需要渲染的高亮集合。
function buildActiveHits(
  anchorHit: HighlightHitItem | null,
  groupHits?: HighlightHitItem[],
): HighlightHitItem[] {
  if (Array.isArray(groupHits) && groupHits.length > 0) {
    return groupHits.filter((item) => isRenderableHit(item));
  }

  if (isRenderableHit(anchorHit)) {
    return [anchorHit];
  }

  return [];
}

// 优先取锚点页，没有锚点时退回高亮集合里的第一页。
function resolveTargetPageNum(
  anchorHit: HighlightHitItem | null,
  activeHits: HighlightHitItem[],
): number {
  if (anchorHit?.pageNum && anchorHit.pageNum > 0) {
    return anchorHit.pageNum;
  }
  if (activeHits.length > 0) {
    return activeHits[0].pageNum;
  }
  return 1;
}

// 将当前页/目标页裁剪到文档页数范围内。
function clampPageNum(pageNum: number, totalPages?: number): number {
  if (!totalPages || totalPages <= 0) {
    return Math.max(1, pageNum || 1);
  }
  return Math.min(Math.max(1, pageNum || 1), totalPages);
}

// PDF 预览页：负责读取 meta 并渲染虚拟页面 Viewer。
export default function PdfViewerPage() {
  const { pdfId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = (location.state ?? {}) as PdfViewerLocationState;
  const hit = state.hit;
  const stateComparePdfId = useMemo(
    () => normalizePdfId(state.comparePdfId),
    [state.comparePdfId],
  );
  const comparePdfId = useMemo(() => {
    const comparePdfIdFromQuery = normalizePdfId(
      searchParams.get("comparePdfId"),
    );
    if (comparePdfIdFromQuery) {
      return comparePdfIdFromQuery;
    }
    return stateComparePdfId;
  }, [searchParams, stateComparePdfId]);
  const normalizedComparePdfId = useMemo(
    () => (comparePdfId && comparePdfId !== pdfId ? comparePdfId : ""),
    [comparePdfId, pdfId],
  );
  const [comparePdfIdInput, setComparePdfIdInput] = useState(comparePdfId);
  const [compareInputErrorText, setCompareInputErrorText] = useState("");
  const [selectedCompareKey, setSelectedCompareKey] = useState("");
  const [isOpeningSource, setIsOpeningSource] = useState(false);
  const [sourceUrlErrorText, setSourceUrlErrorText] = useState("");
  const [primaryCurrentPage, setPrimaryCurrentPage] = useState(1);
  const [compareCurrentPage, setCompareCurrentPage] = useState(1);
  const appliedLocationHitIdRef = useRef<string | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.margin = "0";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.margin = previousBodyMargin;
    };
  }, []);

  useEffect(() => {
    setSourceUrlErrorText("");
  }, [pdfId]);

  useEffect(() => {
    setComparePdfIdInput(comparePdfId);
  }, [comparePdfId]);

  useEffect(() => {
    if (searchParams.has("comparePdfId") || !stateComparePdfId) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("comparePdfId", stateComparePdfId);
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, stateComparePdfId]);

  useEffect(() => {
    setPrimaryCurrentPage(1);
  }, [pdfId]);

  useEffect(() => {
    setCompareCurrentPage(1);
  }, [normalizedComparePdfId]);

  // 获取文档轻量索引，用于虚拟页面尺寸计算。
  const {
    data: primaryMeta,
    isLoading: isPrimaryMetaLoading,
    error: primaryMetaError,
  } = useQuery({
    queryKey: ["pdf-meta", pdfId],
    queryFn: ({ signal }) => fetchPdfMeta(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60 * 10,
  });

  const {
    data: primaryPreviewData,
    error: primaryPreviewUrlError,
    isLoading: isPrimaryPreviewUrlLoading,
  } = useQuery({
    queryKey: ["pdf-preview-url", pdfId],
    queryFn: ({ signal }) => fetchPdfPreviewUrl(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const {
    data: compareMeta,
    isLoading: isCompareMetaLoading,
    error: compareMetaError,
  } = useQuery({
    queryKey: ["pdf-meta", normalizedComparePdfId],
    queryFn: ({ signal }) => fetchPdfMeta(normalizedComparePdfId, { signal }),
    enabled: Boolean(normalizedComparePdfId),
    staleTime: 1000 * 60 * 10,
  });

  const {
    data: comparePreviewData,
    error: comparePreviewUrlError,
    isLoading: isComparePreviewUrlLoading,
  } = useQuery({
    queryKey: ["pdf-preview-url", normalizedComparePdfId],
    queryFn: ({ signal }) =>
      fetchPdfPreviewUrl(normalizedComparePdfId, { signal }),
    enabled: Boolean(normalizedComparePdfId),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const { data: primaryTestHits, error: primaryTestHitsError } = useQuery({
    queryKey: ["pdf-test-hits", pdfId],
    queryFn: ({ signal }) => fetchPdfTestHits(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60,
  });

  const { data: compareTestHits, error: compareTestHitsError } = useQuery({
    queryKey: ["pdf-test-hits", normalizedComparePdfId],
    queryFn: ({ signal }) =>
      fetchPdfTestHits(normalizedComparePdfId, { signal }),
    enabled: Boolean(normalizedComparePdfId),
    staleTime: 1000 * 60,
  });

  const sortedPrimaryTestHits = useMemo(
    () => [...(primaryTestHits ?? [])].sort(sortAnchorHits),
    [primaryTestHits],
  );
  const sortedCompareTestHits = useMemo(
    () => [...(compareTestHits ?? [])].sort(sortAnchorHits),
    [compareTestHits],
  );
  const primaryAnchorHits = useMemo(
    () =>
      sortedPrimaryTestHits.length > 0
        ? sortedPrimaryTestHits
        : hit
          ? [hit]
          : [],
    [hit, sortedPrimaryTestHits],
  );
  const primaryComparableHits = useMemo(
    () => buildComparableHitItems(primaryAnchorHits),
    [primaryAnchorHits],
  );
  const compareComparableHits = useMemo(
    () => buildComparableHitItems(sortedCompareTestHits),
    [sortedCompareTestHits],
  );
  const compareHitByKey = useMemo(() => {
    return new Map(
      compareComparableHits.map((item) => [item.compareKey, item.hit]),
    );
  }, [compareComparableHits]);
  const comparePointItems = useMemo<ComparePointItem[]>(() => {
    return primaryComparableHits.map((item) => ({
      compareKey: item.compareKey,
      keyword: item.hit.keyword,
      occurrenceIndex: item.occurrenceIndex,
      primaryHit: item.hit,
      compareHit: compareHitByKey.get(item.compareKey) ?? null,
    }));
  }, [compareHitByKey, primaryComparableHits]);
  const matchedComparePointItems = useMemo(
    () => comparePointItems.filter((item) => Boolean(item.compareHit)),
    [comparePointItems],
  );
  const fallbackComparePointItems = useMemo(
    () =>
      matchedComparePointItems.length > 0
        ? matchedComparePointItems
        : comparePointItems,
    [comparePointItems, matchedComparePointItems],
  );
  const locationCompareKey = useMemo(() => {
    if (!hit?.hitId) {
      return "";
    }

    return (
      primaryComparableHits.find((item) => item.hit.hitId === hit.hitId)
        ?.compareKey ?? ""
    );
  }, [hit?.hitId, primaryComparableHits]);

  useEffect(() => {
    if (!hit?.hitId || !locationCompareKey) {
      return;
    }

    if (appliedLocationHitIdRef.current === hit.hitId) {
      return;
    }

    const targetComparePoint = comparePointItems.find(
      (item) => item.compareKey === locationCompareKey,
    );
    if (!targetComparePoint) {
      return;
    }

    if (normalizedComparePdfId && !targetComparePoint.compareHit) {
      return;
    }

    appliedLocationHitIdRef.current = hit.hitId;
    setSelectedCompareKey(locationCompareKey);
  }, [
    comparePointItems,
    hit?.hitId,
    locationCompareKey,
    normalizedComparePdfId,
  ]);

  useEffect(() => {
    if (comparePointItems.length === 0) {
      setSelectedCompareKey("");
      return;
    }

    setSelectedCompareKey((currentCompareKey) => {
      const currentComparePoint = comparePointItems.find(
        (item) => item.compareKey === currentCompareKey,
      );
      if (
        currentComparePoint &&
        (!normalizedComparePdfId || currentComparePoint.compareHit)
      ) {
        return currentCompareKey;
      }

      return (
        fallbackComparePointItems[0]?.compareKey ??
        comparePointItems[0].compareKey
      );
    });
  }, [comparePointItems, fallbackComparePointItems, normalizedComparePdfId]);

  const selectedComparePoint = useMemo(() => {
    return (
      comparePointItems.find(
        (item) => item.compareKey === selectedCompareKey,
      ) ??
      fallbackComparePointItems[0] ??
      null
    );
  }, [comparePointItems, fallbackComparePointItems, selectedCompareKey]);
  const selectedPrimaryHit = selectedComparePoint?.primaryHit ?? hit ?? null;
  const selectedCompareHit = selectedComparePoint?.compareHit ?? null;

  const { data: primaryGroupHits, error: primaryGroupHitsError } = useQuery({
    queryKey: ["highlight-group-hits", selectedPrimaryHit?.groupId],
    queryFn: ({ signal }) =>
      fetchHighlightGroupHits(String(selectedPrimaryHit?.groupId), { signal }),
    enabled: Boolean(selectedPrimaryHit?.groupId),
    staleTime: 1000 * 60,
  });

  const { data: compareGroupHits, error: compareGroupHitsError } = useQuery({
    queryKey: ["highlight-group-hits", selectedCompareHit?.groupId],
    queryFn: ({ signal }) =>
      fetchHighlightGroupHits(String(selectedCompareHit?.groupId), { signal }),
    enabled: Boolean(selectedCompareHit?.groupId),
    staleTime: 1000 * 60,
  });

  const primaryActiveHits = useMemo(
    () => buildActiveHits(selectedPrimaryHit, primaryGroupHits),
    [primaryGroupHits, selectedPrimaryHit],
  );
  const compareActiveHits = useMemo(
    () => buildActiveHits(selectedCompareHit, compareGroupHits),
    [compareGroupHits, selectedCompareHit],
  );
  const primaryTargetPageNum = useMemo(
    () => resolveTargetPageNum(selectedPrimaryHit, primaryActiveHits),
    [primaryActiveHits, selectedPrimaryHit],
  );
  const compareTargetPageNum = useMemo(
    () => resolveTargetPageNum(selectedCompareHit, compareActiveHits),
    [compareActiveHits, selectedCompareHit],
  );
  const safePrimaryTargetPageNum = useMemo(
    () => clampPageNum(primaryTargetPageNum, primaryMeta?.totalPages),
    [primaryMeta?.totalPages, primaryTargetPageNum],
  );
  const safeCompareTargetPageNum = useMemo(
    () => clampPageNum(compareTargetPageNum, compareMeta?.totalPages),
    [compareMeta?.totalPages, compareTargetPageNum],
  );
  const safePrimaryCurrentPageNum = useMemo(
    () => clampPageNum(primaryCurrentPage, primaryMeta?.totalPages),
    [primaryCurrentPage, primaryMeta?.totalPages],
  );
  const safeCompareCurrentPageNum = useMemo(
    () => clampPageNum(compareCurrentPage, compareMeta?.totalPages),
    [compareCurrentPage, compareMeta?.totalPages],
  );
  const primaryTargetAnchorKey = selectedPrimaryHit?.hitId ?? "";
  const compareTargetAnchorKey = selectedCompareHit?.hitId ?? "";
  const primaryPreviewUrl = primaryPreviewData?.previewUrl ?? "";
  const comparePreviewUrl = comparePreviewData?.previewUrl ?? "";
  const primaryFileName =
    selectedPrimaryHit?.fileName ?? primaryAnchorHits[0]?.fileName ?? pdfId;
  const compareFileName =
    selectedCompareHit?.fileName ??
    sortedCompareTestHits[0]?.fileName ??
    normalizedComparePdfId;

  // 打开当前主文档的源文件下载链接。
  async function handleDownloadSource() {
    if (!pdfId) {
      return;
    }

    setIsOpeningSource(true);
    setSourceUrlErrorText("");
    try {
      const sourceData = await fetchPdfSourceUrl(pdfId);
      window.open(sourceData.sourceUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setSourceUrlErrorText(
        getRequestErrorMessage(error, "获取源文件下载地址失败"),
      );
    } finally {
      setIsOpeningSource(false);
    }
  }

  // 将对比文档 ID 同步到 URL，便于刷新后仍保持当前比较状态。
  function updateComparePdfId(nextComparePdfId: string) {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextComparePdfId) {
      nextSearchParams.set("comparePdfId", nextComparePdfId);
    } else {
      nextSearchParams.delete("comparePdfId");
    }
    setSearchParams(nextSearchParams, { replace: false });
  }

  // 应用对比文档输入框中的值，并启动右侧对比预览。
  function handleApplyComparePdfId() {
    const nextComparePdfId = normalizePdfId(comparePdfIdInput);
    if (!nextComparePdfId) {
      setCompareInputErrorText("");
      updateComparePdfId("");
      return;
    }

    if (nextComparePdfId === pdfId) {
      setCompareInputErrorText("对比文档不能与当前文档相同");
      return;
    }

    setCompareInputErrorText("");
    updateComparePdfId(nextComparePdfId);
  }

  // 清空当前对比文档，回退到单文档预览模式。
  function handleClearComparePdfId() {
    setCompareInputErrorText("");
    setComparePdfIdInput("");
    updateComparePdfId("");
  }

  // 渲染单个 PDF 预览面板，保持左右栏结构与交互一致。
  function renderViewerPane(options: {
    badgeLabel: string;
    fileName: string;
    panePdfId: string;
    currentPage: number;
    totalPages?: number;
    metaError: unknown;
    previewError: unknown;
    groupError: unknown;
    isMetaLoading: boolean;
    isPreviewLoading: boolean;
    meta?: typeof primaryMeta;
    previewUrl: string;
    activeHits: HighlightHitItem[];
    targetPageNum: number;
    targetAnchorKey: string;
    onCurrentPageChange: (page: number) => void;
  }) {
    const isPaneLoading = options.isMetaLoading || options.isPreviewLoading;

    return (
      <StyledViewerPane>
        <StyledViewerPaneHeader>
          <StyledViewerPaneMeta>
            <Typography.Text strong>{options.badgeLabel}</Typography.Text>
            <Typography.Text
              style={{
                fontSize: 16,
                color: "#0f172a",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {options.fileName || options.panePdfId || "未命名文档"}
            </Typography.Text>
            <Typography.Text type="secondary">
              PDF ID: {options.panePdfId}
            </Typography.Text>
          </StyledViewerPaneMeta>
          {options.totalPages ? (
            <StyledPageIndicator>
              第 {options.currentPage} / {options.totalPages} 页
            </StyledPageIndicator>
          ) : null}
        </StyledViewerPaneHeader>

        <StyledViewerPaneBody>
          {isPaneLoading ? <Spin tip="正在加载文档预览..." /> : null}
          {options.metaError ? (
            <Alert
              type="error"
              message={getRequestErrorMessage(
                options.metaError,
                "加载 meta 失败",
              )}
              showIcon
            />
          ) : null}
          {options.previewError ? (
            <Alert
              type="warning"
              message={getRequestErrorMessage(
                options.previewError,
                "获取预览地址失败",
              )}
              showIcon
            />
          ) : null}
          {options.groupError ? (
            <Alert
              type="warning"
              message={getRequestErrorMessage(
                options.groupError,
                "加载同组高亮失败，已回退单点高亮",
              )}
              showIcon
            />
          ) : null}
          {options.meta && options.previewUrl ? (
            <PdfVirtualViewer
              pdfId={options.panePdfId}
              meta={options.meta}
              pdfUrl={options.previewUrl}
              activeHits={options.activeHits}
              targetPageNum={options.targetPageNum}
              targetAnchorKey={options.targetAnchorKey}
              onCurrentPageChange={options.onCurrentPageChange}
            />
          ) : null}
          {!isPaneLoading && !options.meta && !options.metaError ? (
            <Empty description="暂无文档索引" />
          ) : null}
          {!isPaneLoading &&
          options.meta &&
          !options.previewUrl &&
          !options.previewError ? (
            <Empty description="暂无可用预览地址" />
          ) : null}
        </StyledViewerPaneBody>
      </StyledViewerPane>
    );
  }

  if (!pdfId) {
    return (
      <StyledContainer>
        <Empty description="缺少 pdfId 参数" />
      </StyledContainer>
    );
  }

  return (
    <StyledContainer>
      <Card>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            PDF 对比预览与高亮定位
          </Typography.Title>
          <Space wrap size={12}>
            <Button onClick={() => navigate("/hits")}>返回列表</Button>
            <Button loading={isOpeningSource} onClick={handleDownloadSource}>
              下载当前源文件
            </Button>
            <Space.Compact style={{ minWidth: 320, maxWidth: "100%" }}>
              <Input
                value={comparePdfIdInput}
                placeholder="输入对比文档 pdfId"
                onChange={(event) => {
                  setComparePdfIdInput(event.target.value);
                  setCompareInputErrorText("");
                }}
                onPressEnter={handleApplyComparePdfId}
              />
              <Button onClick={handleApplyComparePdfId}>开始对比</Button>
              {normalizedComparePdfId ? (
                <Button onClick={handleClearComparePdfId}>关闭对比</Button>
              ) : null}
            </Space.Compact>
            {selectedPrimaryHit ? (
              <Typography.Text type="secondary">
                当前关键点：{selectedPrimaryHit.keyword} / 左侧第{" "}
                {safePrimaryTargetPageNum} 页
                {normalizedComparePdfId && selectedCompareHit
                  ? ` / 右侧第 ${safeCompareTargetPageNum} 页`
                  : ""}
              </Typography.Text>
            ) : null}
          </Space>
          {compareInputErrorText ? (
            <Alert type="warning" showIcon message={compareInputErrorText} />
          ) : null}
        </Space>
      </Card>

      <StyledBody>
        <StyledSidebar>
          <StyledSidebarCard>
            <StyledSidebarHeader>
              <Typography.Title level={5} style={{ margin: 0 }}>
                关键点列表
              </Typography.Title>
              <StyledSidebarHeaderMeta>
                <Typography.Text type="secondary">
                  点击任意项后，左右两侧会分别定位到对应位置并高亮。
                </Typography.Text>
                {normalizedComparePdfId ? (
                  <Typography.Text
                    type={
                      matchedComparePointItems.length > 0
                        ? "secondary"
                        : "warning"
                    }
                  >
                    已匹配 {matchedComparePointItems.length} /{" "}
                    {comparePointItems.length} 个对比点
                  </Typography.Text>
                ) : null}
              </StyledSidebarHeaderMeta>
            </StyledSidebarHeader>
            <StyledSidebarList>
              {primaryTestHitsError ? (
                <Alert
                  type="warning"
                  showIcon
                  message={getRequestErrorMessage(
                    primaryTestHitsError,
                    "加载主文档测试项失败",
                  )}
                />
              ) : null}
              {compareTestHitsError ? (
                <Alert
                  type="warning"
                  showIcon
                  message={getRequestErrorMessage(
                    compareTestHitsError,
                    "加载对比文档测试项失败",
                  )}
                />
              ) : null}
              {normalizedComparePdfId &&
              !compareTestHitsError &&
              comparePointItems.length > 0 &&
              matchedComparePointItems.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="对比文档中未找到与当前关键点列表可一一对应的锚点"
                />
              ) : null}
              {comparePointItems.length === 0 && !primaryTestHitsError ? (
                <Empty description="暂无关键点" />
              ) : null}
              {comparePointItems.map((item) => {
                const isActive = item.compareKey === selectedCompareKey;
                const isDisabled = Boolean(
                  normalizedComparePdfId && !item.compareHit,
                );
                const sequenceText =
                  item.occurrenceIndex > 0
                    ? ` · 同关键词第 ${item.occurrenceIndex + 1} 处`
                    : "";
                return (
                  <StyledSidebarItem
                    key={item.compareKey}
                    $active={isActive}
                    $disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) {
                        return;
                      }
                      setSelectedCompareKey(item.compareKey);
                    }}
                  >
                    <StyledSidebarItemTitle>
                      {item.keyword}
                      {sequenceText}
                    </StyledSidebarItemTitle>
                    <StyledSidebarItemMeta>
                      左侧：第 {item.primaryHit.pageNum} 页
                      {item.primaryHit.groupId ? " · 多段高亮" : " · 单点高亮"}
                      {normalizedComparePdfId
                        ? item.compareHit
                          ? ` / 右侧：第 ${item.compareHit.pageNum} 页`
                          : " / 右侧：未匹配"
                        : ""}
                    </StyledSidebarItemMeta>
                  </StyledSidebarItem>
                );
              })}
            </StyledSidebarList>
          </StyledSidebarCard>
        </StyledSidebar>

        <StyledViewerWrapper>
          {sourceUrlErrorText ? (
            <Alert type="warning" message={sourceUrlErrorText} showIcon />
          ) : null}
          <StyledViewerGrid $dual={Boolean(normalizedComparePdfId)}>
            {renderViewerPane({
              badgeLabel: "主文档",
              fileName: primaryFileName,
              panePdfId: pdfId,
              currentPage: safePrimaryCurrentPageNum,
              totalPages: primaryMeta?.totalPages,
              meta: primaryMeta,
              previewUrl: primaryPreviewUrl,
              isMetaLoading: isPrimaryMetaLoading,
              isPreviewLoading: isPrimaryPreviewUrlLoading,
              metaError: primaryMetaError,
              previewError: primaryPreviewUrlError,
              groupError: primaryGroupHitsError,
              activeHits: primaryActiveHits,
              targetPageNum: safePrimaryTargetPageNum,
              targetAnchorKey: primaryTargetAnchorKey,
              onCurrentPageChange: setPrimaryCurrentPage,
            })}

            {normalizedComparePdfId
              ? renderViewerPane({
                  badgeLabel: "对比文档",
                  fileName: compareFileName,
                  panePdfId: normalizedComparePdfId,
                  currentPage: safeCompareCurrentPageNum,
                  totalPages: compareMeta?.totalPages,
                  meta: compareMeta,
                  previewUrl: comparePreviewUrl,
                  isMetaLoading: isCompareMetaLoading,
                  isPreviewLoading: isComparePreviewUrlLoading,
                  metaError: compareMetaError,
                  previewError: comparePreviewUrlError,
                  groupError: compareGroupHitsError,
                  activeHits: compareActiveHits,
                  targetPageNum: safeCompareTargetPageNum,
                  targetAnchorKey: compareTargetAnchorKey,
                  onCurrentPageChange: setCompareCurrentPage,
                })
              : null}
          </StyledViewerGrid>
        </StyledViewerWrapper>
      </StyledBody>
    </StyledContainer>
  );
}
