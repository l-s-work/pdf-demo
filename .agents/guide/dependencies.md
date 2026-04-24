# 依赖决策规则

## Third-Party First 优先级

1. 已有依赖与既有封装。
2. 仓库内部现有实现或通用模块。
3. 成熟第三方库。
4. 最后才是自研新实现。

## 当前仓库的依赖判断

1. 前端已有 styled-components、antd、react-query、zustand、axios；新增能力前先判断能否复用现有栈。
2. 前端发请求优先复用 src/request/core 下的请求、取消和错误处理能力，不绕过既有封装。
3. 后端优先复用 FastAPI、Pydantic、aiosqlite、现有 services/repositories 分层，不为单一需求引入新框架。

## 新增依赖规则

1. 新增依赖前必须评估复用现有依赖是否足够，并说明为什么现有方案不满足。
2. 一旦决定新增依赖，必须把背景、结论和原因记录到 .agents/memory/decisions.md。
3. 禁止为一次性小问题引入重量级库，尤其是前端状态管理、请求库、样式库和后端任务框架。

## 契约与类型生成

1. 接口契约相关类型优先遵循现有手工维护方式：后端改 Schema，前端同步改 src/types。
2. 若未来引入自动生成脚本，先保持最小变更并把工具链决策记录到 decisions.md，再推广到仓库。
