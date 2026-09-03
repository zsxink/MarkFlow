# code-block-serialization Specification

## Purpose
TBD - created by archiving change fix-code-block-trailing-newline. Update Purpose after archive.
## Requirements
### Requirement: 围栏代码块尾随换行序列化保真

系统 MUST 确保普通围栏代码块以及 Mermaid/PlantUML 图表围栏在 WYSIWYG ↔ Source 模式切换时，语言或信息字符串、节点正文、围栏边界和正文末尾的 0、1、多个换行符均可安全往返。序列化器 MUST 选择不会被正文提前闭合的围栏长度。

#### Scenario: 无尾随换行的代码块序列化
- **WHEN** 语言为 `bash` 的代码块节点正文为 `line`（无尾随换行）
- **THEN** 序列化结果包含语言信息、完整正文和闭合围栏
- **THEN** 再解析后的节点正文仍为 `line`

#### Scenario: 一个尾随换行的代码块序列化
- **WHEN** 代码块节点正文为 `line\n`（一个尾随换行）
- **THEN** 序列化结果在结束围栏前保留该换行
- **THEN** 再解析后的节点正文为 `line\n`

#### Scenario: 多个尾随换行的代码块序列化
- **WHEN** 代码块节点正文为 `line\n\n`（两个尾随换行）
- **THEN** 序列化结果在结束围栏前保留全部换行
- **THEN** 再解析后的节点正文为 `line\n\n`

#### Scenario: 无尾随换行的代码块不会新增空行
- **WHEN** 代码块节点正文为 `line`（无尾随换行）
- **THEN** 序列化后再解析的节点正文仍为 `line`
- **THEN** 不会凭空增加正文尾随换行

#### Scenario: 多个尾随换行在往返中数量不变
- **WHEN** 代码块包含 0、1、2 个尾随换行
- **THEN** 经过 WYSIWYG → Source → WYSIWYG 往返后，尾随换行数量不变

#### Scenario: 正文包含围栏字符
- **WHEN** 代码块正文包含长度等于或大于默认围栏的连续反引号
- **THEN** 序列化器选择足以包裹正文的更长围栏或等价安全围栏
- **THEN** 再解析时正文不会被提前截断

#### Scenario: Mermaid 与 PlantUML 类型往返
- **WHEN** 文档包含 `mermaid` 或 `plantuml` 信息字符串的围栏代码块
- **THEN** 往返结果保留原图表类型和完整源码
- **THEN** WYSIWYG 渲染结果、错误占位或网络状态不得进入 Markdown 正文

