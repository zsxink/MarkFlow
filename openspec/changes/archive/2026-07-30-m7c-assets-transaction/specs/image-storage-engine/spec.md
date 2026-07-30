## ADDED Requirements

### Requirement: 图片资源事务计划
系统 SHALL 在写入 Markdown 或 Core 保存前创建资源事务计划，计划包含 `sessionId`、`baseRevision`、`requestId`、目标文档路径、原始 Markdown、提议 Markdown、暂存草稿标识和资源映射。

#### Scenario: 计划生成 Markdown patch proposal
- **WHEN** 未保存文档包含暂存图片并选择最终 Markdown 路径
- **THEN** 系统先生成资源事务计划
- **AND** 计划中的提议 Markdown 使用最终资源引用
- **AND** 调用方在计划提交成功前不得修改编辑器 Markdown 真相

#### Scenario: 无资源变更仍产生可提交计划
- **WHEN** 文档没有暂存图片且没有待改写的立即存储绝对引用
- **THEN** 系统返回不含资源映射的事务计划
- **AND** 提议 Markdown 与原始 Markdown 相同

### Requirement: Host 只执行资源 IO
Host SHALL 只接收明确的资源 prepare、write、move、cleanup 或 rollback 请求，并返回文件 identity、错误和可恢复状态；Host MUST NOT 读取编辑器文本或生成 Markdown 引用。

#### Scenario: Host 迁移暂存资源
- **WHEN** Runtime 要迁移暂存图片
- **THEN** Host 根据 `draftId` 与目标文档路径移动或复制资源
- **AND** 返回从暂存路径到最终文件路径的映射
- **AND** 不读取 Markdown 内容

#### Scenario: Host IO 失败
- **WHEN** 任一资源 prepare、write 或 move 失败
- **THEN** Host 返回错误
- **AND** Runtime 不提交 Markdown patch
- **AND** 暂存资源保持可恢复

### Requirement: 资源事务提交和回滚
系统 SHALL 仅在资源 IO 成功且文档写入或 Core 保存成功后提交资源事务；文档提交失败时 SHALL 回滚或保留可恢复记录。

#### Scenario: 文档写入成功后提交事务
- **WHEN** 资源事务计划已生成
- **AND** Markdown 文件写入或 Core 保存成功
- **THEN** 系统提交该资源事务
- **AND** 清理已迁移的暂存草稿

#### Scenario: 文档写入失败后回滚事务
- **WHEN** 资源事务计划已生成并且资源文件已迁移
- **AND** Markdown 文件写入或 Core 保存失败
- **THEN** 系统回滚该资源事务或保留可恢复记录
- **AND** 编辑器 Markdown 不切换到提议 Markdown
- **AND** 暂存草稿不会被成功清理路径误删

### Requirement: 资源事务会话隔离
系统 MUST 将资源事务绑定到 `sessionId + baseRevision + requestId`，并在提交、回滚或异步结果落地前校验当前会话仍匹配。

#### Scenario: 切换文档后拒绝旧事务提交
- **WHEN** A 文档的资源事务已经 prepare
- **AND** 用户切换到 B 文档导致当前 `sessionId` 或 `baseRevision` 不匹配
- **THEN** A 事务不得提交到 B 文档
- **AND** B 文档 Markdown 和资源目录保持不变

#### Scenario: requestId 不匹配
- **WHEN** 资源事务提交请求携带的 `requestId` 与计划不一致
- **THEN** 系统拒绝提交
- **AND** 保留事务为可回滚或可重试状态
