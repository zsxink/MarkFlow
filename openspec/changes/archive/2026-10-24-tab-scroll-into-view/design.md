# Design

## Context

`src/ui/document-tabs.ts` 的 `render()` 是标签集合与活动态的唯一刷新入口（由 `onDocumentTabsChanged(render)` 驱动），每次经 `scroll.replaceChildren(fragment)` 整体重建滚动容器 DOM。目前只有「列表菜单激活」与「键盘方向键切换」两条路径调用 `scrollIntoView`，其余路径（文件树打开、`Ctrl+T` 新建、点击激活、关闭后接替）都不会滚动。

滚动容器 `[data-tabs-scroll]` 与右侧固定按钮（新建 / 列表）是兄弟节点，按钮在滚动容器外部，因此调整 `scroll.scrollLeft` 本身不会把标签滚到按钮下方。

## Goals / Non-Goals

**Goals:**

- 任何路径导致活动标签不可见后，活动标签自动完整落入可视区
- 已可见时零滚动（无抖动）
- 逻辑收敛在 `render()` 一处，不在各调用方散落

**Non-Goals:**

- 不改变滚轮 / 键盘手动滚动的既有行为
- 不做平滑滚动动画（瞬时 `scrollLeft` 赋值即可，与现有 `scrollIntoView({behavior: auto})` 一致）
- 不处理「非活动标签」的可见性

## Decisions

1. **在 `render()` 末尾统一处理，而非每个调用方各自 `scrollIntoView`。**
   `render()` 覆盖全部变更来源，新增路径天然继承；散落处理正是当前 bug 的根因。备选方案「在 session 层发 active-change 事件后由 UI 滚动」需要新增事件且仍要处理 DOM 重建时序，复杂度更高。

2. **用 `offsetLeft`/`offsetWidth` 与 `scroll.scrollLeft`/`clientWidth` 手工比较后直接赋值 `scroll.scrollLeft`，不用 `scrollIntoView`。**
   `scrollIntoView({inline: 'nearest'})` 语义正确但会沿祖先链滚动，且在整体重建 DOM 的渲染路径里，手工计算最小滚动量（越界左侧滚到左对齐、越界右侧滚到右对齐、否则不动）更可控、可单测。纯计算逻辑提取为独立函数，接收类 scroll 几何参数并返回目标 `scrollLeft`，便于在 `src/ui/__tests__/` 中做无 DOM 依赖的镜像单测。

3. **`replaceChildren` 后主动恢复滚动位置。**
   整体重建子节点后浏览器可能把 `scrollLeft` 归零。渲染前记录当前 `scrollLeft`，重建后先恢复，再执行「活动标签可见性」计算，保证未涉及活动标签的刷新（如脏状态变化）不引起跳变。

4. **删除菜单激活路径的显式 `scrollIntoView`。**
   统一处理后该调用冗余；键盘路径的 `focus()` 隐式滚动与新逻辑语义一致（focus 后 render 已保证可见），保留 focus 不变。

## Risks / Trade-offs

- [风险] 手工几何计算遗漏某个方向（如 RTL）→ 当前布局固定 LTR（`document-tabs.css` 无 RTL 处理），单测覆盖左越界、右越界、恰好可见、恰好越界 1px 四类边界
- [风险] `render()` 高频触发（每次编辑的脏状态变化都刷新）导致多余滚动 → 决策 3 的「先恢复原位置」+ 仅活动标签不可见才滚动，双重保证非相关刷新零位移
- [权衡] 纯函数下沉到 `src/utils/` 会引入 DOM 类型依赖的边界问题，且该计算仅此一处使用，故保留在 `ui` 层文件内导出以供测试（不违反分层：`ui` 层内部实现）
