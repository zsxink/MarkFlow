## Context

当前项目有 7 种弹窗（Settings、NewFile、ImageInsert、Link、UnsavedChanges、ExternalConflict、ExternalDeletion）、3 种 ContextMenu（FileTree、Image、Mermaid）和 Toast，各自使用不同实现方式：

- **innerHTML 填充模式**：Settings、NewFile、ImageInsert、Link、UnsavedChanges — 在已有的 `modal-overlay` 骨架元素内通过 `innerHTML = ...` 渲染内容
- **createElement + Promise 模式**：ExternalConflict、ExternalDeletion — 完全用 JS 创建 DOM 元素，使用 Promise 包装用户选择
- **直接操纵 DOM 模式**：ContextMenu — 手动定位、innerHTML 构建菜单项列表
- **简单 Toast**：单例定时器

每个实现都重复了 backdrop click 关闭、Escape 关闭、focus 管理等模式。ExternalConflict/Deletion 对话框**缺少** Escape 和 backdrop 支持。

HTML 侧有 5 个预先放置的 `modal-overlay` 骨架（`settings-modal`、`newfile-modal`、`image-modal`、`link-modal`、`unsaved-modal`），其中 `unsaved-modal` 被两个弹窗（confirmDocumentTransition + showUnsavedDialog）共用。

## Goals / Non-Goals

**Goals:**
- 创建 3 个核心工厂函数，统一弹窗/ContextMenu/Toast 的创建逻辑
- 所有弹窗实现一致的 backdrop click 关闭、Escape 关闭、focus 管理
- 所有弹窗支持 Promise 形式获取用户选择结果
- 移除 `index.html` 中的预置 modal-overlay 骨架元素，改为动态创建
- 保持现有 CSS 类名不变，不修改样式文件

**Non-Goals:**
- 不改变弹窗的视觉样式和交互流程
- 不重构 Toast（仅提取为工厂函数，行为保持不变）
- 不增加新的动画/过渡效果
- 不修改 `contextMenu.ts` 中的业务逻辑（如 handleAction）
- 不修改 `sidebar.conflict.ts` 中的业务逻辑（如 handleExternalDeletion/Modification）

## Decisions

### Decision 1：三函数 API 设计而非 class/组件化

选择纯函数工厂（`showDialog()`、`showModal()`、`showContextMenuStatic()`）而非 Class 或 WebComponent。

- **理由**：项目的渲染模式是命令式 DOM 操作（innerHTML + createElement），引入声明式组件系统（React/Vue/WebComponent）属于过度设计。纯函数与现有代码风格一致，零新依赖，且易于测试。
- **备选方案**：WebComponent — 引入了 Shadow DOM 复杂性且与现有 CSS class 覆盖模式不兼容。

### Decision 2：`showDialog` 用 Promise 返回结果

```typescript
showDialog(options: DialogOptions): Promise<string | null>
```

外部通过 `await showDialog(...)` 获取用户点击的按钮值（如 `'save'`、`'discard'`、`'cancel'`），对话框关闭返回 `null`。

- **理由**：Promise 模式与 `confirmDocumentTransition()`、`showExternalConflictDialog()` 等现有异步模式完全兼容，替换时签名变化最小。
- **DialogOptions** 包含 `{ title, body, buttons, onClose? }`，buttons 数组决定显示哪些按钮及其返回值。

### Decision 3：`showModal` 用于复杂内容弹窗

```typescript
showModal(options: ModalOptions): { element: HTMLElement, hide(): void }
```

- **理由**：Settings、NewFile 等弹窗内容复杂且包含大量事件绑定（settings tab 切换、toggle 状态变更等），不适合用简单的 buttons 数组描述。由调用方负责构建 `content`（HTMLElement 或 string），框架只管理 overlay、backdrop、Escape 和 close。
- **ModalOptions** 包含 `{ content, className?, onClose? }`

### Decision 4：`showContextMenuStatic` 统一 ContextMenu

```typescript
showContextMenuStatic(items: ContextMenuItem[], position: {x, y}): void
// ContextMenuItem = { label, onClick?, danger?, divider? }
```

- **理由**：三个 ContextMenu 的差异仅在于菜单项内容和点击处理逻辑，提取定位逻辑并统一关闭行为。
- 定位复用现有的 `clampMenuPosition()` 函数（在 `mermaidContextMenu.helpers.ts` 中已有）。
- 点击菜单外部自动关闭由工厂函数管理（document click 监听）。
- 被调用方不接收返回值，菜单项 onClick 中执行副作用即可。

### Decision 5：动态创建 overlay 而非使用 HTML 骨架

- **理由**：消除 index.html 中的 5 个预先放置的 `<div id="xx-modal" class="modal-overlay" hidden>`，改为在 showDialog/showModal 调用时动态创建、关闭时移除。减少 DOM 冗余和跨文件"某个 id 必须在 HTML 中存在"的隐式契约。
- 使用 `document.body.appendChild(overlay)` 添加，关闭后 `overlay.remove()`。
- `contextMenu` 和 `toast` 仍然使用已存在的 `#context-menu` 和 `#toast` 骨架，因为它们是单例频繁开关，动态创建开销不必要。

### Decision 6：`confirmDocumentTransition` 迁移到 showDialog

- `confirmDocumentTransition()` 返回 `Promise<boolean>` 且包含「取消/不保存/保存」三个按钮，是 showDialog 的典型用例。
- 将其内部的 innerHTML + 手动事件管理替换为 showDialog 调用，Promise 包装逻辑由 showDialog 原生支持。
- **接口签名不变**，调用方无需修改。

## Risks / Trade-offs

- **[风险]** Settings 弹窗内容极其复杂（约 300 行模板 + 事件绑定），迁移时引入回归。→ **缓解**：Settings 作为 showModal 使用，其内部内容渲染不变，只替换 overlay 创建/关闭逻辑。
- **[风险]** `confirmDocumentTransition` 有 11 个调用点，内部保存逻辑有 circular import 处理。→ **缓解**：保留现有 dynamic import 路径，只替换 DOM 交互层。
- **[权衡]** 移除 HTML 骨架后，CSS 选择器 `#settings-modal`、`#newfile-modal` 等不再有效。这些在 CSS 中用于 `[hidden]` 和布局规则，需要用 class 替代。→ CSS 中已有 `.modal-overlay[hidden]` 规则，不影响。
- **[风险]** 同时迁移多个弹窗可能导致 PR 过大难以 review。→ **迁移策略**：按「基础函数 → 简单弹窗 → 复杂弹窗」分批迁移，每个批次独立提交。
