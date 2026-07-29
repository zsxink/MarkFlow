# source-lifecycle-guard Specification

## Purpose
定义前端 Source 模式的生命周期守卫行为：generation isolation、幂等 close、WYSIWYG dirty gate、opening 禁用编辑。

## ADDED Requirements

### Requirement: generation isolation 屏蔽 stale 响应

CoreSourceCoordinator SHALL 在每次 open/close 时递增 generation。所有异步响应落地前必须校验 (generation, sessionId, requestId)，不匹配时静默丢弃。

#### Scenario: 旧 open 响应不覆盖新 session

- **WHEN** 用户快速切换两次 Source On/Off
- **THEN** 第一个 `openCoreSession` 的异步响应到达时 generation 不匹配
- **THEN** 响应被静默丢弃
- **THEN** 第二个 session 状态不受影响

#### Scenario: 旧 close 响应不重置新 session

- **WHEN** 用户在 close 进行中又 open 新 session
- **THEN** 旧 close 的 finally 块到达时 generation 不匹配
- **THEN** 不执行任何 session 重置操作
- **THEN** 新 session 保持正常工作

### Requirement: 幂等可 await close

`closeCoreSession()` SHALL 返回统一的 `Promise<void>`，调用方可 await 其完成。close 操作幂等，多次调用只执行一次。

#### Scenario: 连续 close 调用

- **WHEN** `closeCoreSession()` 被连续调用 3 次
- **THEN** 第一次实际执行 close 操作
- **THEN** 后续调用立即返回已 resolve 的 Promise
- **THEN** 所有调用者都 await 到 close 完成

### Requirement: Core open 成功后创建 CM

CodeMirror SHALL Core session `open_document` 成功后创建。opening 期间禁用编辑器输入并显示明确状态（loading）。

#### Scenario: opening 期间用户不可编辑

- **WHEN** 用户切入 Source Mode
- **THEN** 编辑器显示 loading 指示器
- **THEN** 编辑输入被禁用（CodeMirror 未创建或处于只读状态）
- **WHEN** `open_document` 返回
- **THEN** 创建 CodeMirror 并以 `opened.text` 初始化
- **THEN** 启用编辑并将焦点交给用户

#### Scenario: open 失败不创建编辑器

- **WHEN** `open_document` 返回错误
- **THEN** 不创建 CodeMirror
- **THEN** 显示错误提示
- **THEN** 保持 WYSIWYG 模式（或回退）

### Requirement: WYSIWYG dirty 阻止 Source 切换

系统 SHALL 在 WYSIWYG 有未保存修改时阻止切入 Core Source Mode，提示用户先保存或放弃。

#### Scenario: WYSIWYG dirty 时阻止切换

- **WHEN** WYSIWYG 模式有未保存修改
- **WHEN** 用户尝试切换到 Source Mode
- **THEN** 显示确认对话框（保存/放弃/取消）
- **THEN** 用户选择保存后先执行 legacy save
- **THEN** 保存成功后才调用 `open_document`
- **THEN** 用户选择放弃后直接重新从磁盘读取
- **THEN** 用户选择取消后停留在 WYSIWYG 模式
