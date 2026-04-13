# 大页 PDF 预览与精准高亮系统架构文档（本地试验版）

- **版本**：v1.0.0
- **日期**：2026-04-10
- **部署方式**：单机本地前后端分离

## 1. 系统概述
本系统采用"入库预计算"策略，在文件上传阶段即完成坐标提取，配合 PDF.js 的 HTTP Range 增量请求能力，在本地前后端分离环境下实现首屏秒开与低内存占用。

## 2. 组件架构图

```mermaid
graph TD
    User((用户)) --> Frontend[前端应用/浏览器]
    
    subgraph "前端层 (Web App)"
        Frontend --> PDFJS[PDF.js 渲染引擎]
        Frontend --> Overlay[高亮层/虚拟滚动控制]
    end

    Frontend --> Gateway[API 网关]

    subgraph "后端服务层"
        Gateway --> DocService[本地文档管理服务]
        Gateway --> Highlighting[本地高亮查询服务]
        DocService --> IngestPipeline[入库预处理 Pipeline]
    end

    subgraph "存储层"
        IngestPipeline --> LocalFS[本地文件系统 - 线性化 PDF]
        IngestPipeline --> DB[(SQLite - 元数据 & 高亮结果表)]
        DocService -.-> LocalFS
        Highlighting -.-> DB
    end
```

## 3. 数据流概览

```mermaid
flowchart LR
    A[上传原始 PDF] --> B[文件线性化处理]
    B --> C[PDF 解析与关键词命中提取]
    C --> D[存储高亮坐标与元数据]
    D --> E[前端请求文档信息]
    E --> F[PDF.js 按需发起 Range 请求]
    F --> G[虚拟渲染与高亮覆盖层绘制]
```

## 4. 核心时序图

### 4.1 PDF 入库流程

```mermaid
sequenceDiagram
    participant Client as 上传客户端
    participant API as 本地 API 服务
    participant PreProcess as 预处理服务
    participant Parser as PDF 解析器
    participant LocalFS as 本地文件系统
    participant DB as SQLite

    Client->>API: 上传原始 PDF
    API->>LocalFS: 存储原始文件
    API->>PreProcess: 触发异步预处理任务
    PreProcess->>Parser: 线性化处理 & 提取元数据
    Parser->>Parser: 根据预设关键词扫描 PDF
    Parser->>Parser: 计算命中文字的页码、XY 坐标及宽高
    Parser->>LocalFS: 存储线性化后的 PDF 文件
    Parser->>DB: 写入文档元数据 (页数、线性化 URL)
    Parser->>DB: 写入入库高亮结果表 (坐标串、命中类型)
    PreProcess-->>API: 任务完成
    API-->>Client: 返回文档处理成功
```

### 4.2 PDF 打开与定位高亮流程

```mermaid
sequenceDiagram
    participant Web as 浏览器/前端
    participant API as 本地 API 服务
    participant DB as 数据库
    participant FS as 本地文件服务

    Web->>API: 请求文档元数据 & 高亮数据
    API->>DB: 查询文档信息与预计算高亮点
    DB-->>API: 返回元数据与坐标列表
    API-->>Web: 返回数据包
    Web->>Web: 初始化 PDF.js (设置 Range URL)
    Web->>FS: 请求文件头 (Range: bytes=0-...)
    FS-->>Web: 返回文件字典与线性化数据
    Web->>Web: 根据高亮页码计算初始跳转位置
    Web->>FS: 请求目标页数据块 (Range 请求)
    FS-->>Web: 返回页面数据
    Web->>Web: 渲染 Canvas + 绘制高亮 Overlay 层
```

### 4.3 滚动加载流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant Engine as 前端渲染引擎
    participant PDFJS as PDF.js
    participant FS as 本地文件服务

    User->>Engine: 向下滚动页面
    Engine->>Engine: 计算当前可见页码区间 (Viewport)
    Engine->>PDFJS: 请求新页面的 Proxy 渲染
    PDFJS->>FS: 根据线性化偏移发起 Range 请求
    FS-->>PDFJS: 返回指定页面字节流
    PDFJS->>Engine: 完成 Canvas 绘制
    Engine->>Engine: 同步渲染该页对应的高亮层 (Overlay)
    Engine->>Engine: 销毁/回收视野外远端页面的 DOM 与缓存
```

### 4.4 首屏单页预览流程 (可选)

```mermaid
sequenceDiagram
    participant Web as 前端项目
    participant API as 本地 API 服务
    participant FS as 本地文件服务

    Web->>API: 请求快速预览
    API-->>Web: 返回第一页高清预览图 URL
    Web->>FS: 加载并显示预览图 (瞬间完成)
    Web->>Web: 后台静默启动 PDF.js 加载全量文档
    Web->>Web: PDF.js 渲染就绪
    Web->>Web: 移除预览图，无缝替换为交互式 Canvas
```

## 5. 存储架构

1. **本地文件系统**：线性化 PDF + 预览图仓库。
2. **结构化数据库 (SQLite)**：
   - 文档表 (`docs`)：文件 ID、名称、总页数、MD5、本地路径。
   - 高亮结果表 (`highlight_results`)：`doc_id`、`page_number`、`rects` (JSON 文本)、`group_id`。

## 6. 部署拓扑建议

- **接入层**：本地静态文件服务或本地反向代理，直接暴露文件下载与 Range 能力。
- **计算层**：本地 API 服务 + 本地后台任务（PDF 解析，PDFBox/MuPDF）。
- **存储层**：本地文件系统 + SQLite。

## 7. 扩展性考虑

- **跨页高亮**：入库时拆分为两条记录，通过 `groupId` 关联，前端分别绘制。
- **坐标归一化**：入库存 PDF Point 坐标，前端根据 Canvas 实时 scale 缩放转换。
- **渐进式增强**：弱网下优先展示高亮文本内容，待字节流到达后再渲染图形化背景。
