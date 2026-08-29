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

#### Scenario: 脏文档触发保存
- **WHEN** 自动保存 tick 触发且 session 存在 pending change 或 confirmed revision 高于 persisted revision
- **THEN** 系统 flush pending change，并在成功后调用一次 lossless save coordinator

#### Scenario: pending 输入先 flush
- **WHEN** 自动保存 tick 触发且存在 pending changes
- **THEN** coordinator 先执行有界 flush
- **THEN** flush 成功后只保存最新 confirmed revision

### Requirement: 保存跳过不计为失败

自动保存错误计数 SHALL 只在 flush/prepare/write/commit 的实际失败时增加。干净、保存进行中、外部冲突、blocked/resync 等可解释跳过 SHALL 使用独立状态，不计为连续写入失败。

#### Scenario: 干净文档跳过
- **WHEN** 自动保存因 session 干净而跳过
- **THEN** `autosaveErrorCount` 不增加

#### Scenario: 干净文档跳过不增加错误计数
- **WHEN** 自动保存因 session 干净而跳过
- **THEN** `autosaveErrorCount` 不增加

#### Scenario: 保存进行中跳过
- **WHEN** 上一次保存仍在进行中
- **THEN** 新 tick 不启动并发保存
- **THEN** `autosaveErrorCount` 不增加

#### Scenario: 保存进行中跳过不增加错误计数
- **WHEN** 上一次保存仍在进行中而新 tick 到达
- **THEN** 新 tick 不启动并发保存
- **THEN** `autosaveErrorCount` 不增加

#### Scenario: 连续 tick 不产生并发保存
- **WHEN** 多个自动保存 tick 在一次保存完成前连续到达
- **THEN** 同一 session 同时最多存在一个 save coordinator 操作
- **THEN** 后续 tick 被合并或以可解释状态跳过

#### Scenario: 外部冲突跳过
- **WHEN** file identity 检测到外部修改
- **THEN** 自动保存不覆盖磁盘
- **THEN** 系统进入 external conflict 状态而不是增加普通写入失败计数

#### Scenario: 实际写入失败
- **WHEN** atomic write 或 commit 失败
- **THEN** `autosaveErrorCount` 增加 1
- **THEN** persisted revision 保持不变

#### Scenario: 实际写入失败增加错误计数
- **WHEN** flush、prepare、atomic write 或 commit 实际失败
- **THEN** `autosaveErrorCount` 增加 1
- **THEN** persisted revision 保持不变

#### Scenario: 保存成功
- **WHEN** 指定 confirmed revision 写入并 commit 成功
- **THEN** `autosaveErrorCount` 清零
- **THEN** 只有该 revision 被标记 persisted

#### Scenario: 保存成功清零错误计数
- **WHEN** 指定 confirmed revision 写入并 commit 成功
- **THEN** `autosaveErrorCount` 清零

## ADDED Requirements

### Requirement: 迁移期 Legacy 零编辑写盘保护

在 lossless session 成为默认路径之前，只要产品仍提供 legacy ProseMirror 可写会话，系统 SHALL 把 programmatic hydration、read-only/editable 同步和无正文变化的 editor update 与用户文档 transaction 区分。零用户 transaction 的 legacy 会话 MUST 保持 clean；autosave、手动 Save、关闭和文档切换 MUST NOT 因 ProseMirror serializer 与原 Markdown 不同而写盘。该保护是迁移期安全下限，不代表 legacy 编辑后的 byte fidelity 已满足。

#### Scenario: Legacy 打开后等待两个 autosave tick
- **WHEN** legacy 会话打开 LF、CRLF、CR、Mixed EOL、BOM 或尾部 0/1/2/3 boundary fixture
- **AND** 没有用户文档 transaction
- **AND** autosave 开启并经过至少两个 tick
- **THEN** dirty 保持 false，autosave save count 为 0
- **THEN** 文件 hash、长度和 mtime 不变
- **THEN** 关闭或切换文档不显示未保存提示

#### Scenario: Programmatic editable update 不标脏
- **WHEN** 打开流程同步 read-only/editable 状态或执行 hydration
- **AND** 没有用户文档 transaction
- **THEN** user revision 不增加
- **THEN** 不得通过比较 ProseMirror serializer 输出与输入 Markdown 得出 dirty

#### Scenario: Legacy 干净文档主动保存
- **WHEN** 用户对零 transaction 的 legacy 文档执行主动 Save
- **THEN** 保存入口返回可解释的 clean skip
- **THEN** 不调用 Markdown serializer 或磁盘 write

#### Scenario: Legacy 真实用户编辑仍标脏
- **WHEN** 用户产生一个正文 document-changing transaction
- **THEN** user revision 增加且文档进入 dirty
- **THEN** 系统不得把 P0S 的零编辑保护表述为编辑后 byte-to-byte 已修复

### Requirement: Clean guard 必须位于写入口

自动保存调度器和最终文档 write 入口 SHALL 都检查会话是否存在确认用户变更。即使调用者错误传入 dirty 状态，最终 write 入口也 MUST 对 clean session 返回 `skipped`，不得生成 serializer payload。

#### Scenario: 错误 dirty 状态到达保存入口
- **WHEN** UI/store 错误地把零 transaction 文档标记 dirty 并调用保存
- **THEN** 保存入口根据 session revision/transaction provenance 识别 clean
- **THEN** 不执行 write，且记录可诊断的 clean-skip reason

### Requirement: Blocked pipeline 禁止自动覆盖

patch pipeline 处于 blocked、resyncing 或 identity conflict 时，自动保存 MUST NOT 使用旧 Core snapshot 写盘。

#### Scenario: retry 穷尽后 autosave tick
- **WHEN** 某 patch retry 穷尽且 optimistic text 尚未与 Core 收敛
- **THEN** 自动保存跳过并显示持久的可恢复状态
- **THEN** 磁盘文件与 Core persisted revision 保持不变
