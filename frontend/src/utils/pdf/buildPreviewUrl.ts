import type { HighlightHitItem } from '../../types/pdf';
import { resolveRequestUrl } from '../../api/http';

// 生成 PDF 预览地址，优先使用列表项下发的 previewUrl。
export function buildPreviewUrl(pdfId: string, hit?: HighlightHitItem, nonce = 0): string {
  const basePath = hit?.previewUrl ?? `/api/pdf/${pdfId}/file`;
  const separator = basePath.includes('?') ? '&' : '?';
  const finalPath = nonce > 0 ? `${basePath}${separator}_open=${nonce}` : basePath;
  return resolveRequestUrl(finalPath);
}
