## Why

当前关闭 MarkFlow 窗口或标签页时，如果文档有未保存的修改，不会提示用户保存，导致内容可能丢失。用户期望在关闭前收到保存提示，与大多数现代编辑器的行为一致。

## What Changes

- 拦截窗口关闭事件，检测当前文档是否有未保存的修改（dirty state）
- 如有未保存修改，弹出提示对话框，提供三个选项：**保存**（先保存再关闭）、**不保存**（放弃修改直接关闭）、**取消**（取消关闭操作）
- 对话框的视觉风格与现有的插入图片弹窗保持一致（使用相同的 modal 架构）
- 将统一的弹窗/对话框风格提取为可复用的 spec（`dialog-system`），涵盖现有所有对话框（插入图片、新建文件、链接、关闭保存提示）

## Capabilities

### New Capabilities
- `unsaved-close-prompt`: 关闭窗口时的未保存提示功能。检测 dirty state，弹出保存确认对话框，提供保存/放弃/取消操作
- `dialog-system`: MarkFlow 统一的对话框系统规范。定义 modal 的结构、样式变量、交互行为，确保所有对话框（插入图片、新建文件、链接、关闭保存提示等）风格一致

### Modified Capabilities

无。本变更不修改现有功能的 spec-level 需求。

## Impact

### 前端代码
- **新文件**：`src/components/unsavedDialog.ts` — 未保存提示对话框组件
- **修改文件**：`src/main.ts` — 注册窗口关闭事件监听，添加关闭拦截逻辑
- **修改文件**：`src/styles/main.css` — 新增对话框样式（如需），提取通用 dialog 变量
- **引用**：`src/lib/editor.ts` — 使用已有的 `isDocumentDirty()` 检测状态

### 后端代码
- **修改文件**：`src-tauri/src/lib.rs` — 无需修改后端（关闭事件由前端拦截，通过 Tauri v2 `onCloseRequested` API）

### 依赖
- 无新增外部依赖。使用已有的 `@tauri-apps/api/webviewWindow` 中的 `getCurrentWebviewWindow().onCloseRequested()`
