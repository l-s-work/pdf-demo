import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Input, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getRequestErrorMessage } from '../../api/http';
import { fetchHighlightHits } from '../../api/hits';
import { uploadPdf } from '../../api/pdf';
import type { HighlightHitItem, PdfUploadKeywordSummary } from '../../types/pdf';
import {
  StyledContainer,
  StyledFileInput,
  StyledHeader,
  StyledSectionStack,
  StyledUploadField,
  StyledUploadGrid,
  StyledUploadResult
} from './styles';
import { createHitColumns } from './tableColumns';

// 命中列表页：负责筛选、分页查询和跳转至预览页。
export default function HitListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [pdfId, setPdfId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadKeywords, setUploadKeywords] = useState('');
  const [uploadLocalError, setUploadLocalError] = useState('');

  // 查询分页命中数据。
  const { data, isLoading, error } = useQuery({
    queryKey: ['highlight-hits', page, pageSize, keyword, pdfId],
    queryFn: ({ signal }) =>
      fetchHighlightHits({
        page,
        pageSize,
        keyword: keyword || undefined,
        pdfId: pdfId || undefined
      }, { signal })
  });

  // 通过独立工厂方法生成列配置。
  const columns = useMemo(() => createHitColumns(navigate), [navigate]);

  // 上传后展示关键词与页码的汇总表格。
  const uploadSummaryColumns = useMemo<ColumnsType<PdfUploadKeywordSummary>>(
    () => [
      { title: '关键词', dataIndex: 'keyword', key: 'keyword', width: 220 },
      {
        title: '命中页码',
        key: 'pageNums',
        render: (_, record) => (record.pageNums.length > 0 ? record.pageNums.join(', ') : '未命中')
      },
      { title: '命中次数', dataIndex: 'hitCount', key: 'hitCount', width: 120 }
    ],
    []
  );

  // 处理浏览器上传，并在成功后自动刷新下方命中列表。
  const uploadMutation = useMutation({
    mutationFn: ({ file, keywordsText }: { file: File; keywordsText: string }) => uploadPdf(file, keywordsText),
    onSuccess: (result) => {
      setPage(1);
      setPdfId(result.pdfId);
      setKeyword('');
      setUploadLocalError('');
      void queryClient.invalidateQueries({ queryKey: ['highlight-hits'] });
    }
  });

  const uploadErrorMessage = uploadLocalError || (uploadMutation.error ? getRequestErrorMessage(uploadMutation.error, '上传 PDF 失败') : '');

  function handleUpload() {
    if (!selectedFile) {
      setUploadLocalError('请先选择一个 PDF 文件');
      return;
    }

    setUploadLocalError('');
    uploadMutation.mutate({
      file: selectedFile,
      keywordsText: uploadKeywords
    });
  }

  return (
    <StyledContainer>
      <StyledSectionStack>
        <Card>
          <StyledHeader>
            <Typography.Title level={4}>上传测试 PDF</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              选择 PDF 后输入待匹配的关键词，支持换行、逗号或中文逗号分隔；留空时后端默认按 `test` 提取。
            </Typography.Paragraph>
          </StyledHeader>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {uploadErrorMessage ? <Alert type="error" showIcon message={uploadErrorMessage} /> : null}

            <StyledUploadGrid>
              <StyledUploadField>
                <Typography.Text strong>PDF 文件</Typography.Text>
                <StyledFileInput
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                    setUploadLocalError('');
                  }}
                />
                <Typography.Text type="secondary">
                  {selectedFile ? `当前文件：${selectedFile.name}` : '请选择一个本地 PDF 文件'}
                </Typography.Text>
              </StyledUploadField>

              <StyledUploadField>
                <Typography.Text strong>关键词</Typography.Text>
                <Input.TextArea
                  rows={4}
                  value={uploadKeywords}
                  onChange={(event) => setUploadKeywords(event.target.value)}
                  placeholder={'每行一个关键词，或用逗号分隔\n例如：test\nOpenAI\n合同编号'}
                />
              </StyledUploadField>
            </StyledUploadGrid>

            <Space wrap>
              <Button type="primary" loading={uploadMutation.isPending} onClick={handleUpload}>
                上传并提取
              </Button>
              <Typography.Text type="secondary">
                上传成功后，下方命中列表会自动切换到当前文档。
              </Typography.Text>
            </Space>

            {uploadMutation.data ? (
              <StyledUploadResult>
                <Alert
                  type={uploadMutation.data.totalHits > 0 ? 'success' : 'warning'}
                  showIcon
                  message={
                    uploadMutation.data.totalHits > 0
                      ? '上传完成，已生成测试命中结果'
                      : '上传完成，但当前关键词没有匹配到命中结果'
                  }
                />

                <Descriptions
                  bordered
                  size="small"
                  column={{ xs: 1, sm: 2, lg: 4 }}
                  items={[
                    { key: 'fileName', label: '文件名', children: uploadMutation.data.fileName },
                    { key: 'pdfId', label: '文档ID', children: uploadMutation.data.pdfId },
                    { key: 'totalPages', label: '总页数', children: uploadMutation.data.totalPages },
                    { key: 'totalHits', label: '命中总数', children: uploadMutation.data.totalHits }
                  ]}
                />

                <Table<PdfUploadKeywordSummary>
                  rowKey="keyword"
                  columns={uploadSummaryColumns}
                  dataSource={uploadMutation.data.keywordSummaries}
                  pagination={false}
                  size="small"
                />
              </StyledUploadResult>
            ) : null}
          </Space>
        </Card>

        <Card>
          <StyledHeader>
            <Typography.Title level={4}>PDF 高亮命中列表（per-hit）</Typography.Title>
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
              <Button
                onClick={() => {
                  // 切换筛选条件时回到第一页。
                  setPage(1);
                }}
              >
                重新查询
              </Button>
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
                // 处理分页变化。
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
