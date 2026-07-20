## 1. 图片插入弹窗结构修复

- [x] 1.1 在 `src/components/toolbar.ts` 的 `showImageInsertDialog()` 中，给 `showModal()` 调用传入 `className: 'image-insert-dialog'`
- [x] 1.2 移除传给 `showModal()` 的 content 最外层 `<div class="modal">`，仅保留 `.modal-header`、内容区域与 `.modal-footer` 作为工厂创建之 `.modal` 的子节点
- [x] 1.3 修正 `src/styles/editor.css` 中的 `.image-insert-dialog .modal { width: 480px }` 为 `.image-insert-dialog { width: 480px }`（类落在 `.modal` 自身）

## 2. 未保存提示尺寸收紧

- [x] 2.1 为 `src/components/ui/dialog.ts` 的 `DialogOptions` 新增可选 `padding?: string` 字段（默认 `'16px 24px'`），并将其用于正文与底部区域的 `<div style="padding:...">`
- [x] 2.2 在 `src/components/sidebar.fileops.ts` 的 `confirmDocumentTransition()` 中将 `width` 由 `'360px'` 改为 `'320px'`、`padding` 设为 `'12px 20px'`，并将正文 `<p>` 内联 `margin-bottom` 由 `16px` 降为 `12px`

## 3. 验证

- [x] 3.1 运行 `npx tsc --noEmit` 确认类型无误（新增可选 `padding` 字段）
- [x] 3.2 运行 `npm test -- src/components` 确认既有测试不回归
- [x] 3.3 手动验证：插入图片弹窗仅一层 `.modal` 且本地文件按钮呈虚线框、宽度 480px；未保存提示收窄且三按钮可点；浅/深主题均正常
