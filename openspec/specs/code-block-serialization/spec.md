# code-block-serialization Specification

## Purpose
TBD - created by archiving change fix-code-block-trailing-newline. Update Purpose after archive.
## Requirements
### Requirement: 围栏代码块尾随换行序列化保真

系统 MUST 确保围栏代码块在 WYSIWYG ↔ Source 模式切换时，节点内容末尾的 0、1、多个换行符在序列化/反序列化后数量不变。

#### Scenario: 无尾随换行的代码块序列化
- **WHEN** ProseMirror 代码块节点的 `textContent` 为 `line`（无尾随换行）
- **THEN** 序列化结果为 `"```bash\nline\n```"`
- **THEN** 再解析后的节点内容仍为 `line`

#### Scenario: 一个尾随换行的代码块序列化
- **WHEN** ProseMirror 代码块节点的 `textContent` 为 `line\n`（一个尾随换行）
- **THEN** 序列化结果为 `"```bash\nline\n\n```"`
- **THEN** 再解析后的节点内容为 `line\n`

#### Scenario: 多个尾随换行的代码块序列化
- **WHEN** ProseMirror 代码块节点的 `textContent` 为 `line\n\n`（两个尾随换行）
- **THEN** 序列化结果为 `"```bash\nline\n\n\n```"`
- **THEN** 再解析后的节点内容为 `line\n\n`

#### Scenario: 无尾随换行的代码块不会新增空行
- **WHEN** ProseMirror 代码块节点的 `textContent` 为 `line`（无尾随换行）
- **THEN** 序列化后再解析的节点内容仍为 `line`
- **THEN** 不会凭空增加空行

#### Scenario: 多个尾随换行在往返中数量不变
- **WHEN** 代码块包含 0、1、2 个尾随换行
- **THEN** 经过 WYSIWYG → Source → WYSIWYG 往返后，尾随换行数量不变

