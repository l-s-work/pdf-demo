# 长期上下文

## 项目类型

- 前端：React + TypeScript + Vite + Ant Design + styled-components。
- 后端：FastAPI + SQLite + worker，负责 PDF 入库、OCR、命中查询和文件流。
- 文档：docs/ 下维护产品、接口与架构说明。

## 核心约定摘要

- 仓库按 frontend/ 与 backend/ 分流管理，修改时必须声明作用域并遵守对应 AGENTS。
- 前端样式优先 styled-components，请求统一走 src/request 和 src/api，业务代码不直接发原始 HTTP 请求。
- 后端保持稳定接口契约、Range 支持、服务端原始坐标语义和 per-hit 单矩形语义。
- 字段变更要同步后端 Schema 与前端类型；新增说明、方法、类型定义保持中文表达。

## 记录原则

- 这里只记录代码未直接表达、但后续任务持续需要复用的事实。
- 临时调查过程、一次性命令输出和可从代码直接推导的信息不保留。
