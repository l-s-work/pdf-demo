import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, InputNumber, Space, Switch, Table, Typography } from 'antd';
import { getRequestErrorMessage } from '../../api/http';
import { fetchHighlightHits } from '../../api/hits';
import { appendManualHits, createPdfUploadJob } from '../../api/pdf';
import type { HighlightHitItem, ManualHighlightInputItem, PdfUploadJobCreateResult } from '../../types/pdf';
import {
  StyledContainer,
  StyledFileInput,
  StyledHeader,
  StyledManualItemList,
  StyledManualItemRow,
  StyledSectionStack,
  StyledUploadField,
  StyledUploadGrid
} from './styles';
import { createHitColumns } from './tableColumns';

// 上传区手工测试项草稿结构。
interface ManualHighlightDraftItem {
  id: string;
  pageNum: number;
  keyword: string;
}

// 创建一条默认的手工测试项草稿。
function createDraftItem(): ManualHighlightDraftItem {
  return {
    id: `draft_${Math.random().toString(36).slice(2, 10)}`,
    pageNum: 1,
    keyword: ''
  };
}

// 命中列表页：支持上传 PDF、追加手工测试项，并在任务处理中自动轮询列表。
export default function HitListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [pdfId, setPdfId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualItems, setManualItems] = useState<ManualHighlightDraftItem[]>([createDraftItem()]);
  const [uploadToOss, setUploadToOss] = useState(false);
  const [localError, setLocalError] = useState('');
  const [lastSubmittedJob, setLastSubmittedJob] = useState<PdfUploadJobCreateResult | null>(null);

  // 查询分页命中数据；当后台任务未结束时自动轮询，避免预览时拿不到定位信息。
  const { data, isLoading, error } = useQuery({
    queryKey: ['highlight-hits', page, pageSize, keyword, pdfId],
    queryFn: ({ signal }) =>
      fetchHighlightHits(
        {
          page,
          pageSize,
          keyword: keyword || undefined,
          pdfId: pdfId || undefined
        },
        { signal }
      ),
    refetchInterval: (query) => (query.state.data?.hasPendingJobs ? 1500 : false)
  });

  const columns = useMemo(() => createHitColumns(navigate), [navigate]);

  const uploadMutation = useMutation({
    mutationFn: ({ file, shouldUploadToOss }: { file: File; shouldUploadToOss: boolean }) =>
      createPdfUploadJob(file, [], shouldUploadToOss),
    onSuccess: (result) => {
      setPdfId(result.pdfId);
      setPage(1);
      setLocalError('');
      setLastSubmittedJob(result);
      void queryClient.invalidateQueries({ queryKey: ['highlight-hits'] });
    }
  });

  const appendMutation = useMutation({
    mutationFn: ({ targetPdfId, items, shouldUploadToOss }: { targetPdfId: string; items: ManualHighlightInputItem[]; shouldUploadToOss: boolean }) =>
      appendManualHits(targetPdfId, items, shouldUploadToOss),
    onSuccess: (result) => {
      setPage(1);
      setKeyword('');
      setLocalError('');
      setLastSubmittedJob(result);
      void queryClient.invalidateQueries({ queryKey: ['highlight-hits'] });
    }
  });

  const errorMessage =
    localError
    || (uploadMutation.error ? getRequestErrorMessage(uploadMutation.error, '上传 PDF 失败') : '')
    || (appendMutation.error ? getRequestErrorMessage(appendMutation.error, '新增手工测试项失败') : '');

  function updateManualItem(itemId: string, patch: Partial<ManualHighlightDraftItem>) {
    setManualItems((currentItems) => currentItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function normalizeManualItems(): ManualHighlightInputItem[] {
    return manualItems
      .map<ManualHighlightInputItem | null>((item) => {
        const normalizedKeyword = item.keyword.trim();
        if (!normalizedKeyword) {
          return null;
        }

        return {
          pageNum: Math.max(1, item.pageNum || 1),
          keyword: normalizedKeyword
        };
      })
      .filter((item): item is ManualHighlightInputItem => Boolean(item));
  }

  function handleUploadPdf() {
    if (!selectedFile) {
      setLocalError('请先选择一个 PDF 文件');
      return;
    }

    setLocalError('');
    uploadMutation.mutate({ file: selectedFile, shouldUploadToOss: uploadToOss });
  }

  function handleAppendManualItems() {
    const targetPdfId = pdfId.trim();
    if (!targetPdfId) {
      setLocalError('请先上传 PDF 或填写目标文档ID');
      return;
    }

    const items = normalizeManualItems();
    if (items.length === 0) {
      setLocalError('请至少填写一条“页码 + 关键词”测试项');
      return;
    }

    setLocalError('');
    appendMutation.mutate({ targetPdfId, items, shouldUploadToOss: uploadToOss });
  }

  return (
    <StyledContainer>
      <StyledSectionStack>
        <Card>
          <StyledHeader>
            <Typography.Title level={4}>上传与手工测试</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              先上传 PDF 获取文档ID，再反复追加“页码 + 关键词”测试项；列表会在任务未结束时自动轮询刷新。
            </Typography.Paragraph>
          </StyledHeader>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}
            {lastSubmittedJob ? (
              <Alert
                type="info"
                showIcon
                message={`任务已提交：${lastSubmittedJob.jobId}`}
                description={`文档ID：${lastSubmittedJob.pdfId}。处理中期间列表会自动轮询更新。`}
              />
            ) : null}
            <Space>
              <Typography.Text>上传到 OSS</Typography.Text>
              <Switch checked={uploadToOss} onChange={setUploadToOss} />
              <Typography.Text type="secondary">
                {uploadToOss ? '已启用：上传后可测试 OSS 直连预览' : '未启用：仅使用本地文件预览'}
              </Typography.Text>
            </Space>

            <StyledUploadGrid>
              <StyledUploadField>
                <Typography.Text strong>上传 PDF</Typography.Text>
                <StyledFileInput
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                    setLocalError('');
                  }}
                />
                <Space wrap>
                  <Button type="primary" loading={uploadMutation.isPending} onClick={handleUploadPdf}>
                    上传文件
                  </Button>
                  <Typography.Text type="secondary">
                    {selectedFile ? `当前文件：${selectedFile.name}` : '请选择一个本地 PDF 文件'}
                  </Typography.Text>
                </Space>
              </StyledUploadField>

              <StyledUploadField>
                <Typography.Text strong>追加手工测试项</Typography.Text>
                <Input
                  value={pdfId}
                  onChange={(event) => setPdfId(event.target.value)}
                  placeholder="目标文档ID（上传成功会自动填入）"
                  style={{ width: '100%' }}
                />
                <StyledManualItemList>
                  {manualItems.map((item, index) => (
                    <StyledManualItemRow key={item.id}>
                      <InputNumber
                        min={1}
                        value={item.pageNum}
                        onChange={(value) => updateManualItem(item.id, { pageNum: Number(value || 1) })}
                        placeholder="页码"
                        style={{ width: '100%' }}
                      />
                      <Input
                        value={item.keyword}
                        onChange={(event) => updateManualItem(item.id, { keyword: event.target.value })}
                        placeholder={`关键词 ${index + 1}`}
                      />
                      <Button
                        danger
                        disabled={manualItems.length === 1}
                        onClick={() => setManualItems((items) => items.filter((currentItem) => currentItem.id !== item.id))}
                      >
                        删除
                      </Button>
                    </StyledManualItemRow>
                  ))}
                </StyledManualItemList>
                <Space wrap>
                  <Button onClick={() => setManualItems((items) => [...items, createDraftItem()])}>新增一条</Button>
                  <Button type="primary" loading={appendMutation.isPending} onClick={handleAppendManualItems}>
                    提交测试项
                  </Button>
                </Space>
              </StyledUploadField>
            </StyledUploadGrid>
          </Space>
        </Card>

        <Card>
          <StyledHeader>
            <Typography.Title level={4}>PDF 高亮命中列表</Typography.Title>
            {data?.hasPendingJobs ? <Alert type="info" showIcon message="检测到仍有命中任务处理中，列表正在自动刷新..." style={{ marginBottom: 12 }} /> : null}
            {error ? <Alert type="error" showIcon message={getRequestErrorMessage(error, '加载命中列表失败')} style={{ marginBottom: 12 }} /> : null}
            <Space wrap>
              <Input
                value={pdfId}
                onChange={(event) => setPdfId(event.target.value)}
                placeholder="按文档ID过滤"
                style={{ width: 220 }}
              />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="按关键词过滤"
                style={{ width: 220 }}
              />
              <Button onClick={() => setPage(1)}>重新查询</Button>
            </Space>
          </StyledHeader>

          <Table<HighlightHitItem>
            rowKey="hitId"
            columns={columns}
            dataSource={data?.items ?? []}
            loading={isLoading}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              }
            }}
          />
        </Card>
      </StyledSectionStack>
    </StyledContainer>
  );
}
