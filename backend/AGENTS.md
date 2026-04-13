# 后端项目协作说明（AGENTS）

## 1. 项目定位

本目录为独立后端项目，基于 FastAPI + SQLite，提供 PDF 命中列表、轻量索引、文件流式访问能力。

## 2. 必须遵守

1. 接口契约保持稳定：
   - `GET /api/highlight-hits`
   - `GET /api/pdf/{id}/meta`
   - `GET /api/pdf/{id}/file`
2. 坐标存储使用 PDF 原始坐标（左下原点），前端负责显示坐标换算。
3. 模型、方法、类型需补充中文注释。
4. 任何新增字段必须同步更新 Pydantic Schema。

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
3. 分页查询默认按 `created_at DESC, id DESC`。
4. 当单文件同时混合路由、文件流、提取解析等多职责时，必须拆分到更小模块。
