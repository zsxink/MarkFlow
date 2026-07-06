## Why

`src/styles/main.css` 当前 1609 行，所有组件样式集中在单一文件，导致定位困难、并行开发冲突频繁、新人上手认知负担大。

## What Changes

- 将 `main.css` 按组件拆分为 5 个独立 CSS 文件，不改变任何样式值
- `main.ts` 中对应的 `import` 从单个 `main.css` 改为按需 import 各组件 CSS
- 删除 `main.css` 源文件
- `variables.css` 保持不变

## Capabilities

### New Capabilities
- `css-organization`: 将 CSS 按组件拆分，每个文件 ~300 行，职责清晰、易于维护

### Modified Capabilities

无 — 此次仅为样式文件重组，不涉及任何功能需求变更

## Impact

- `src/styles/`: 删除 `main.css`，新增 5 个 CSS 文件
- `src/main.ts`: 修改 CSS import 语句
- 构建流程：无影响（Vite 会自动处理多个 CSS import）
- 选择器优先级：完全不变
