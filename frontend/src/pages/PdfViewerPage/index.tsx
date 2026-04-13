import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Space, Spin, Typography } from 'antd';
import { getRequestErrorMessage } from '../../api/http';
import { fetchPdfMeta } from '../../api/pdf';
import PdfVirtualViewer from '../../components/pdf/PdfVirtualViewer';
import { useViewerStore } from '../../store/viewerStore';
import { buildPreviewUrl } from '../../utils/pdf/buildPreviewUrl';
import { StyledContainer, StyledViewerWrapper } from './styles';
import type { PdfViewerLocationState } from './types';

// PDF 预览页：负责读取 meta、控制缩放并渲染虚拟页面 Viewer。
export default function PdfViewerPage() {
  const { pdfId = '' } = useParams();
  const location = useLocation();
  const { scale, setScale } = useViewerStore();
  const state = (location.state ?? {}) as PdfViewerLocationState;
  const hit = state.hit;

  // 获取文档轻量索引，用于虚拟页面尺寸计算。
  const { data: meta, isLoading, error } = useQuery({
    queryKey: ['pdf-meta', pdfId],
    queryFn: ({ signal }) => fetchPdfMeta(pdfId, { signal }),
    enabled: Boolean(pdfId),
    staleTime: 1000 * 60 * 10
  });

  const activeHits = useMemo(() => {
    if (!hit) {
      return [];
    }

    const relatedHits = (hit.relatedRects ?? [])
      .filter((item) => item.pageNum > 0 && item.w > 0 && item.h > 0)
      .map((item, index) => ({
        ...hit,
        hitId: `${hit.hitId}_rect_${index}`,
        pageNum: item.pageNum,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h
      }));

    if (relatedHits.length > 0) {
      return relatedHits;
    }

    if (hit.pageNum > 0 && hit.w > 0 && hit.h > 0) {
      return [hit];
    }

    return [];
  }, [hit]);

  const targetPageNum = useMemo(() => {
    if (activeHits.length > 0) {
      return activeHits[0].pageNum;
    }
    return 1;
  }, [activeHits]);

  const previewUrl = useMemo(() => buildPreviewUrl(pdfId, hit), [hit, pdfId]);

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
          <Space>
            <Button onClick={() => setScale(Math.max(0.5, Number((scale - 0.1).toFixed(2))))}>缩小</Button>
            <Button onClick={() => setScale(Number((scale + 0.1).toFixed(2)))}>放大</Button>
            <Typography.Text>当前缩放：{scale.toFixed(2)}x</Typography.Text>
            {hit ? (
              <Typography.Text type="secondary">
                目标：第 {targetPageNum} 页 / 关键词：{hit.keyword}
              </Typography.Text>
            ) : null}
          </Space>
        </Space>
      </Card>

      <StyledViewerWrapper>
        {isLoading ? <Spin tip="正在加载文档索引..." /> : null}
        {error ? <Alert type="error" message={getRequestErrorMessage(error, '加载 meta 失败')} showIcon /> : null}
        {meta ? <PdfVirtualViewer pdfId={pdfId} meta={meta} pdfUrl={previewUrl} activeHits={activeHits} targetPageNum={targetPageNum} /> : null}
      </StyledViewerWrapper>
    </StyledContainer>
  );
}
