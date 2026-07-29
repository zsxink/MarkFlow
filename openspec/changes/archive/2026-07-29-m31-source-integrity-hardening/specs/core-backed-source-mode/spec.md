# core-backed-source-mode Specification (Delta for M3.1)

## MODIFIED Requirements

### Requirement: Source Mode opens files via Runtime session（修改 — 添加 opening 状态）

系统 SHALL 在 Source Mode 打开文件时，通过 Runtime `open_document` 创建 Core session，并以 session text 初始化 CodeMirror。CodeMirror SHALL 在 `open_document` 成功返回后才创建；opening 期间显示 loading 指示器并禁用编辑。

#### Scenario: opening 期间显示加载状态

- **WHEN** 用户打开一个文件并进入 Source Mode
- **THEN** 编辑器区域显示 loading 指示器
- **THEN** 用户无法在 CodeMirror 中输入
- **WHEN** `open_document` 返回
- **THEN** CodeMirror 以 `opened.text` 初始化
- **THEN** 启用编辑输入

#### Scenario: Source Mode open 调用 open_document 命令（未改动）

- **WHEN** `open_document` 返回
- **THEN** 返回 `DocumentOpened`（含 sessionId、revision、text、outline、stats）
- **THEN** CodeMirror 以 `opened.text` 初始化文档

### Requirement: WYSIWYG → Source 切换（修改 — 添加 dirty gate）

从 WYSIWYG 切换到 Source Mode 时 SHALL 通过 `open_document` 创建 Core session；若 WYSIWYG dirty，先提示保存或放弃。dirty 处理完成前不得执行 `open_document`。

#### Scenario: WYSIWYG dirty 时切换需要先处理脏状态（增强）

- **WHEN** WYSIWYG 模式有未保存修改
- **WHEN** 用户切换到 Source Mode
- **THEN** 提示用户保存或放弃修改
- **THEN** 用户选择保存 → 执行 legacy save → 成功后调用 `open_document`
- **THEN** 用户选择放弃 → 直接调用 `open_document`（从磁盘读取）
- **THEN** 用户选择取消 → 停留在 WYSIWYG 模式
- **THEN** 用户在处理脏状态前，切换操作被阻塞

### Requirement: Source → WYSIWYG 切换（修改 — 严格 barrier）

从 Source Mode 切换到 WYSIWYG 时 SHALL 先执行严格 flush barrier（flush 全部 pending transaction），再将 confirmed text 注入 WYSIWYG legacy 视图。

#### Scenario: flush 超时阻止切换（增强）

- **WHEN** `flush_document` 超时
- **THEN** 阻止切换到 WYSIWYG 模式
- **THEN** 用户看到明确的超时错误提示
- **THEN** 用户可重试或取消切换
- **THEN** pending transaction 不丢失

### Requirement: closeCoreSession 防重入（修改 — 幂等可 await）

closeCoreSession SHALL 是幂等、可 await 的操作。返回统一的 `Promise<void>`，调用方可等待其完成。不再使用 `closeInProgress` boolean 短路。

#### Scenario: 快速切换不破坏 session 状态（增强）

- **WHEN** 用户快速连续执行 Source → WYSIWYG → Source 切换 3 次以上
- **THEN** 每次 close 都返回 Promise，调用方 await 完成
- **THEN** 每次 open 使用新 generation 标签
- **THEN** 旧 generation 的异步响应被静默丢弃
- **THEN** patcher 不停止工作
- **THEN** 每次切回 Source 后 CM6 内容与 Core confirmed snapshot 一致

### Requirement: 保存内容只来自 Core confirmed snapshot（修改 — 明确 Save As）

Source Mode 保存 SHALL 只使用 Core `SavePayload` 的输出。Save As SHALL 通过创建新 Core session 并执行 `save_document` 完成。

#### Scenario: Save As 不经过 serializer

- **WHEN** Source Mode 中用户执行 Save As
- **THEN** 创建新路径的 Core session
- **THEN** 使用 Core confirmed text 初始化新 session
- **THEN** 新 session 调用 `save_document`
- **THEN** 完成后当前 session 切换为目标路径
- **THEN** getMarkdown() 在过程中未被调用

## ADDED Requirements

### Requirement: feature flag 可配置

Core-backed Source Mode 的启用状态 SHALL 可从用户配置中读取，而非硬编码。

#### Scenario: 关闭 feature flag 回退 legacy

- **WHEN** `isCoreBackedSourceModeEnabled()` 返回 false
- **THEN** Source Mode 使用 legacy path（不创建 Core session）
- **THEN** 所有编辑和保存行为与 M2 一致
- **THEN** 运行时切换后下次 Source 切换时生效
