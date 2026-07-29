# ADR: M4 SolidJS Foundation

## 状态

Accepted for issue #219 foundation slice.

## 决策

引入 `solid-js` 作为运行时依赖，引入 `vite-plugin-solid` 作为构建期依赖。M4 首个 slice 只挂载默认关闭的 Solid shell sentinel，并建立 session-indexed workspace projection、Editor Adapter 和 Host request context 边界。

## 约束

- 默认仍运行旧 TypeScript DOM shell；只有 `VITE_MARKFLOW_SOLID_SHELL=true` 或 `1` 时挂载 Solid shell root。
- Solid store 只保存 UI/session projection，不保存完整 Markdown 文本或可回放事务队列。
- `activeFilePath` 只能从 active session 的 `source.path` 派生。
- Editor Adapter 和 Host Bridge API 必须显式接收 `sessionId`；文档相关异步结果应用前必须校验 `sessionId + revision + requestId`。

## 后续

后续 vertical slice 按 Toast/Modal、Statusbar/Outline、Toolbar、Sidebar、App lifecycle 顺序迁移，并在功能迁移矩阵补充自动化或人工验收证据。

