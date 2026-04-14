# 仓库级协作路由规则（AGENTS）

本文件用于定义仓库内多套 AGENTS 规则的作用域与优先级，避免前后端约束混用。

## 1. 作用域绑定

1. 当修改路径位于 `backend/**` 时：
   - 必须遵守 `backend/AGENTS.md`。
   - 不得套用 `frontend/AGENTS.md` 中的实现约束。
2. 当修改路径位于 `frontend/**` 时：
   - 必须遵守 `frontend/AGENTS.md`。
   - 不得套用 `backend/AGENTS.md` 中的实现约束。

## 2. 优先级

1. 路径内更近的 AGENTS 优先级更高：
   - `backend/AGENTS.md`、`frontend/AGENTS.md` 优先于本文件。
2. 本文件只负责“路由分流”和“冲突裁决”，不替代子项目细则。

## 3. 跨目录任务规则

1. 若需求同时涉及 `backend/**` 与 `frontend/**`，必须按文件路径分别遵守对应 AGENTS 约束。
2. 未明确修改范围时，先确认目标目录再实施改动。
3. 不允许在单目录任务中引入另一目录的风格约束或分层约定。

## 4. 执行要求

1. 每次开始实现前，先声明本次任务作用域（`backend` / `frontend` / `backend+frontend`）。
2. 代码说明、注释、接口/类型同步等要求，按目标目录内 AGENTS 执行。
