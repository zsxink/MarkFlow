# Tasks

## 1. 滚动可见性核心逻辑

- [x] 1.1 在 `src/ui/document-tabs.ts` 中提取纯计算函数（输入类 scroll 几何：活动标签 `offsetLeft`/`offsetWidth`、容器 `scrollLeft`/`clientWidth`，输出目标 `scrollLeft`；左越界左对齐、右越界右对齐、已可见返回原值），并在 `render()` 中：渲染前记录 `scrollLeft`，`replaceChildren` 后先恢复，再按计算结果调整；验证 `npm test` 通过
- [x] 1.2 为该纯计算函数新增 `src/ui/__tests__/document-tabs-scroll.test.ts` 单测，覆盖左越界、右越界、恰好可见、越界 1px、活动标签宽于容器五类边界；验证 `npx vitest run src/ui/__tests__/document-tabs-scroll.test.ts` 通过

## 2. 路径收敛与回归确认

- [x] 2.1 删除菜单激活路径（`onClick` 中 `[data-activate-tab]` 分支）的显式 `scrollIntoView` 调用，确认统一逻辑覆盖；验证 `npx tsc --noEmit` 无未使用代码告警、`npm test` 通过
- [x] 2.2 对照验收清单静态走查全部路径（文件树打开、Ctrl+T 新建、点击激活、菜单激活、ArrowLeft/Right/Home/End、关闭后接替、脏状态刷新零滚动），在 tasks.md 勾选并记录走查结论；验证 `node scripts/check-layering.mjs` 通过

## 走查结论（2.2）

所有路径均收敛到 `session.ts` 的 `notify()` → `render()`，由 `render()` 末尾统一逻辑（恢复 `scrollLeft` 后按 `computeActiveTabScrollLeft` 调整）保证活动标签滚入视野：

- 文件树打开：`src/ui/sidebar/fileops.ts` → `openDocumentTab` → `activateInternal`（已打开则直接激活）→ `project()` → `notify()` → `render()`。新标签追加在末尾，右越界时右对齐完整可见。
- Ctrl+T 新建：`src/utils/keyboard.ts`（`'new-tab'`）→ `src/ui/native-menu.ts` → `newDocumentTab()` → `project()` → `notify()` → `render()`。
- 点击激活：`onClick` 的 `[role="tab"]` 分支 → `activateDocumentTab` → `runDocumentOperation` → `activateInternal` → `notify()` → `render()`。
- 菜单激活：`onClick` 的 `[data-activate-tab]` 分支显式 `scrollIntoView` 已删除，仅剩 `activateDocumentTab`，与点击激活同链路，由统一逻辑覆盖。
- ArrowLeft/Right/Home/End：`onKeyDown` → `activateDocumentTab` → `render()`（已滚入视野）→ 随后显式 `focus()`；focus 的隐式滚动为 nearest 语义且标签已完整可见，不产生额外位移。
- 关闭后接替：`closeDocumentTab` → `closeInternal` → `restore(next)` → `notify()` → `render()`，接替标签若在可视区外被滚入。
- 脏状态刷新零滚动：store `editor:dirty` → `notify()` → `render()`：渲染前记录 `scrollLeft`，`replaceChildren` 后先恢复原值，活动标签已完整可见时 `computeActiveTabScrollLeft` 返回原值，零位移。
- 右侧固定按钮（新建/列表）是滚动容器的兄弟节点且在容器外，调整 `scrollLeft` 不会把标签滚到按钮下方（design.md 已确认）。

验证结果：`npm test` 939 通过（94 文件）；`npx tsc --noEmit` 无告警；`npx vitest run src/ui/__tests__/document-tabs-scroll.test.ts` 5 通过；`node scripts/check-layering.mjs` 无违规。
