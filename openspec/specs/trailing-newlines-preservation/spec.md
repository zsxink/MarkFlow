## Purpose

在 ProseMirror Document 与磁盘文件之间，通过元数据层保留尾部换行符，保证打开文件不被误标记 dirty、保存往返无损。

## Requirements

### Requirement: Capture trailing newlines on file open

系统 SHALL 在打开 Markdown 文件时，从原始文件内容中捕获末尾连续 `\n` 的数量，并存入 `documentState.trailingNewlines`。

#### Scenario: File with 2 trailing newlines is opened
- **WHEN** 用户打开内容为 `hello\n\n` 的文件
- **THEN** `documentState.trailingNewlines` 的值 SHALL 为 `2`

#### Scenario: File without trailing newline is opened
- **WHEN** 用户打开内容为 `hello` 的文件（末尾无换行符）
- **THEN** `documentState.trailingNewlines` 的值 SHALL 为 `0`

### Requirement: Restore trailing newlines on save

系统 SHALL 在未编辑的文档保存时保留打开时的尾部换行符；用户在 WYSIWYG 模式编辑后保存时，系统 SHALL 不复活无法在该模式中直接编辑的历史 EOF 空行。源码模式 SHALL 始终按用户输入输出精确文本。

#### Scenario: Save preserves trailing newlines
- **WHEN** 用户打开 `hello\n\n` 后不做任何编辑，直接保存
- **THEN** 写入磁盘的文件内容 SHALL 为 `hello\n\n`（尾部 2 个换行符被保留）

#### Scenario: Save file without trailing newlines
- **WHEN** 用户打开内容为 `hello` 的文件（无尾部换行）后保存
- **THEN** 写入磁盘的文件内容 SHALL 为 `hello`（不追加多余换行符）

#### Scenario: WYSIWYG edit removes historical trailing blank lines
- **WHEN** 用户打开 `hello\n\n`，在 WYSIWYG 中编辑内容并保存
- **THEN** 写入内容不得复活打开时记录的尾部空行

### Requirement: Dirty state follows the active editing mode

脏检测 SHALL 将当前序列化内容与精确的已持久化内容比较，不得笼统忽略尾部换行符差异。未编辑的 WYSIWYG 文档 SHALL 保持 clean，并在保存时通过已捕获的尾部换行元数据保留原文件；WYSIWYG 用户编辑后的保存 SHALL 不复活不可直接编辑的历史 EOF 空行。源码模式 SHALL 按经图片/换行符归一化后的源码与持久化内容比较和保存；尾部换行符增删属于内容变更，除明确的归一化外不得用 WYSIWYG 的尾部元数据覆盖源码。

#### Scenario: Opening a file remains clean in WYSIWYG
- **WHEN** 用户打开 `hello\n\n` 文件且不做任何编辑
- **THEN** dirty 状态 SHALL 为 `false`
- **AND** 直接保存 SHALL 保留 `hello\n\n`

#### Scenario: WYSIWYG edit omits historical EOF blank lines
- **WHEN** 用户打开 `hello\n\n` 文件，在 WYSIWYG 中编辑内容并保存
- **THEN** 写入内容 SHALL 不复活打开时记录的尾部换行符

#### Scenario: Source mode tracks exact EOF text
- **WHEN** 用户在源码模式打开 `hello\n\n` 并增删尾部换行符
- **THEN** dirty 状态 SHALL 按当前源码经归一化后的内容与已持久化文本比较，尾部换行符差异计入 dirty
- **AND** 保存 SHALL 写入源码模式的内容（图片行及 CRLF 归一化除外）
