import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { NavigateFunction } from 'react-router-dom';
import type { HighlightHitItem } from '../../types/pdf';

// 生成命中列表列定义，避免页面文件堆积表格细节。
export function createHitColumns(navigate: NavigateFunction): ColumnsType<HighlightHitItem> {
  return [
    { title: '文档ID', dataIndex: 'pdfId', key: 'pdfId', width: 180 },
    { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: string) => (value === 'matched' ? '已定位' : '待定位'),
    },
    { title: '关键词', dataIndex: 'keyword', key: 'keyword', width: 180 },
    { title: '页码', dataIndex: 'pageNum', key: 'pageNum', width: 100 },
    {
      title: '坐标',
      key: 'rect',
      width: 260,
      render: (_, record) =>
        record.w > 0 && record.h > 0
          ? `x:${record.x}, y:${record.y}, w:${record.w}, h:${record.h}`
          : '未返回坐标',
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Button
          type="primary"
          onClick={() => {
            console.log('recordrecord', record);

            // 跳转预览页，并携带命中信息用于目标页快速打开。
            navigate(`/viewer/${record.pdfId}`, { state: { hit: record } });
          }}
        >
          打开并定位
        </Button>
      ),
    },
  ];
}
