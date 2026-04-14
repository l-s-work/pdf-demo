# 后端项目协作说明（AGENTS）

## 1. 项目定位

本目录为独立后端项目，基于 FastAPI + SQLite，提供 PDF 命中列表、轻量索引、文件流式访问能力。

## 2. 必须遵守

1. 接口契约保持稳定：
   - `GET /api/highlight-hits`
   - `GET /api/pdf/{id}/meta`
   - `GET /api/pdf/{id}/file`
2. 坐标存储使用服务端原始坐标（PyMuPDF 坐标系：左上角原点，单位 point），前端负责显示坐标换算。
3. `GET /api/highlight-hits` 必须保持 per-hit 单位置语义：每条记录只包含一个矩形（`x/y/w/h`），不得返回聚合矩形数组字段。
4. 模型、方法、类型定义需补充中文注释；新增或修改代码必须满足该要求。
5. 任何新增字段必须同步更新 Pydantic Schema；若字段会透传到前端，还需同步更新前端类型定义。

## 3. 目录约定

- `app/api`：路由层
- `app/models`：ORM 模型
- `app/schemas`：请求与响应模型
- `app/repositories`：数据库查询
- `app/services`：业务逻辑
- `app/core`：基础设施（数据库、配置）

## 4. 实现约束

1. SQLite 使用异步驱动 `aiosqlite`。
2. 文件流接口优先支持 `Range`。
3. `GET /api/highlight-hits` 分页查询默认按 `created_at DESC, id DESC`（以单条 hit 为维度）。
4. 当单文件同时混合路由、文件流、提取解析等多职责时，必须拆分到更小模块。
5. 如需表达多矩形关系，仅通过 `groupId` 关联或独立接口返回，不得破坏列表接口的 per-hit 语义。
