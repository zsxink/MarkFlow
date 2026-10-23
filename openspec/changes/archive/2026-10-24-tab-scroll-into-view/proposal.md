# Proposal

## Why

标签栏可横向滚动，但滚动位置只由用户手动滚轮 / 键盘方向键控制。当标签总宽度超过标签栏宽度后，新打开文档、`Ctrl+T` 新建、点击激活、关闭后接替等路径都会让活动标签落在可视区之外，用户看不到自己刚操作的标签，体验割裂。

## What Changes

- 在 `src/ui/document-tabs.ts` 的 `render()` 末尾统一处理「保证活动标签完整落在标签栏可视区内」，覆盖所有导致标签集合或活动态变化的调用方（打开、新建、点击激活、菜单激活、键盘切换、关闭后接替）
- 仅当活动标签当前不在可视区时才调整 `scroll.scrollLeft`（`inline: 'nearest'` 语义），已可见时不产生滚动，避免抖动
- `render()` 会经 `replaceChildren` 重建 DOM，需在重建后基于新 DOM 计算并恢复滚动位置，避免浏览器把 `scrollLeft` 重置为 0
- 调整滚动时不得把标签滚到被右侧固定按钮（新建 / 列表）遮挡的位置
- 现有滚轮横向滚动、键盘方向键导航、菜单激活时的 `scrollIntoView` 行为保持不回归；菜单路径的显式 `scrollIntoView` 在统一处理后可去重

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `document-tabs`: 「标签栏与容量」requirement 增加场景——活动标签因任何标签集合 / 活动态变化而不可见时，系统 SHALL 自动将活动标签滚入标签栏可视区；已可见时 SHALL NOT 产生多余滚动

## Impact

- 代码：`src/ui/document-tabs.ts`（`render()` 末尾新增滚动可见性逻辑，可能移除菜单激活路径的重复 `scrollIntoView`）
- 测试：`src/ui/__tests__/` 下为滚动可见性逻辑补充单测（纯函数部分如可提取则镜像测试）
- 不涉及 Rust、不新增依赖、不改分层结构（`ui` 层内部改动）
