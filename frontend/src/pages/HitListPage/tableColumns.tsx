import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { NavigateFunction } from 'react-router-dom';
import type { HighlightHitItem } from '../../types/pdf';

// 生成命中列表列定义，避免页面文件堆积表格细节。
export function createHitColumns(navigate: NavigateFunction): ColumnsType<HighlightHitItem> {
  return [
    { title: '文档ID', dataIndex: 'pdfId', key: 'pdfId', width: 180 },
    { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
    { title: '关键词', dataIndex: 'keyword', key: 'keyword', width: 180 },
    { title: '页码', dataIndex: 'pageNum', key: 'pageNum', width: 100 },
    {
      title: '坐标',
      key: 'rect',
      width: 260,
      render: (_, record) => `x:${record.x}, y:${record.y}, w:${record.w}, h:${record.h}`
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Button
          type="primary"
          onClick={() => {
            // 跳转预览页，并携带命中信息用于目标页快速打开。
            navigate(`/viewer/${record.pdfId}`, { state: { hit: record } });
          }}
        >
          打开并定位
        </Button>
      )
    }
  ];
}
