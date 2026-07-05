## Why

当前编辑器（WYSIWYG 和源码模式）底部空间不足，当光标在文档末尾时，最后几行内容紧贴滚动区域底部，无法看到后续内容的上下文。添加约 10 行高度的视觉空行，让用户滚动到末尾时仍能看到内容下方的延续感。

## What Changes

- **WYSIWYG 模式**：在 `.editor-container` 的底部 padding 中增加约 10 行高度的视觉空行（当前已有 `120px` 底部 padding，在此基础上额外叠加）
- **源码模式**：在 `.source-editor` textarea 底部增加相同高度的 padding，使源码编辑时最后一行上方也有充足空间
- 两种模式下视觉空行高度一致，切换时不会产生跳跃感

## Capabilities

### New Capabilities
- `editor-bottom-spacer`: 在编辑器内容区域底部添加视觉空行，WYSIWYG 和源码模式统一

### Modified Capabilities
- *无*（不修改任何已有 spec 级别的行为要求）

## Impact

- `src/styles/main.css`：修改 `.editor-container` 的 `padding-bottom` 值；新增/修改 `.source-editor` 的底部 padding
- 无依赖变更，无 API 修改
- 视觉上仅增加底部空白，不影响编辑器核心功能
