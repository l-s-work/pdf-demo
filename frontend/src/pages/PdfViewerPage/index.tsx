import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Segmented,
  Space,
  Spin,
  Typography,
} from "antd";
import { getRequestErrorMessage, resolveRequestUrl } from "../../api/http";
import { fetchHighlightGroupHits } from "../../api/hits";
import { fetchPdfMeta, fetchPdfPreviewUrl } from "../../api/pdf";
import PdfVirtualViewer from "../../components/pdf/PdfVirtualViewer";
import { useViewerStore } from "../../store/viewerStore";
import type { HighlightHitItem, PdfPreviewSourceMode } from "../../types/pdf";
import { buildPreviewUrl } from "../../utils/pdf/buildPreviewUrl";
import { pdfDocumentManager } from "../../utils/pdf/pdfDocumentManager";
import { StyledContainer, StyledViewerWrapper } from "./styles";
import type { PdfViewerLocationState } from "./types";

// PDF 预览页：负责读取 meta、控制缩放并渲染虚拟页面 Viewer。
export default function PdfViewerPage() {
  // 修改这个值即可快速调整外层 PDF 盒子宽度。
  const VIEWER_BOX_WIDTH = 800;
  const { pdfId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentPage } = useViewerStore();
  const state = (location.state ?? {}) as PdfViewerLocationState;
  const hit = state.hit;
  const [previewSourceMode, setPreviewSourceMode] =
    useState<PdfPreviewSourceMode>("auto");
  const [previewNonce, setPreviewNonce] = useState(() => Date.now());
  const [isColdReloading, setIsColdReloading] = useState(false);

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

  // 获取文档轻量索引，用于虚拟页面尺寸计算。
  const {
    data: meta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["pdf-meta", pdfId],
    queryFn: ({ signal }) => fetchPdfMeta(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60 * 10,
  });

  const {
    data: previewData,
    isLoading: isPreviewUrlLoading,
    error: previewUrlError,
  } = useQuery({
    queryKey: ["pdf-preview-url", pdfId, previewSourceMode, previewNonce],
    queryFn: ({ signal }) =>
      fetchPdfPreviewUrl(pdfId, previewSourceMode, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 0,
  });

  const { data: groupHits, error: groupHitsError } = useQuery({
    queryKey: ["highlight-group-hits", hit?.groupId],
    queryFn: ({ signal }) =>
      fetchHighlightGroupHits(String(hit?.groupId), { signal }),
    enabled: Boolean(hit?.groupId),
    staleTime: 1000 * 60,
  });

  const activeHits = useMemo(() => {
    if (!hit) {
      return [];
    }

    // 列表仍保持 per-hit，但预览页可按 groupId 拉取同组命中恢复连贯高亮。
    if (Array.isArray(groupHits) && groupHits.length > 0) {
      return groupHits.filter(
        (item) => item.pageNum > 0 && item.w > 0 && item.h > 0,
      );
    }

    if (hit.pageNum > 0 && hit.w > 0 && hit.h > 0) {
      return [hit as HighlightHitItem];
    }

    return [];
  }, [groupHits, hit]);

  const targetPageNum = useMemo(() => {
    if (hit?.pageNum && hit.pageNum > 0) {
      return hit.pageNum;
    }
    if (activeHits.length > 0) {
      return activeHits[0].pageNum;
    }
    return 1;
  }, [activeHits, hit?.pageNum]);

  const safeTargetPageNum = useMemo(() => {
    if (!meta) {
      return targetPageNum;
    }
    return Math.min(Math.max(1, targetPageNum), meta.totalPages);
  }, [meta, targetPageNum]);

  const safeCurrentPageNum = useMemo(() => {
    if (!meta) {
      return currentPage;
    }
    return Math.min(Math.max(1, currentPage), meta.totalPages);
  }, [currentPage, meta]);

  const previewUrl = useMemo(() => {
    if (!previewData && !previewUrlError) {
      return "";
    }

    if (!previewData) {
      return buildPreviewUrl(pdfId, hit, previewNonce);
    }

    const rawUrl = previewData.previewUrl;
    const isAbsoluteUrl = /^https?:\/\//i.test(rawUrl);
    const isBackendProxy = previewData.source === "backend-proxy";
    const proxyUrl =
      isBackendProxy && previewNonce > 0
        ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}_open=${previewNonce}`
        : rawUrl;

    if (isAbsoluteUrl) {
      return proxyUrl;
    }

    return resolveRequestUrl(proxyUrl);
  }, [hit, pdfId, previewData, previewNonce, previewUrlError]);

  const previewSourceLabel = useMemo(() => {
    if (!previewData) {
      if (previewSourceMode === "local") {
        return "预览来源：后端代理文件流（强制本地）";
      }
      if (previewSourceMode === "oss") {
        return "预览来源：OSS 签名直链（强制 OSS）";
      }
      return "预览来源：后端代理文件流（回退模式）";
    }

    if (previewData.source === "oss-signed") {
      return "预览来源：OSS 签名直链";
    }

    return "预览来源：后端代理文件流";
  }, [previewData, previewSourceMode]);

  async function handleColdReload() {
    if (!pdfId) {
      return;
    }

    setIsColdReloading(true);
    try {
      await pdfDocumentManager.clearCache(pdfId);
      setPreviewNonce((currentNonce) => currentNonce + 1);
    } finally {
      setIsColdReloading(false);
    }
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
            PDF 预览与高亮定位
          </Typography.Title>
          <Space>
            <Button onClick={() => navigate("/hits")}>返回列表</Button>
            <Button loading={isColdReloading} onClick={handleColdReload}>
              冷启动重载
            </Button>
            <Segmented<PdfPreviewSourceMode>
              size="small"
              value={previewSourceMode}
              onChange={(value) => setPreviewSourceMode(value)}
              options={[
                { label: "自动", value: "auto" },
                { label: "本地", value: "local" },
                { label: "OSS", value: "oss" },
              ]}
            />
            <Typography.Text type="secondary">
              {previewSourceLabel}
            </Typography.Text>
            {hit ? (
              <Typography.Text type="secondary">
                目标：第 {safeTargetPageNum} 页 / 关键词：{hit.keyword}
              </Typography.Text>
            ) : null}
          </Space>
        </Space>
      </Card>

      <StyledViewerWrapper>
        {isLoading ? <Spin tip="正在加载文档索引..." /> : null}
        {error ? (
          <Alert
            type="error"
            message={getRequestErrorMessage(error, "加载 meta 失败")}
            showIcon
          />
        ) : null}
        {previewUrlError ? (
          <Alert
            type="warning"
            message={getRequestErrorMessage(
              previewUrlError,
              previewSourceMode === "auto"
                ? "获取 OSS 签名链接失败，已自动回退后端代理预览"
                : "获取预览地址失败",
            )}
            showIcon
          />
        ) : null}
        {groupHitsError ? (
          <Alert
            type="warning"
            message={getRequestErrorMessage(
              groupHitsError,
              "加载同组高亮失败，已回退单点高亮",
            )}
            showIcon
          />
        ) : null}
        {isPreviewUrlLoading ? <Spin tip="正在获取预览地址..." /> : null}
        {meta ? (
          <Typography.Text
            style={{
              position: "absolute",
              right: 16,
              top: 14,
              zIndex: 5,
              background: "rgba(17, 24, 39, 0.8)",
              color: "#fff",
              borderRadius: 999,
              padding: "2px 10px",
            }}
          >
            第 {safeCurrentPageNum} / {meta.totalPages} 页
          </Typography.Text>
        ) : null}
        {meta && previewUrl ? (
          <PdfVirtualViewer
            pdfId={pdfId}
            meta={meta}
            pdfUrl={previewUrl}
            viewerWidth={VIEWER_BOX_WIDTH}
            activeHits={activeHits}
            targetPageNum={safeTargetPageNum}
          />
        ) : null}
      </StyledViewerWrapper>
    </StyledContainer>
  );
}
