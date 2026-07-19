# editor-bottom-spacer Specification

## Purpose
定义 WYSIWYG 与源码编辑器底部视觉留白，保证滚动体验在两种模式下保持一致。

## Agent Context
- **源码入口：** `src/styles/editor.css`、`src/lib/editor.ts` 与 `src/lib/editor.source.ts`。
- **关联规范：** `codemirror-source-editor`、`document-size-tier`。
- **不变量：** 留白只影响视觉滚动空间，不得进入 Markdown；两种编辑模式的留白高度必须一致；不得影响末尾光标或选择。
- **验证：** `npm run build`；`npx openspec validate editor-bottom-spacer --strict`。

## Requirements

### Requirement: 所见即所得编辑器底部视觉间隔

The WYSIWYG editor SHALL include approximately 300px of visual empty space below the last content line, so users can scroll past the document end and see context beyond the final line.

#### Scenario: 滚动过去文档末尾显示视觉间隔
- **WHEN** 用户滚动到所见即所得文档的最底部
- **THEN** 最后一行内容下方应可见大约 300 像素的空白空间

#### Scenario: 间隔不干扰编辑
- **WHEN** 用户以所见即所得的方式编辑内容
- **THEN** 视觉间隔不应影响文档末尾的光标定位、内容插入或选择行为

### Requirement: 源编辑器底部视觉间隔

The source editor textarea SHALL include approximately 300px of visual empty space below the last source line, matching the WYSIWYG bottom spacer.

#### Scenario: 源编辑器底部间隔
- **WHEN** 用户滚动到源编辑器文本区域的底部
- **THEN** 最后一个源代码行下方应可见大约 300px 的空白空间

### Requirement: 跨模式一致的垫片高度

视觉间隔在所见即所得和源模式下 MUST 具有相同的高度。

#### Scenario: 模式切换无视觉跳跃
- **WHEN** 用户在所见即所得和源模式之间切换
- **THEN** 底部视觉空间应保持一致，无突然的视觉跳跃
