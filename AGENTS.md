# 项目入口规则（AGENTS）

本文件是仓库级入口索引，用于路由前后端规则并指向 .agents 细则。

## 项目结构概览

- frontend/：React + TypeScript + Ant Design + styled-components 的 PDF 预览前端。
- backend/：FastAPI + SQLite + worker 的 PDF 入库、OCR、命中与文件流服务。
- docs/：产品、接口与架构文档，接口或流程调整前优先核对。
- .agents/：Agent 执行协议、模式、依赖、安全、记忆与任务模板。

## 核心规则摘要

1. 每次开始实现前先声明作用域：backend、frontend 或 backend+frontend。
2. 修改 backend/\*\* 时必须遵守 backend/AGENTS.md，不得套用 frontend/AGENTS.md 的实现约束。
3. 修改 frontend/\*\* 时必须遵守 frontend/AGENTS.md，不得套用 backend/AGENTS.md 的实现约束。
4. 跨目录任务按文件路径分别遵守对应 AGENTS，并同步受影响的接口契约、Schema 和前端类型。
5. 先探索再修改；复杂任务先写计划；保持最小改动，避免无关重构。
6. 根 AGENTS 只做路由与裁决，子项目细则看各自 AGENTS，通用执行规则看 .agents/guide/。
7. 变更稳定接口、删除存储数据、引入新依赖或执行高风险命令前，必须先确认。

## Agent 导航

- 执行协议：.agents/guide/execution.md
- 项目模式：.agents/guide/patterns.md
- 安全约束：.agents/guide/safety.md
- 依赖决策：.agents/guide/dependencies.md
- 国际化规则：.agents/guide/i18n.md
- 任务模板：.agents/templates/task-template.md
- 长期记忆：.agents/memory/context.md、.agents/memory/decisions.md
- 任务流转：.agents/tasks/README.md
