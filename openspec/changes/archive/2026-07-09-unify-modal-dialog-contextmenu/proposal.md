## Why

当前项目中有 7 种弹窗（Settings、NewFile、ImageInsert、Link、UnsavedChanges、ExternalConflict、ExternalDeletion）、3 种 ContextMenu（FileTree、Image、Mermaid）以及 Toast，各自独立实现。每个弹窗都重复实现了 backdrop click 关闭、Escape 键关闭、focus 管理、Promise 包装等功能，导致代码维护成本高、行为不一致（如 ExternalConflict/Deletion 对话框缺少 Escape 关闭和 backdrop 点击关闭）。

## What Changes

- 创建三个统一的核心函数：`showDialog()`、`showModal()`、`showContextMenuStatic()`
- 将现有 7 种弹窗迁移到 `showDialog()` / `showModal()` 统一 API
- 将 3 种 ContextMenu 迁移到 `showContextMenuStatic()` 统一 API
- Toast 保持轻量但提取成工厂函数
- 删除冗余的 HTML 骨架元素（`settings-modal`、`newfile-modal`、`image-modal`、`link-modal`、`unsaved-modal`）
- **BREAKING**: `confirmDocumentTransition()` 内部实现变更（接口签名不变，仍返回 `Promise<boolean>`）
- 不改变现有 CSS 类名结构 —— 只统一 JS 创建逻辑，样式保持原有类名

## Capabilities

### New Capabilities
- `dialog`：统一对话框 API，支持 title/body/buttons/X 及 Promise resolve，自动处理 backdrop、Escape、focus
- `modal`：统一内容型弹窗 API，支持 content/className/onClose，用于设置、新文件等复杂内容弹窗
- `context-menu`：统一 ContextMenu API，支持 items 列表 + position，处理定位与外部关闭

### Modified Capabilities
- （无 spec 级别行为变更，仅实现重构）

## Impact

- 涉及文件：`src/components/settings.ts`、`src/components/newFileDialog.ts`、`src/components/linkDialog.ts`、`src/components/toolbar.ts`（图片对话框部分）、`src/components/sidebar.ts`（confirmDocumentTransition）、`src/components/unsavedDialog.ts`、`src/components/sidebar.conflict.ts`、`src/components/contextMenu.ts`、`src/components/imageContextMenu.ts`、`src/components/mermaidContextMenu.ts`、`src/components/toast.ts`
- 新增文件：`src/components/ui/dialog.ts`、`src/components/ui/modal.ts`、`src/components/ui/contextMenu.ts`
- 删除：`src/components/unsavedDialog.ts`（能力被 showDialog 替代）
- `index.html`：移除预置的 modal-overlay 骨架元素
