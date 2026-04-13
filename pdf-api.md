# 大文件 PDF 预览与精准高亮系统集成文档（本地试验版）

- **版本**：v1.0.0
- **日期**：2026-04-10
- **适用场景**：单机本地试验

## 0. 本地启动约定

- **前端地址**：`http://localhost:5173`
- **后端地址**：`http://localhost:3001`
- **PDF 文件目录**：`./storage/pdf/`
- **SQLite 数据库文件**：`./storage/app.db`
- **预览图目录**：`./storage/preview/`
- **接口访问方式**：前端通过相对路径或本地代理访问后端接口。

## 1. 概述

本系统采用"入库预处理"方案，在文件上传时即完成页码提取与关键词坐标计算，前端利用 PDF.js 的流式加载（Range Requests）与虚拟渲染技术，在本地环境中实现首屏展示与跨页高亮跳转。

## 2. 后端接口定义

### 2.1 获取文档元信息 `GET /api/pdf/:id/meta`

**Request Params:**
- `id` (path): 文档唯一标识符。

**Response:**
```json
{
  "code": 200,
  "data": {
    "pdfId": "doc_78901",
    "fileName": "2024年度技术审计报告.pdf",
    "totalPages": 450,
    "fileSize": 1073741824,
    "isLinearized": true,
    "pageConfig": [
      { "pageNum": 1, "width": 595.27, "height": 841.89, "rotation": 0 }
    ]
  }
}
```

**Error Codes:** `404` 文档不存在 / `500` 服务器内部错误。

### 2.2 获取目标页高亮数据 `GET /api/pdf/:id/highlights`

**Query Params:**
- `pdfId` (query): 文档 ID。
- `pageNum` (query, optional): 过滤特定页码。

**Response:**
```json
{
  "code": 200,
  "data": [
    {
      "id": "hl_001",
      "pageNum": 5,
      "keyword": "风险评估",
      "rects": [
        {"x": 100.5, "y": 200.2, "w": 50.0, "h": 12.0},
        {"x": 150.5, "y": 200.2, "w": 30.0, "h": 12.0}
      ],
      "groupId": "grp_abc123",
      "pageWidth": 595.27,
      "pageHeight": 841.89
    }
  ]
}
```

*注：`rects` 为 PDF 标准坐标系下的矩形区域。跨行关键词对应多个 rect。*

### 2.3 获取单页预览 `GET /api/pdf/:id/page/:pageNum/preview` (可选)

**Response:** `Content-Type: image/jpeg` 或单页 PDF URL。

### 2.4 PDF 文件流式访问 `GET /api/pdf/:id/file`

**Headers Requirements:**
- Request: `Range: bytes=start-end`
- Response: `Accept-Ranges: bytes` / `Content-Range: bytes <start>-<end>/<total>` / `Content-Length: <chunk-size>`

**Status Codes:** `206 Partial Content` 成功 / `416 Range Not Satisfiable` 范围越界。

## 3. 数据模型

### 3.1 文档表 (pdf_documents)

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| id | varchar | 唯一标识 |
| file_path | text | 本地磁盘路径（如 `./storage/pdf/xxx.pdf`） |
| total_pages | int | 总页数 |
| file_size | bigint | 字节数 |
| is_linearized | boolean | 是否已线性化 |

### 3.2 入库高亮结果表 (pdf_highlight_results)

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| id | bigint | 主键 |
| pdf_id | varchar | 关联文档 |
| page_num | int | 所在页码 |
| keyword | varchar | 匹配的关键词 |
| rects | text | 坐标数组 JSON 字符串 `[{x,y,w,h}]` |
| group_id | varchar | 跨页/多处匹配的分组 ID |
| page_width | float | 页面宽度 |
| page_height | float | 页面高度 |
| rotation | int | 页面旋转角度 |
| created_at | timestamp | 入库时间 |

### 3.3 建议索引
- `idx_pdf_id_page`: `(pdf_id, page_num)` — 加速分页查询
- `idx_group_id`: `(group_id)` — 关联跨页关键词

## 4. 前端集成指南

### 4.1 初始化流程
1. 调用 `/api/pdf/:id/meta` 获取总页数和文件大小。
2. 并行调用 `/api/pdf/:id/highlights` 缓存所有高亮坐标。
3. 初始化 PDF.js 查看器，传入流式文件 URL。

### 4.2 PDF.js 配置要点

```javascript
pdfjsLib.getDocument({
  url: '/api/pdf/:id/file',
  rangeChunkSize: 65536,
  disableAutoFetch: true,
  disableStream: false
});
```

### 4.3 跳转到目标页

```javascript
pdfViewer.scrollPageIntoView({ pageNumber: n });
```

### 4.4 高亮 Overlay 渲染逻辑

```javascript
// PDF 坐标 → 屏幕坐标
const [x, y, w, h] = pdfRect;
const screenX = x * viewport.scale;
const screenY = (pageHeight - y - h) * viewport.scale; // PDF 原点在左下角
const screenW = w * viewport.scale;
const screenH = h * viewport.scale;
```

### 4.5 虚拟渲染与滚动预取
- 仅当页面进入视口（Intersection Observer）时触发 `page.render()`。
- 高亮数据应在 `pagerendered` 事件回调中绘制。

### 4.6 缩放时重算高亮位置
监听缩放事件，清除原高亮层并重新应用转换公式。

## 5. 错误处理约定

**统一响应格式：**
```json
{ "code": 400, "message": "错误描述信息", "request_id": "req_xxxx" }
```

| 错误码 | 说明 | 建议处理 |
| :--- | :--- | :--- |
| 416 | 文件 Range 请求超限 | 检查 PDF.js 版本及请求头配置 |
| 1001 | 文档高亮尚未提取完成 | 显示"高亮加载中"，稍后重试 |
| 1002 | PDF 文件已损坏 | 提示用户重新上传 |

## 6. 附录：坐标系说明

- **PDF 坐标系**：原点在左下角，单位通常为 Point (1/72 inch)。
- **屏幕坐标系**：原点在左上角，单位为 Pixel。
- **转换核心**：使用 PDF.js 的 `viewport.convertToViewportPoint(x, y)` 处理旋转和缩放。
