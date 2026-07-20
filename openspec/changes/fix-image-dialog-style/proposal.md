## Why

两个问题弹窗样式不协调（issue #150）：

1. **插入图片弹窗**：`showImageInsertDialog()` 调用 `showModal()` 时未传入 `className: 'image-insert-dialog'`，导致 `editor.css` 中 `.image-insert-dialog ...` 系列规则全部失效；同时传给 `showModal()` 的内容里又嵌套了一层 `<div class="modal">`，而 `showModal()` 本身已创建 `.modal` 容器，形成重复结构。结果是本地文件选择按钮回退成浏览器原生样式、整体布局与预期不符。
2. **未保存提示**：`confirmDocumentTransition()` 把宽度固定为 `360px`，正文 `<p>` 额外带 `margin-bottom: 16px`，再叠加 `showDialog()` 正文 `16px 24px` 与底部 `16px 24px` 的内边距，使弹窗尺寸与垂直留白明显偏大。

两类问题都来自 DOM 结构和 CSS 命中，运行日志无异常，可纯前端修复。

## What Changes

- 为图片插入弹窗传入 `className: 'image-insert-dialog'`，使专用 CSS 正确命中。
- 移除图片插入弹窗内容中的嵌套 `<div class="modal">`，仅保留一层由 `showModal()` 创建的 `.modal` 容器，结构对齐 `dialog-system` 规范。
- 收紧未保存提示弹窗：缩小宽度、减少正文与底部区域的内边距和垂直留白，同时保证「取消 / 不保存 / 保存」按钮完整可点。
- 确保两弹窗在常见窗口尺寸下保持居中、内容不溢出，深浅主题均正常。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dialog-system`：收紧图片插入弹窗与未保存提示弹窗的结构与尺寸要求（图片弹窗不得嵌套 `.modal` 且必须命中 `.image-insert-dialog` 样式；未保存提示的宽度/内边距/垂直留白需收紧）。

## Impact

- `src/components/toolbar.ts` 的 `showImageInsertDialog()`（传入 className、移除嵌套 `.modal`）。
- `src/components/sidebar.fileops.ts` 的 `confirmDocumentTransition()`（收紧 width 与留白）。
- `src/styles/editor.css` 的 `.image-insert-dialog` 相关规则（移除无效后需确认仍被正确引用）。
- 依赖的 `showModal` / `showDialog` 工厂函数行为不变，仅调用方修正。
