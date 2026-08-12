## MODIFIED Requirements

### Requirement: Capture trailing newlines on file open

系统 SHALL 在 Core 从原始 bytes 建立文档 session 时识别文末连续换行边界，并把这些边界作为 TextBuffer 与 LineEndingMap 的真实内容保存。系统 MUST NOT 依赖 `documentState.trailingNewlines` 旁路计数作为正文来源。

#### Scenario: File with 2 trailing LF newlines is opened
- **WHEN** 用户打开 bytes 为 `hello\n\n` 的文件
- **THEN** Core 逻辑文本为 `hello\n\n`
- **THEN** LineEndingMap 包含两个 LF 边界
- **THEN** CodeMirror document 包含两个真实尾随换行

#### Scenario: File with 2 visually blank rows after content is opened
- **WHEN** 用户打开 bytes 为 `hello\n\n\n` 的文件
- **THEN** Core 与 CodeMirror 均包含三个真实尾随 line-break boundaries
- **THEN** 产品和验证报告将其描述为“三个尾部换行边界（正文后两个视觉空白行）”，不得简称为“两个尾部换行”

#### Scenario: File with CRLF trailing newlines is opened
- **WHEN** 用户打开 bytes 为 `hello\r\n\r\n` 的文件
- **THEN** Core 逻辑文本为 `hello\n\n`
- **THEN** 两个边界均记录为 CRLF

#### Scenario: File without trailing newline is opened
- **WHEN** 用户打开内容为 `hello` 的文件
- **THEN** Core buffer 末尾不包含换行边界

### Requirement: Restore trailing newlines on save

系统 SHALL 直接从 Core TextBuffer 与 LineEndingMap 生成保存 bytes，使所有未被 patch 覆盖的文末换行及其 EOL 类型保持原样。`getMarkdown()` 不得在保存时追加元数据换行。

#### Scenario: Editing body preserves 2 trailing newlines
- **WHEN** 用户打开 `hello\n\n` 并只修改 `hello`
- **THEN** 保存结果仍以两个 LF 换行结尾
- **THEN** 两个换行不属于正文编辑 patch

#### Scenario: Editing body preserves 2 visually blank rows
- **WHEN** 用户打开 `hello\n\n\n` 并只修改 `hello`
- **THEN** 保存结果仍以三个 LF line-break boundaries 结尾
- **THEN** 三个边界均不属于正文编辑 patch

#### Scenario: Editing body preserves CRLF trailing newlines
- **WHEN** 用户打开 `hello\r\n\r\n` 并只修改正文
- **THEN** 保存结果仍以两个 CRLF 结尾

#### Scenario: Save file without trailing newline
- **WHEN** 用户打开末尾无换行的文件并修改正文
- **THEN** 系统不自动追加文末换行

## REMOVED Requirements

### Requirement: Dirty state is trailing-newline-agnostic

**Reason**: 尾部换行是用户可编辑的真实文档内容。脏检测忽略尾部换行会把用户主动新增/删除文末空行错误判定为无修改，并可能漏保存。

**Migration**: dirty 改由 pending patch、confirmed revision 和 persisted revision 推导。打开时原有尾部换行不会制造 dirty；用户主动修改尾部换行会形成普通 patch 并正确标记 dirty。

## ADDED Requirements

### Requirement: Dirty state tracks intentional trailing-newline edits

用户对文末换行的明确插入或删除 SHALL 像其他文本编辑一样产生 patch、revision 和 dirty 状态。

#### Scenario: Open does not mark dirty
- **WHEN** 用户打开带明确数量尾部换行边界的文件且未编辑
- **THEN** pending changes 为 0
- **THEN** confirmed revision 等于 persisted revision
- **THEN** dirty 为 false

#### Scenario: User deletes one trailing newline
- **WHEN** 用户明确删除一个文末换行
- **THEN** 该删除形成局部 patch
- **THEN** dirty 为 true，直到对应 revision 保存成功

#### Scenario: User adds a trailing newline
- **WHEN** 用户在文末按 Enter 新增换行
- **THEN** 新换行按 EOL 继承规则进入 Core buffer
- **THEN** dirty 为 true
