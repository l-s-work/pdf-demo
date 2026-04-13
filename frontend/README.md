# PDF 高亮定位前端

## 1. 安装依赖

```bash
pnpm install
```

## 2. 启动开发

```bash
pnpm dev
```

## 3. 页面说明

- `/hits`：命中列表页（分页）
- `/viewer/:pdfId`：PDF 预览与高亮定位页

## 4. 目录结构说明

- `src/pages/HitListPage/`
  - `index.tsx`：页面逻辑
  - `styles.ts`：页面样式
  - `tableColumns.tsx`：表格列配置
- `src/pages/PdfViewerPage/`
  - `index.tsx`：页面逻辑
  - `styles.ts`：页面样式
  - `types.ts`：页面类型
- `src/components/pdf/PdfVirtualViewer/`
  - `index.tsx`：主 Viewer 逻辑
  - `PdfPageCanvas.tsx`：单页渲染
  - `styles.ts`：Viewer 样式
  - `types.ts`：Viewer 类型
- `src/hooks/`
  - `usePdfDocument.ts`：PDF 文档加载与页预热
  - `usePdfVirtualizer.ts`：虚拟滚动能力
- `src/request/`
  - `core/client.ts`：统一普通请求封装
  - `core/cancel.ts`：请求取消控制
  - `core/error.ts`：统一错误模型
  - `core/stream.ts`：流式请求封装

## 5. 大文件快速打开说明

1. 点击列表项后优先滚动到目标页。
2. 使用 `Range` 流式读取 PDF 文件。
3. 初始化时预热目标页及附近页（前后各 2 页），提升上下滚动时的出图速度。
4. 只渲染可视区附近页面，避免一次性渲染大文档。
5. PDF 文档缓存仅保留最近 5 个文档，超出后按最近最少使用策略回收。
6. 如果预览页关闭时文档还在加载，前端会立即释放该加载任务，避免继续拉流占用资源。

## 6. 请求层说明

1. 普通 JSON 请求统一走 `requestClient`。
2. 请求内部使用 `AbortController + signal`。
3. 如需让外部主动取消，可传入 `onCancel(cancel => ...)` 回调拿到取消句柄。
4. 流式接口统一走 `streamRequest`，支持按 chunk 回调处理输出。

示例：

```ts
let cancelRequest: ((reason?: string) => void) | undefined;

const data = await fetchPdfMeta('doc_001', {
  onCancel(cancel) {
    cancelRequest = cancel;
  }
});

cancelRequest?.('用户手动取消');
```
