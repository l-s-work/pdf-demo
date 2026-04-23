import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, InputNumber, Space, Table, Typography } from 'antd';
import { getRequestErrorMessage } from '../../api/http';
import { fetchHighlightHits } from '../../api/hits';
import { createPdfUploadJob } from '../../api/pdf';
import type {
  HighlightHitItem,
  ManualHighlightInputItem,
  PdfUploadJobCreateResult,
} from '../../types/pdf';
import {
  StyledContainer,
  StyledFileInput,
  StyledHeader,
  StyledManualItemList,
  StyledManualItemRow,
  StyledSectionStack,
  StyledUploadField,
  StyledUploadGrid,
} from './styles';
import { createHitColumns } from './tableColumns';

// 上传区测试项草稿结构。
interface ManualHighlightDraftItem {
  id: string;
  pageNum: number;
  keyword: string;
}

// 创建一条默认测试项草稿。
function createDraftItem(): ManualHighlightDraftItem {
  return {
    id: `draft_${Math.random().toString(36).slice(2, 10)}`,
    pageNum: 1,
    keyword: '',
  };
}

// 命中列表页：支持上传 PDF/Word，并在上传时同步提交测试项。
export default function HitListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [pdfId, setPdfId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualItems, setManualItems] = useState<ManualHighlightDraftItem[]>([createDraftItem()]);
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
          pdfId: pdfId || undefined,
        },
        { signal }
      ),
    refetchInterval: query => (query.state.data?.hasPendingJobs ? 5000 : false),
  });

  const columns = useMemo(() => createHitColumns(navigate), [navigate]);

  const uploadMutation = useMutation({
    mutationFn: ({ file, items }: { file: File; items: ManualHighlightInputItem[] }) =>
      createPdfUploadJob(file, items),
    onSuccess: result => {
      setPdfId(result.pdfId);
      setPage(1);
      setLocalError('');
      setLastSubmittedJob(result);
      void queryClient.invalidateQueries({ queryKey: ['highlight-hits'] });
    },
  });

  const errorMessage =
    localError ||
    (uploadMutation.error ? getRequestErrorMessage(uploadMutation.error, '上传文件失败') : '');

  function updateManualItem(itemId: string, patch: Partial<ManualHighlightDraftItem>) {
    setManualItems(currentItems =>
      currentItems.map(item => (item.id === itemId ? { ...item, ...patch } : item))
    );
  }

  function normalizeManualItems(): ManualHighlightInputItem[] {
    return manualItems
      .map<ManualHighlightInputItem | null>(item => {
        const normalizedKeyword = item.keyword.trim();
        if (!normalizedKeyword) {
          return null;
        }

        return {
          pageNum: Math.max(1, item.pageNum || 1),
          keyword: normalizedKeyword,
        };
      })
      .filter((item): item is ManualHighlightInputItem => Boolean(item));
  }

  function handleUpload() {
    if (!selectedFile) {
      setLocalError('请先选择一个 PDF 或 Word 文件');
      return;
    }

    const items = normalizeManualItems();
    if (items.length === 0) {
      setLocalError('请至少填写一条“页码 + 关键词”测试项');
      return;
    }

    setLocalError('');
    uploadMutation.mutate({ file: selectedFile, items });
  }

  return (
    <StyledContainer>
      <StyledSectionStack>
        <Card>
          <StyledHeader>
            <Typography.Title level={4}>上传并入库</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              上传 PDF 或 Word
              时同步填写测试项，系统会在后台完成线性化、命中入库和命中页预览图生成。
            </Typography.Paragraph>
          </StyledHeader>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}
            {lastSubmittedJob ? (
              <Alert
                type="info"
                showIcon
                message={`任务已提交：${lastSubmittedJob.jobId}`}
                description={`文档ID：${lastSubmittedJob.pdfId}。完成后可在下方列表中查看命中结果。`}
              />
            ) : null}

            <StyledUploadGrid>
              <StyledUploadField>
                <Typography.Text strong>文件</Typography.Text>
                <StyledFileInput
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={event => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                    setLocalError('');
                  }}
                />
                <Space wrap>
                  <Button type="primary" loading={uploadMutation.isPending} onClick={handleUpload}>
                    上传并入库
                  </Button>
                  <Typography.Text type="secondary">
                    {selectedFile
                      ? `当前文件：${selectedFile.name}`
                      : '请选择一个本地 PDF 或 Word 文件'}
                  </Typography.Text>
                </Space>
              </StyledUploadField>

              <StyledUploadField>
                <Typography.Text strong>测试项</Typography.Text>
                <StyledManualItemList>
                  {manualItems.map((item, index) => (
                    <StyledManualItemRow key={item.id}>
                      <InputNumber
                        min={1}
                        value={item.pageNum}
                        onChange={value =>
                          updateManualItem(item.id, {
                            pageNum: Number(value || 1),
                          })
                        }
                        placeholder="页码"
                        style={{ width: '100%' }}
                      />
                      <Input
                        value={item.keyword}
                        onChange={event =>
                          updateManualItem(item.id, {
                            keyword: event.target.value,
                          })
                        }
                        placeholder={`关键词 ${index + 1}`}
                      />
                      <Button
                        danger
                        disabled={manualItems.length === 1}
                        onClick={() =>
                          setManualItems(items =>
                            items.filter(currentItem => currentItem.id !== item.id)
                          )
                        }
                      >
                        删除
                      </Button>
                    </StyledManualItemRow>
                  ))}
                </StyledManualItemList>
                <Space wrap>
                  <Button onClick={() => setManualItems(items => [...items, createDraftItem()])}>
                    新增一条
                  </Button>
                  <Button onClick={() => setManualItems([createDraftItem()])}>重置</Button>
                </Space>
              </StyledUploadField>
            </StyledUploadGrid>
          </Space>
        </Card>

        <Card>
          <StyledHeader>
            <Typography.Title level={4}>PDF 高亮命中列表</Typography.Title>
            {data?.hasPendingJobs ? (
              <Alert
                type="info"
                showIcon
                message="检测到仍有任务处理中，列表正在自动刷新..."
                style={{ marginBottom: 12 }}
              />
            ) : null}
            {error ? (
              <Alert
                type="error"
                showIcon
                message={getRequestErrorMessage(error, '加载命中列表失败')}
                style={{ marginBottom: 12 }}
              />
            ) : null}
            <Space wrap>
              <Input
                value={pdfId}
                onChange={event => setPdfId(event.target.value)}
                placeholder="按文档ID过滤"
                style={{ width: 220 }}
              />
              <Input
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
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
              },
            }}
          />
        </Card>
      </StyledSectionStack>
    </StyledContainer>
  );
}
