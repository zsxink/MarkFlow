## MODIFIED Requirements

### Requirement: 原子文件写入

系统 SHALL 提供可写任意文档 bytes 的 guarded atomic write 基础设施，在同目录临时文件完整写入并同步后，以 `expectedFileIdentity` 和幂等 `saveOperationId` 在同一 native command 内复核目标并原子替换。默认替换必须使用 CAS，或使用能原子保留替换瞬间旧目标的 exchange/backup-preserving replace，再校验 displaced target identity。失败时目标文件不得被截断或部分覆盖；平台无法提供上述能力时，现有目标文件 MUST NOT 被 autosave 或普通 Save 默认覆盖，只能 Save Copy 或人工明确 Force。字符串设置保存可复用该基础设施的 UTF-8 wrapper。

#### Scenario: 原子写入 bytes 成功
- **WHEN** `guarded_atomic_write(path, payload, expectedFileIdentity, saveOperationId)` 被调用
- **THEN** 系统在目标同一目录创建唯一临时文件
- **THEN** 完整 payload bytes 被写入并同步到磁盘
- **THEN** Host 通过匹配 expected identity 的 CAS 提交，或原子 exchange/backup-preserving replace 保留替换瞬间的 displaced target
- **THEN** CAS 已证明 expected identity 匹配；exchange 路径则校验 displaced target identity 与 expected identity 相同
- **THEN** 返回 durable write receipt 与新文件 identity

#### Scenario: 原子写入成功
- **WHEN** 任意文档或设置 wrapper 请求原子写入完整 payload
- **THEN** wrapper 使用同一 guarded atomic write 基础设施完成临时文件写入、同步与原子提交
- **THEN** 成功结果只在完整 payload 已 durable 后返回

#### Scenario: 写入失败保留旧文件
- **WHEN** 临时文件写入或同步失败
- **THEN** 目标文件原始 bytes 保持不变
- **THEN** 系统尽力清理临时文件并返回稳定错误

#### Scenario: 替换失败保留旧文件
- **WHEN** payload 写入成功但目标替换失败
- **THEN** 目标文件保持完整
- **THEN** 临时文件被清理或记录为可识别的恢复文件

#### Scenario: 重命名失败清理
- **WHEN** 平台原子 rename、exchange 或 replace 操作失败
- **THEN** 原目标文件保持完整
- **THEN** 临时文件被清理；若无法安全清理则记录为可识别且不参与正常打开的恢复文件

#### Scenario: 父目录自动创建
- **WHEN** 新文件保存路径的父目录不存在
- **THEN** 系统在创建临时文件前创建父目录

#### Scenario: Save As 目标预期不存在
- **WHEN** expected file identity 为 `Absent`
- **THEN** Host 使用 create-if-absent/no-replace 原语提交新文件
- **THEN** 目标在提交前被其他进程创建时返回 conflict，不覆盖新出现的文件

### Requirement: 文档保存使用原子写入

lossless 文档保存 SHALL 只把 Core `prepare_save` 为已确认 revision 产生的 bytes 交给 guarded atomic write。Host MUST NOT 从前端 Markdown 字符串、ProseMirror serializer 或 rendered DOM 重建 payload。

#### Scenario: confirmed payload 原子保存
- **WHEN** active binding 已 flush 且 Core 返回 revision N 的保存 payload
- **THEN** Host 使用携带 expected identity 与 save operation ID 的 guarded atomic write 写入该 payload
- **THEN** 成功后 Core 把 persisted revision 标记为 N 并记录新 file identity

#### Scenario: 文档保存是原子的
- **WHEN** 用户保存 lossless 文档
- **THEN** Host 只提交 Core 为已确认 revision 准备的完整 payload
- **THEN** 磁盘只能观察到旧文件或完整新文件，不得观察到部分写入结果

#### Scenario: 保存期间出现新 revision
- **WHEN** revision N 正在写入且文档确认了 revision N+1
- **THEN** revision N 的写入可以完成
- **THEN** persisted revision 只更新为 N
- **THEN** 文档保持 dirty

## ADDED Requirements

### Requirement: 原子保存前校验 revision 与文件 identity

原子写入前，系统 MUST 校验 expected revision、无 blocked/pending patch。前端预检查不能替代 Host 原子提交语义。Host 的 identity 结果分两类：CAS/create-if-absent mismatch SHALL 在替换目标前终止；atomic exchange/backup-preserving replace 则在操作后校验被原子保留的 displaced target，mismatch 时 SHALL 保留双方、进入 Conflict 且不得 commit persisted revision。

#### Scenario: 外部修改阻止原子写入
- **WHEN** 保存前磁盘 file identity 与 session 记录不匹配
- **AND** 平台使用 CAS 或 create-if-absent
- **THEN** 系统在替换目标前终止；若临时 payload 已写入则清理或保留为明确 recovery artifact
- **THEN** 返回 external conflict 并保留双方内容

#### Scenario: pending patch 阻止旧 payload
- **WHEN** binding 仍有未确认 patch 或 blocked 状态
- **THEN** 系统不得为旧 confirmed revision 写盘
- **THEN** 用户获得 flush/resync 可恢复状态

#### Scenario: 替换瞬间目标已被外部修改
- **WHEN** prepare 后外部程序在 guarded replace 前改变了目标
- **AND** Host 原子 exchange/replace 保留了替换瞬间的 displaced target
- **THEN** displaced identity 与 expected identity 不匹配
- **THEN** 系统保留 displaced 外部版本与 app payload，进入 conflict，不把 operation 标记成功
- **THEN** 系统只有在能证明目标未被第三方再次改变时才自动恢复 displaced target，否则要求人工 Compare/Save Copy/选择恢复

#### Scenario: 平台不能原子保留 displaced target
- **WHEN** 当前平台没有 CAS、atomic exchange 或 backup-preserving replace capability
- **THEN** 现有文件 autosave 被禁用，普通 Save 不覆盖目标
- **THEN** 用户只能选择 Save Copy，或在明确风险提示后执行 Force overwrite

#### Scenario: reload 或 close 在 replace 点前丢弃已准备保存
- **WHEN** revision N 已通过 prepare，且 guarded write 已完成早期 generation 校验与临时文件 fsync
- **AND** 用户在 native exchange/create 前选择 discard reload 或 close
- **THEN** Host 在同一 per-session lifecycle mutex 中 revoke 对应 receipt 的 prepare `saveEpoch`，并完成 reload/close 状态迁移
- **THEN** guarded write 在 replacement-point 最终校验拒绝 N，且磁盘不包含被丢弃的 payload
- **THEN** 后续 commit 不得把任何新 generation 标记为 N 已持久化

#### Scenario: reload 读盘失败后旧 receipt 仍不得恢复授权
- **WHEN** revision N 已通过 prepare 并持久化 receipt 的 `saveEpoch`
- **AND** reload 已取得 lifecycle mutex、revoke N，但随后读取新磁盘内容失败，session generation 因而尚未变化
- **THEN** guarded write 和 commit 仍必须因 receipt `saveEpoch` 与当前 epoch 不匹配而拒绝 N
- **THEN** 目标文件、receipt terminal state 与 persisted revision 不得被 N 改写

### Requirement: 保存操作必须幂等并可恢复不确定结果

每次保存 SHALL 使用唯一 `saveOperationId` 和 durable write receipt。写盘成功后即使 commit 请求或响应丢失，系统 MUST 通过 receipt、prepared payload hash 与磁盘 identity reconcile，而不是再次无条件写盘或把自身写入误判为外部冲突。

#### Scenario: 写盘成功但 commit 响应丢失
- **WHEN** revision N 已由 guarded atomic write 成功替换目标
- **AND** `commit_document_save` 响应丢失
- **THEN** session 进入 outcome unknown，禁止使用新 operation 盲目重写
- **THEN** `reconcile_document_save(saveOperationId)` 验证 receipt 与磁盘 payload 后幂等标记 revision N persisted

#### Scenario: 重启发现未完成 save receipt
- **WHEN** 应用启动时发现状态为 Prepared 或 Written 的 durable receipt
- **THEN** 系统在允许该路径 autosave 前执行 reconcile
- **THEN** 无法证明磁盘、payload 和 receipt 一致时进入 conflict 并保留 recovery copy

#### Scenario: 无法解析 receipt 不得回退 legacy 写入
- **WHEN** 打开路径发现 corrupt、旧 schema、Written 或 Conflict 的未解决 receipt
- **THEN** 产品显示只含显式 resolve action 的 recovery-only Source surface，并提供 `recoveryPath`（若存在）
- **THEN** 对 corrupt/旧 schema receipt，产品只提供保留原始证据的 quarantine action，不得伪造 accept/discard 结果
- **THEN** 产品不得回落到可写 ProseMirror/legacy editor
- **THEN** legacy `write_file` 入口再次拒绝该路径，直到 durable recovery decision 已记录

#### Scenario: 相同 operation 携带不同 payload
- **WHEN** 已记录的 `saveOperationId` 以不同 payload hash 重试
- **THEN** Host 拒绝该请求
- **THEN** 目标文件与既有 receipt 保持不变
