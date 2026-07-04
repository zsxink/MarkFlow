## Context

MarkFlow 目前没有关闭窗口时的未保存提示。用户编辑文档后直接关闭窗口，如果有未保存修改，内容会丢失。

当前状态：
- `isDocumentDirty()` 已实现，通过比较当前内容与 `lastPersistedMarkdown` 的差异判断是否脏
- `main.ts` 中已有 `beforeunload` 监听器（仅保存窗口位置，不处理未保存状态）
- Tauri v2 提供 `getCurrentWebviewWindow().onCloseRequested()` API，可在窗口关闭前拦截并执行自定义逻辑
- 已有多个对话框实现（插入图片、链接、新建文件、外部冲突），使用统一的 modal-overlay → modal → modal-header 架构，但风格细节散布在 CSS 中

## Goals / Non-Goals

**Goals:**
- 关闭窗口时检测 dirty state，如有未保存修改则弹出保存确认对话框
- 对话框提供三个操作：保存并关闭、不保存直接关闭、取消关闭
- 对话框与现有插入图片弹窗风格一致（modal-overlay → modal → modal-header 架构）
- 提取统一的 dialog-system 规范，记录所有对话框共用的结构、样式和交互模式

**Non-Goals:**
- 不涉及编辑器内部的文件标签页关闭（目前 MarkFlow 单窗口单文档，无多标签页）
- 不修改现有对话框的行为
- 不引入新的 CSS-in-JS 方案或 UI 框架

## Decisions

### 决策 1：使用 Tauri 的 `onCloseRequested` 而非 `beforeunload`

- **选择**：`getCurrentWebviewWindow().onCloseRequested()`
- **理由**：浏览器 `beforeunload` 在 Tauri 桌面环境中触发时机不可靠，且不能返回异步结果（dialog 需要等待用户选择）。`onCloseRequested` 是 Tauri v2 的原生 API，支持异步 handler，可以阻止关闭事件（不调用 `event.preventDefault()` 只是不继续，实际上需要调用 `event.preventDefault()` 阻止默认关闭，然后手动控制关闭流程）。
- **替代方案**：`beforeunload` + 同步 confirm — 无法实现自定义样式的 dialog，只能使用浏览器原生 confirm。

### 决策 2：对话框基于现有 modal 架构实现

- **选择**：使用与插入图片弹窗相同的 HTML + CSS 架构（overlay → modal → header + body + 按钮组）
- **理由**：保持一致性的要求。现有架构已在多个 dialog 中使用且工作良好，无需引入新框架
- **替代方案**：Tauri 原生 dialog API (`@tauri-apps/plugin-dialog`) — 风格与自定义 CSS 不一致，无法满足"与插入图片弹窗一致"的要求

### 决策 3：三个按钮 vs 两个按钮

- **选择**：三个按钮 — 「保存（Save）」「不保存（Don't Save）」「取消（Cancel）」
- **理由**：这是 macOS / Windows 平台保存提示的标准模式。三个选项分别对应保存后关闭、丢弃修改后关闭、取消关闭操作返回编辑
- **替代方案**：两个按钮（保存 / 取消）— 用户无法放弃修改直接关闭，体验不完整

### 决策 4：dialog-system spec 提取

- **选择**：新建 `dialog-system` 能力规范，集中记录 modal 结构、CSS 变量、交互模式（关闭方式、键盘导航），而非分散在各个组件的 spec 中
- **理由**：所有对话框共享相同的 overlay/modal/header/button 架构，集中记录减少重复，为后续新增对话框提供一致参考
- **替代方案**：在 `unsaved-close-prompt` spec 中内嵌样式说明 — 无法达成"提取一致风格更新到 spec"的需求

## Risks / Trade-offs

- **[Risk] `onCloseRequested` 在快速关闭流程中可能不触发** → 经过 Tauri v2 源码确认，`onCloseRequested` 在用户点击关闭按钮、Cmd+W、进程结束等场景均会触发。作为 fallback，可额外监听 `beforeunload`。
- **[Risk] 用户启用了自动保存时 dirty state 可能不存在** → 如果自动保存间隔短，关闭时内容可能刚刚被保存（dirty = false），此时直接关闭不弹提示。这是预期行为。
- **[Risk] 保存操作可能失败** → 用户点击"保存并关闭"后，如果保存失败（磁盘写入错误），应显示 toast 错误提示，窗口保持打开状态，不关闭窗口。
