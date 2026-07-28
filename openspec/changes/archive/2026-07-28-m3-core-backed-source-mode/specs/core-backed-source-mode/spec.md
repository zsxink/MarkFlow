## ADDED Requirements

### Requirement: Source Mode opens files via Runtime session

系统 SHALL 在 Source Mode 打开文件时，通过 Runtime `open_document` 创建 Core session，并以 session text 初始化 CodeMirror，而非直接使用 `readFile()`。

#### Scenario: Source Mode open 调用 open_document 命令

- **WHEN** 用户打开一个文件并进入 Source Mode
- **THEN** 系统调用 `open_document(path)` Tauri 命令
- **THEN** Runtime 读取磁盘字节并创建 `DocumentSession`
- **THEN** Core 执行 `parse_index`、stats、size class 计算
- **THEN** 返回 `DocumentOpened`（含 sessionId、revision、text、outline、stats）
- **THEN** CodeMirror 以 `opened.text` 初始化文档

#### Scenario: 不编辑再保存 byte-for-byte 一致

- **WHEN** 文件通过 Core-backed Source Mode 打开后不做任何编辑
- **WHEN** 用户执行保存操作
- **THEN** 写入磁盘的内容与原始文件 byte-for-byte 一致

### Requirement: 保存内容只来自 Core confirmed snapshot

Source Mode 保存 SHALL 只使用 Core `SavePayload` 的输出，不得调用 `getMarkdown()`、`getSourceContent()` 或任何前端 serializer。

#### Scenario: save_document 不经过 ProseMirror serializer

- **WHEN** Source Mode 中用户点击保存
- **THEN** 保存入口调用 `save_document(session_id)` 而非 `getMarkdown()`
- **THEN** Runtime 从 Core 获取 `SavePayload`
- **THEN** Host 执行 atomic write
- **THEN** 测试 mock 验证 `getMarkdown()` 在保存过程中未被调用

#### Scenario: 保存失败不 fallback 到 serializer

- **WHEN** `save_document` 在 Core 阶段失败
- **THEN** 返回明确错误码，不调用 `getMarkdown()` fallback
- **THEN** dirty 状态保持 true
- **THEN** 用户收到可恢复的错误提示

### Requirement: dirty 状态由 Core revision 计算

Source Mode dirty 状态 SHALL 由 `pending_transaction_count > 0 || confirmed_revision != persisted_revision || external_conflict_state != clean` 决定，不再由前端 serializer 的字符串比较决定。

#### Scenario: 编辑后 dirty 为 true

- **WHEN** Source Mode 中用户输入文字
- **WHEN** `confirmed_revision > persisted_revision`
- **THEN** dirty 状态为 true

#### Scenario: 保存成功后 dirty 为 false

- **WHEN** `save_document` 成功返回
- **THEN** `persisted_revision` 更新为当前 `confirmed_revision`
- **THEN** dirty 状态为 false

#### Scenario: 保存期间新输入保持 dirty

- **WHEN** 保存进行中时有新的 patch ack 到达
- **THEN** 保存仅标记 `target_revision` 为 persisted
- **THEN** `confirmed_revision > persisted_revision` 成立
- **THEN** dirty 状态为 true

### Requirement: 数据保真约束

系统 SHALL 在 Core-backed Source Mode 路径下保留所有 M1/M2 定义的格式保真约束。

#### Scenario: CRLF 文档保存后仍为 CRLF

- **WHEN** 一个 CRLF fixture 在 Source Mode 中打开、编辑、保存
- **THEN** 写入磁盘的文件中每行末尾仍为 CRLF

#### Scenario: UTF-8 BOM 保留

- **WHEN** 含 UTF-8 BOM 的 fixture 在 Source Mode 中打开、编辑、保存
- **THEN** 输出文件仍含 UTF-8 BOM

#### Scenario: 未触及区域 byte-for-byte 一致

- **WHEN** 在 Source Mode 中做单段落的 patch 编辑后保存
- **THEN** 编辑范围外的原始字节区域与原始文件 byte-for-byte 一致

### Requirement: WYSIWYG legacy 路径隔离

Core-backed Source Mode 与 WYSIWYG legacy 路径 SHALL 保持隔离，互不干扰。

#### Scenario: WYSIWYG 打开保存仍走 legacy 路径

- **WHEN** 用户在 WYSIWYG 模式打开并保存文件
- **THEN** 仍使用 `getMarkdown()` + `write_file` legacy 路径
- **THEN** 不创建 Core session

#### Scenario: 状态栏显示 active engine

- **WHEN** Source Mode Core-backed 路径激活
- **THEN** 状态栏显示 "Core Source"
- **WHEN** WYSIWYG legacy 路径激活
- **THEN** 状态栏显示 "Legacy WYSIWYG"

### Requirement: WYSIWYG → Source 切换

从 WYSIWYG 切换到 Source Mode 时 SHALL 通过 `open_document` 创建 Core session；若 WYSIWYG dirty，先提示保存或放弃。

#### Scenario: WYSIWYG dirty 时切换需要先处理脏状态

- **WHEN** WYSIWYG 模式有未保存修改
- **WHEN** 用户切换到 Source Mode
- **THEN** 提示用户保存或放弃修改
- **THEN** 确认后再调用 `open_document` 从磁盘建立 Core session

### Requirement: Source → WYSIWYG 切换

从 Source Mode 切换到 WYSIWYG 时 SHALL 先 flush Core pending patch，再将 confirmed text 注入 WYSIWYG legacy 视图。

#### Scenario: flush 失败阻止切换

- **WHEN** `flush_document` 超时或失败
- **THEN** 阻止切换到 WYSIWYG 模式
- **THEN** 用户看到明确的错误提示