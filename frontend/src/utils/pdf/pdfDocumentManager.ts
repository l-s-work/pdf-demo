import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

const MAX_CACHED_PDF_COUNT = 5;
const MAX_CACHED_PAGE_PROMISE_COUNT = 20;
const PDF_WORKER_SRC = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// 统一配置 pdf.js worker，避免运行时出现 workerSrc 未指定错误。
if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
}

interface PdfCacheEntry {
  pdfId: string;
  pdfUrl: string;
  pdfDoc: PDFDocumentProxy | null;
  loadingTask: PDFDocumentLoadingTask | null;
  loadingPromise: Promise<PDFDocumentProxy> | null;
  pagePromiseCache: Map<number, Promise<PDFPageProxy>>;
  refCount: number;
  lastAccessAt: number;
}

interface AcquireDocumentOptions {
  // 线性化文档优先走流式加载，尽量提前首屏渲染。
  preferStreaming?: boolean;
}

// 统一管理 PDFDocumentProxy 的缓存、复用、释放与 LRU 淘汰。
class PdfDocumentManager {
  private readonly cache = new Map<string, PdfCacheEntry>();

  // 获取并持有一个 PDF 文档实例；同一 pdfId 优先复用缓存。
  async acquireDocument(
    pdfId: string,
    pdfUrl: string,
    options: AcquireDocumentOptions = {}
  ): Promise<PDFDocumentProxy> {
    let entry = this.cache.get(pdfId);

    if (entry && entry.pdfUrl !== pdfUrl) {
      await this.destroyEntry(pdfId, entry);
      entry = undefined;
    }

    if (!entry) {
      entry = this.createEntry(pdfId, pdfUrl);
      this.cache.set(pdfId, entry);
    }

    entry.refCount += 1;
    this.touchEntry(entry);

    if (entry.pdfDoc) {
      this.pruneCache();
      return entry.pdfDoc;
    }

    if (!entry.loadingPromise) {
      const preferStreaming = options.preferStreaming ?? true;
      const loadingTask = getDocument({
        url: pdfUrl,
        // 线性化 PDF 优先启用流式解析，尽量让首屏在字节还在到达时就可见。
        disableStream: !preferStreaming,
        disableAutoFetch: true,
        disableRange: false,
        rangeChunkSize: preferStreaming ? 128 * 1024 : 256 * 1024
      });

      entry.loadingTask = loadingTask;
      entry.loadingPromise = loadingTask.promise
        .then((pdfDoc) => {
          entry!.pdfDoc = pdfDoc;
          entry!.loadingTask = null;
          entry!.loadingPromise = null;
          this.touchEntry(entry!);
          this.pruneCache();
          return pdfDoc;
        })
        .catch((error) => {
          this.cache.delete(pdfId);
          entry!.loadingTask = null;
          entry!.loadingPromise = null;
          entry!.pagePromiseCache.clear();
          throw error;
        });
    }

    return entry.loadingPromise;
  }

  // 释放一个文档引用；若仍在加载且无人使用，则立即销毁以停止继续拉流。
  releaseDocument(pdfId: string): void {
    const entry = this.cache.get(pdfId);
    if (!entry) {
      return;
    }

    entry.refCount = Math.max(0, entry.refCount - 1);
    this.touchEntry(entry);

    if (entry.refCount === 0 && entry.loadingTask && !entry.pdfDoc) {
      void this.destroyEntry(pdfId, entry);
      return;
    }

    this.pruneCache();
  }

  // 预热指定页，帮助目标页及附近页更快获取到 page 对象。
  async warmupPage(pdfId: string, pageNum: number): Promise<PDFPageProxy | null> {
    const entry = this.cache.get(pdfId);
    if (!entry?.pdfDoc || pageNum < 1 || pageNum > entry.pdfDoc.numPages) {
      return null;
    }

    this.touchEntry(entry);
    const cachedPromise = entry.pagePromiseCache.get(pageNum);
    if (cachedPromise) {
      this.touchPagePromise(entry, pageNum, cachedPromise);
      return cachedPromise;
    }

    const pagePromise = entry.pdfDoc.getPage(pageNum);
    this.touchPagePromise(entry, pageNum, pagePromise);
    return pagePromise;
  }

  // 清理指定文档或全部缓存，用于手动验证“冷启动打开”场景。
  async clearCache(pdfId?: string): Promise<void> {
    if (pdfId) {
      const entry = this.cache.get(pdfId);
      if (!entry) {
        return;
      }
      await this.destroyEntry(pdfId, entry);
      return;
    }

    const cacheEntries = Array.from(this.cache.entries());
    for (const [cachedPdfId, entry] of cacheEntries) {
      await this.destroyEntry(cachedPdfId, entry);
    }
  }

  // 创建一条新的缓存记录。
  private createEntry(pdfId: string, pdfUrl: string): PdfCacheEntry {
    return {
      pdfId,
      pdfUrl,
      pdfDoc: null,
      loadingTask: null,
      loadingPromise: null,
      pagePromiseCache: new Map<number, Promise<PDFPageProxy>>(),
      refCount: 0,
      lastAccessAt: Date.now()
    };
  }

  // 更新文档访问时间，用于 LRU 淘汰。
  private touchEntry(entry: PdfCacheEntry): void {
    entry.lastAccessAt = Date.now();
  }

  // 更新页预热缓存访问顺序，并限制单文档页缓存数量。
  private touchPagePromise(entry: PdfCacheEntry, pageNum: number, pagePromise: Promise<PDFPageProxy>): void {
    if (entry.pagePromiseCache.has(pageNum)) {
      entry.pagePromiseCache.delete(pageNum);
    }

    entry.pagePromiseCache.set(pageNum, pagePromise);

    while (entry.pagePromiseCache.size > MAX_CACHED_PAGE_PROMISE_COUNT) {
      const oldestPageNum = entry.pagePromiseCache.keys().next().value;
      if (oldestPageNum === undefined) {
        break;
      }
      entry.pagePromiseCache.delete(oldestPageNum);
    }
  }

  // 清理超过上限的空闲文档，仅保留最近 5 个 PDF。
  private pruneCache(): void {
    if (this.cache.size <= MAX_CACHED_PDF_COUNT) {
      return;
    }

    const removableEntries = Array.from(this.cache.entries())
      .filter(([, entry]) => entry.refCount === 0)
      .sort((left, right) => left[1].lastAccessAt - right[1].lastAccessAt);

    while (this.cache.size > MAX_CACHED_PDF_COUNT && removableEntries.length > 0) {
      const [pdfId, entry] = removableEntries.shift()!;
      void this.destroyEntry(pdfId, entry);
    }
  }

  // 销毁指定缓存条目，彻底释放其加载任务和文档对象。
  private async destroyEntry(pdfId: string, entry: PdfCacheEntry): Promise<void> {
    this.cache.delete(pdfId);
    entry.pagePromiseCache.clear();
    entry.loadingPromise = null;

    if (entry.loadingTask) {
      await Promise.resolve(entry.loadingTask.destroy());
      entry.loadingTask = null;
    }

    if (entry.pdfDoc) {
      await Promise.resolve(entry.pdfDoc.destroy());
      entry.pdfDoc = null;
    }
  }
}

export const pdfDocumentManager = new PdfDocumentManager();
