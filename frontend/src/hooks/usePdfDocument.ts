import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { AppRequestError, isRequestCanceledError, normalizeRequestError } from '../api/http';
import { pdfDocumentManager } from '../utils/pdf/pdfDocumentManager';

interface UsePdfDocumentResult {
  pdfDoc: PDFDocumentProxy | null;
  isLoading: boolean;
  error: AppRequestError | null;
  warmupPage: (pageNum: number) => Promise<PDFPageProxy | null>;
}

// 维护 PDF 文档加载与页面预热缓存。
export function usePdfDocument(
  pdfId: string,
  pdfUrl: string,
  preferStreaming = true,
): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppRequestError | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadDocument() {
      setPdfDoc(null);
      setIsLoading(true);
      setError(null);

      try {
        const doc = await pdfDocumentManager.acquireDocument(pdfId, pdfUrl, {
          preferStreaming,
        });
        if (!disposed) {
          setPdfDoc(doc);
        }
      } catch (loadError) {
        if (!disposed) {
          const normalizedError = normalizeRequestError(loadError);
          if (!isRequestCanceledError(normalizedError)) {
            setError(normalizedError);
          }
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    }

    void loadDocument();

    return () => {
      disposed = true;
      pdfDocumentManager.releaseDocument(pdfId);
    };
  }, [pdfId, pdfUrl, preferStreaming]);

  // 预热指定页，促使 pdf.js 提前拉取当前页及附近页的相关 Range 数据。
  const warmupPage = useCallback(
    async (pageNum: number): Promise<PDFPageProxy | null> => {
      return pdfDocumentManager.warmupPage(pdfId, pageNum);
    },
    [pdfId]
  );

  return { pdfDoc, isLoading, error, warmupPage };
}
