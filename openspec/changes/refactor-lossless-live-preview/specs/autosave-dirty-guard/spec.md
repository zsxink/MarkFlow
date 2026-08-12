## MODIFIED Requirements

### Requirement: 自动保存仅处理脏文档

自动保存 tick SHALL 仅在 lossless session 存在未持久化状态时触发保存。dirty MUST 由 `pendingChanges > 0` 或 `confirmedRevision != persistedRevision` 推导，不得通过剥离尾部换行或比较规范化 Markdown 字符串得到。

#### Scenario: 干净文档不触发保存
- **WHEN** 自动保存 tick 触发
- **AND** pending changes 为 0 且 confirmed revision 等于 persisted revision
- **THEN** 不调用文档保存
- **THEN** 文件 mtime 和 hash 不变

#### Scenario: confirmed 脏文档触发保存
- **WHEN** 自动保存 tick 触发
- **AND** confirmed revision 高于 persisted revision
- **THEN** 调用一次 lossless save coordinator

#### Scenario: pending 输入先 flush
- **WHEN** 自动保存 tick 触发且存在 pending changes
- **THEN** coordinator 先执行有界 flush
- **THEN** flush 成功后只保存最新 confirmed revision

### Requirement: 保存跳过不计为失败

自动保存错误计数 SHALL 只在 flush/prepare/write/commit 的实际失败时增加。干净、保存进行中、外部冲突、blocked/resync 等可解释跳过 SHALL 使用独立状态，不计为连续写入失败。

#### Scenario: 干净文档跳过
- **WHEN** 自动保存因 session 干净而跳过
- **THEN** `autosaveErrorCount` 不增加

#### Scenario: 保存进行中跳过
- **WHEN** 上一次保存仍在进行中
- **THEN** 新 tick 不启动并发保存
- **THEN** `autosaveErrorCount` 不增加

#### Scenario: 外部冲突跳过
- **WHEN** file identity 检测到外部修改
- **THEN** 自动保存不覆盖磁盘
- **THEN** 系统进入 external conflict 状态而不是增加普通写入失败计数

#### Scenario: 实际写入失败
- **WHEN** atomic write 或 commit 失败
- **THEN** `autosaveErrorCount` 增加 1
- **THEN** persisted revision 保持不变

#### Scenario: 保存成功
- **WHEN** 指定 confirmed revision 写入并 commit 成功
- **THEN** `autosaveErrorCount` 清零
- **THEN** 只有该 revision 被标记 persisted

## ADDED Requirements

### Requirement: Blocked pipeline 禁止自动覆盖

patch pipeline 处于 blocked、resyncing 或 identity conflict 时，自动保存 MUST NOT 使用旧 Core snapshot 写盘。

#### Scenario: retry 穷尽后 autosave tick
- **WHEN** 某 patch retry 穷尽且 optimistic text 尚未与 Core 收敛
- **THEN** 自动保存跳过并显示持久的可恢复状态
- **THEN** 磁盘文件与 Core persisted revision 保持不变
