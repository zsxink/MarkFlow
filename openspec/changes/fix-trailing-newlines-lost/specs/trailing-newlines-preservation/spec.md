## ADDED Requirements

### Requirement: Capture trailing newlines on file open

系统 SHALL 在打开 Markdown 文件时，从原始文件内容中捕获末尾连续 `\n` 的数量，并存入 `documentState.trailingNewlines`。

#### Scenario: File with 2 trailing newlines is opened
- **WHEN** 用户打开内容为 `hello\n\n` 的文件
- **THEN** `documentState.trailingNewlines` 的值 SHALL 为 `2`

#### Scenario: File without trailing newline is opened
- **WHEN** 用户打开内容为 `hello` 的文件（末尾无换行符）
- **THEN** `documentState.trailingNewlines` 的值 SHALL 为 `0`

### Requirement: Restore trailing newlines on save

系统 SHALL 在 `getMarkdown()` 输出时，根据 `trailingNewlines` 元数据将对应数量的换行符追加到序列化结果末尾。

#### Scenario: Save preserves trailing newlines
- **WHEN** 用户打开 `hello\n\n` 后不做任何编辑，直接保存
- **THEN** 写入磁盘的文件内容 SHALL 为 `hello\n\n`（尾部 2 个换行符被保留）

#### Scenario: Save file without trailing newlines
- **WHEN** 用户打开内容为 `hello` 的文件（无尾部换行）后保存
- **THEN** 写入磁盘的文件内容 SHALL 为 `hello`（不追加多余换行符）

### Requirement: Dirty state is trailing-newline-agnostic

脏检测 SHALL 在比较当前内容与已持久化内容时，两侧统一剥离尾部换行符，使尾部换行符数量不影响 dirty 判断。

#### Scenario: Open file does not mark dirty
- **WHEN** 用户打开 `hello\n\n` 文件
- **THEN** dirty 状态 SHALL 为 `false`
- **AND** 不做任何编辑时，dirty 状态 SHALL 保持 `false`

#### Scenario: Content edit overcomes trailing newline diff
- **WHEN** 用户打开 `hello\n\n` 文件，将内容改为 `world`
- **THEN** dirty 状态 SHALL 为 `true`（内容确实有改动）
