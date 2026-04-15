import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Space, Spin, Typography } from 'antd';
import { getRequestErrorMessage } from '../../api/http';
import { fetchHighlightGroupHits, fetchPdfTestHits } from '../../api/hits';
import { fetchPdfMeta, fetchPdfPreviewUrl, fetchPdfSourceUrl } from '../../api/pdf';
import PdfVirtualViewer from '../../components/pdf/PdfVirtualViewer';
import { useViewerStore } from '../../store/viewerStore';
import type { HighlightHitItem } from '../../types/pdf';
import {
  StyledBody,
  StyledContainer,
  StyledSidebar,
  StyledSidebarCard,
  StyledSidebarHeader,
  StyledSidebarItem,
  StyledSidebarItemMeta,
  StyledSidebarItemTitle,
  StyledSidebarList,
  StyledViewerWrapper
} from './styles';
import type { PdfViewerLocationState } from './types';

// PDF 预览页：负责读取 meta 并渲染虚拟页面 Viewer。
export default function PdfViewerPage() {
  const VIEWER_BOX_WIDTH = 800;
  const { pdfId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentPage } = useViewerStore();
  const state = (location.state ?? {}) as PdfViewerLocationState;
  const hit = state.hit;
  const [selectedHit, setSelectedHit] = useState<HighlightHitItem | null>(hit ?? null);
  const [isOpeningSource, setIsOpeningSource] = useState(false);
  const [sourceUrlErrorText, setSourceUrlErrorText] = useState('');

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyMargin = document.body.style.margin;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.margin = previousBodyMargin;
    };
  }, []);

  useEffect(() => {
    setSourceUrlErrorText('');
  }, [pdfId]);

  useEffect(() => {
    setSelectedHit(hit ?? null);
  }, [hit?.hitId]);

  // 获取文档轻量索引，用于虚拟页面尺寸计算。
  const {
    data: meta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pdf-meta', pdfId],
    queryFn: ({ signal }) => fetchPdfMeta(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60 * 10,
  });

  const { data: previewData, error: previewUrlError } = useQuery({
    queryKey: ['pdf-preview-url', pdfId],
    queryFn: ({ signal }) => fetchPdfPreviewUrl(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const { data: groupHits, error: groupHitsError } = useQuery({
    queryKey: ['highlight-group-hits', selectedHit?.groupId],
    queryFn: ({ signal }) =>
      fetchHighlightGroupHits(String(selectedHit?.groupId), { signal }),
    enabled: Boolean(selectedHit?.groupId),
    staleTime: 1000 * 60,
  });

  const { data: testHits, error: testHitsError } = useQuery({
    queryKey: ['pdf-test-hits', pdfId],
    queryFn: ({ signal }) => fetchPdfTestHits(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (!selectedHit && testHits && testHits.length > 0) {
      setSelectedHit(testHits[0]);
    }
  }, [selectedHit, testHits]);

  const activeHits = useMemo(() => {
    if (!selectedHit) {
      return [];
    }

    // 列表仍保持 per-hit，但预览页可按 groupId 拉取同组命中恢复连贯高亮。
    if (Array.isArray(groupHits) && groupHits.length > 0) {
      return groupHits.filter(
        (item) => item.pageNum > 0 && item.w > 0 && item.h > 0,
      );
    }

    if (selectedHit.pageNum > 0 && selectedHit.w > 0 && selectedHit.h > 0) {
      return [selectedHit as HighlightHitItem];
    }

    return [];
  }, [groupHits, selectedHit]);

  const targetPageNum = useMemo(() => {
    if (selectedHit?.pageNum && selectedHit.pageNum > 0) {
      return selectedHit.pageNum;
    }
    if (activeHits.length > 0) {
      return activeHits[0].pageNum;
    }
    return 1;
  }, [activeHits, selectedHit?.pageNum]);

  const targetAnchorKey = useMemo(() => selectedHit?.hitId ?? '', [selectedHit?.hitId]);

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

  const previewUrl = previewData?.previewUrl ?? '';
  const sortedTestHits = useMemo(() => {
    return [...(testHits ?? [])].sort((left, right) => {
      if (left.pageNum !== right.pageNum) {
        return left.pageNum - right.pageNum;
      }
      if (left.keyword !== right.keyword) {
        return left.keyword.localeCompare(right.keyword);
      }
      return left.hitId.localeCompare(right.hitId);
    });
  }, [testHits]);

  async function handleDownloadSource() {
    if (!pdfId) {
      return;
    }

    setIsOpeningSource(true);
    setSourceUrlErrorText('');
    try {
      const sourceData = await fetchPdfSourceUrl(pdfId);
      window.open(sourceData.sourceUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setSourceUrlErrorText(getRequestErrorMessage(error, '获取源文件下载地址失败'));
    } finally {
      setIsOpeningSource(false);
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
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            PDF 预览与高亮定位
          </Typography.Title>
          <Space wrap>
            <Button onClick={() => navigate('/hits')}>返回列表</Button>
            <Button loading={isOpeningSource} onClick={handleDownloadSource}>
              下载源文件
            </Button>
            {selectedHit ? (
              <Typography.Text type="secondary">
                目标：第 {safeTargetPageNum} 页 / 关键词：{selectedHit.keyword}
              </Typography.Text>
            ) : null}
          </Space>
        </Space>
      </Card>

      <StyledBody>
        <StyledSidebar>
          <StyledSidebarCard>
            <StyledSidebarHeader>
              <Typography.Title level={5} style={{ margin: 0 }}>
                测试项
              </Typography.Title>
              <Typography.Text type="secondary">
                点击任意项快速定位到对应页
              </Typography.Text>
            </StyledSidebarHeader>
            <StyledSidebarList>
              {testHitsError ? (
                <Alert
                  type="warning"
                  showIcon
                  message={getRequestErrorMessage(testHitsError, '加载测试项失败')}
                />
              ) : null}
              {sortedTestHits.length === 0 && !testHitsError ? (
                <Empty description="暂无测试项" />
              ) : null}
              {sortedTestHits.map((item) => {
                const isActive = item.hitId === selectedHit?.hitId;
                return (
                  <StyledSidebarItem
                    key={item.hitId}
                    $active={isActive}
                    onClick={() => setSelectedHit(item)}
                  >
                    <StyledSidebarItemTitle>
                      第 {item.pageNum} 页 · {item.keyword}
                    </StyledSidebarItemTitle>
                    <StyledSidebarItemMeta>
                      {item.groupId ? '可展开多段高亮' : '单点高亮'}
                    </StyledSidebarItemMeta>
                  </StyledSidebarItem>
                );
              })}
            </StyledSidebarList>
          </StyledSidebarCard>
        </StyledSidebar>

        <StyledViewerWrapper>
          {isLoading ? <Spin tip="正在加载文档索引..." /> : null}
          {error ? (
            <Alert
              type="error"
              message={getRequestErrorMessage(error, '加载 meta 失败')}
              showIcon
            />
          ) : null}
          {previewUrlError ? (
            <Alert
              type="warning"
              message={getRequestErrorMessage(previewUrlError, '获取预览地址失败')}
              showIcon
            />
          ) : null}
          {sourceUrlErrorText ? <Alert type="warning" message={sourceUrlErrorText} showIcon /> : null}
          {groupHitsError ? (
            <Alert
              type="warning"
              message={getRequestErrorMessage(
                groupHitsError,
                '加载同组高亮失败，已回退单点高亮',
              )}
              showIcon
            />
          ) : null}
          {meta ? (
            <Typography.Text
              style={{
                position: 'absolute',
                right: 16,
                top: 14,
                zIndex: 5,
                background: 'rgba(17, 24, 39, 0.8)',
                color: '#fff',
                borderRadius: 999,
                padding: '2px 10px',
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
            targetAnchorKey={targetAnchorKey}
            preferStreaming={meta.fileKind !== 'docx'}
          />
        ) : null}
        </StyledViewerWrapper>
      </StyledBody>
    </StyledContainer>
  );
}
