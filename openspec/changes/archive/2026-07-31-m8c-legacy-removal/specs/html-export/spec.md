## ADDED Requirements

### Requirement: HTML 导出输入来自 Export IR
HTML export SHALL use HTML rendered from Core Export IR for the initiating `sessionId`, confirmed `revision`, and `exportRequestId`. The HTML export path MUST NOT clone the current editor DOM, read active editor state, or infer the document from the current active window.

#### Scenario: HTML export uses confirmed revision
- **WHEN** the user selects HTML export
- **THEN** Runtime SHALL flush the initiating session
- **THEN** the export adapter SHALL render HTML from Export IR for the confirmed revision
- **THEN** the output SHALL remain bound to the initiating session even if the active document changes

#### Scenario: HTML export cannot use DOM fallback
- **WHEN** Export IR cannot be built
- **THEN** HTML export SHALL fail with a stable export error
- **THEN** HTML export MUST NOT clone `.ProseMirror` from the live editor

## MODIFIED Requirements

### Requirement: 不含编辑器交互控件
导出 HTML SHALL 不包含编辑器交互元素（光标、选区、拖拽控件、NodeView 按钮、右键菜单等）。M8C removal 后，该要求 SHALL 通过 Export IR renderer 只生成导出允许的结构来满足，而不是依赖清理实时编辑器 DOM clone。

#### Scenario: 导出结构不生成编辑器控件
- **WHEN** 系统从 Export IR 生成 HTML
- **THEN** 输出 SHALL 不包含 `contenteditable`、`draggable`、`.ProseMirror-cursorWrapper`、NodeView 控件元素
- **AND** 导出 HTML 不得包含任何编辑器专用 CSS 类名对应的交互样式
