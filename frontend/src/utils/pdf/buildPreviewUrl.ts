import type { HighlightHitItem } from '../../types/pdf';

// 生成 PDF 预览地址，优先使用列表项下发的 previewUrl。
export function buildPreviewUrl(pdfId: string, hit?: HighlightHitItem): string {
  if (hit?.previewUrl) {
    return `http://127.0.0.1:8000${hit.previewUrl}`;
  }
  return `http://127.0.0.1:8000/api/pdf/${pdfId}/file`;
}
