# 项目模式与规范

## 仓库结构模式

1. frontend/ 与 backend/ 是独立子项目，规则和实现约束分流管理，跨目录改动需要分别遵守对应 AGENTS。
2. docs/ 保存产品、接口和架构说明；涉及接口契约、预览链路或入库流程时，先核对现有文档再改代码。

## 前端模式

1. React + TypeScript 页面和复杂组件优先采用目录拆分：index.tsx、styles.ts，必要时补 types.ts、hooks.ts。
2. 样式优先使用 styled-components；避免在业务代码里引入新的样式体系。
3. 请求统一走 src/request 和 src/api 封装，业务代码不直接调用 axios 或 fetch。
4. 服务端返回的 PDF 坐标保持原始语义，前端仅负责 viewport 转换，不改坐标定义。
5. 接口透传字段变化时，同步维护 src/types 中的类型定义。

## 后端模式

1. FastAPI 路由层保持轻薄，业务编排放在 services/，查询放在 repositories/，契约放在 schemas/。
2. SQLite 采用 aiosqlite 异步驱动；文件流优先支持 Range。
3. highlight-hits 列表保持 per-hit 单矩形语义，不在列表接口返回聚合矩形数组。
4. 新增字段时同步更新 Pydantic Schema；若字段透传前端，再同步前端类型。
5. 代码说明、注释、类型定义遵循现有中文表达习惯。

## 现有业务链路

1. PDF 预览链路优先走 preview-url / OSS，失败回退后端 file 接口。
2. OCR、入库、命中提取、文件流职责已经拆到 app/api、app/services、app/utils，新增能力时优先贴近现有分层扩展。
