# Proposal

## Why

WYSIWYG 表格当前单元格上下留白偏大，降低表格的信息密度并影响阅读。收紧表格内部间距并保持上下对称，可改善表格行高，同时避免影响表格与相邻段落的布局。

## What Changes

- 调整 WYSIWYG 表格单元格的上下内边距，使表头、普通单元格及多行内容的上下留白保持对称。
- 将样式限制在表格内部，不改变表格与前后段落之间的外部间距。

## Capabilities

### New Capabilities

### Modified Capabilities
- `table-wysiwyg-interaction`: 明确 WYSIWYG 表格单元格上下留白应收紧且对称，且不影响表格外部间距。

## Impact

- 影响 WYSIWYG 编辑器表格相关 CSS，以及 `table-wysiwyg-interaction` 的视觉布局要求；不涉及 API 或依赖变更。
