# 前端项目协作说明（AGENTS）

## 1. 项目定位

本目录为独立前端项目，技术栈为 React + TypeScript + Ant Design + styled-components。

## 2. 必须遵守

1. 所有样式优先使用 `styled-components`，统一采用：
   - `import styled from 'styled-components';`
   - `const StyledContainer = styled.div\`...\`;`
   - 页面和复杂组件优先采用“文件夹拆分”结构：`index.tsx`、`styles.ts`、必要时补充 `types.ts`、`hooks.ts`。
2. 组件、方法、类型定义均需写中文注释；新增或修改代码必须满足该要求。
3. PDF 坐标以服务端返回原始值为准（PyMuPDF 坐标系：左上角原点），前端仅做 viewport 转换。
4. 列表与预览默认遵循 per-hit 单位置语义：单条命中仅渲染一个矩形，不在前端拼接多矩形语义。
5. 所有前端请求统一走请求层封装，必须支持 signal、外部取消回调和统一错误处理；如需流式输出，优先复用统一 `streamRequest`。
6. 除请求层外，业务代码不得直接使用 `axios` / `fetch` 发起请求。
7. 后端接口新增或变更透传字段时，必须同步更新 `src/types` 类型定义。

## 3. 目录约定

- `src/pages`：页面级组件
- `src/components`：可复用业务组件
- `src/api`：接口访问层
- `src/types`：类型定义
- `src/store`：状态管理

## 4. 代码风格

1. 逻辑优先可读性，避免过度抽象。
2. 不要忽略错误，接口调用需有兜底提示。
3. 不引入与当前目标无关的依赖。
