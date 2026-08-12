# 保存、资源事务与外部冲突设计

## 1. 保存原则

保存 payload 只能来自 Core confirmed revision。以下来源禁止进入保存：

- `editor.storage.markdown.getMarkdown()`；
- `getMarkdown()/setMarkdown()`；
- `normalizeImageMarkdown()` 全文输出；
- ProseMirror document/serializer；
- rendered DOM、widget DOM、preview HTML；
- optimistic CM doc 的未确认全文快照。

## 2. Save 状态机

```text
Idle
  -> FlushPending
  -> ResourcePreflight(no durable save operation)
  -> ApplyResourcePatchAndFlush
  -> PrepareFinal(expected revision + file identity + fresh saveOperationId)
  -> GuardedAtomicWrite(expected identity + operation token)
  -> CommitOrReconcilePersistedRevision
  -> Idle
```

分支：

- Flush `Blocked`：停止，不写盘；
- file identity changed：进入 Conflict；
- resource prepare failed：撤销未提交资源，正文不写盘；
- atomic write failed：原文件保留，persisted revision 不变；
- 写盘时出现新编辑：已准备 revision 可完成写盘，但保存后仍 dirty；
- commit response stale：按 session/revision 判断，不得把更新 revision 错标为 persisted。
- write 成功但 commit/response 丢失：进入 `OutcomeUnknown(saveOperationId)`，禁止盲目重写；调用 reconcile 确认磁盘 receipt/payload hash 后幂等 commit。

Resource preflight 只验证资源计划和暂存能力，不创建 durable save receipt，也不取得 `saveOperationId`。资源局部 patch 应用并获得 Core ack 后，SaveCoordinator 才为最终 confirmed revision/payload 分配新 operation。任一 revision 或 payload hash 变化都必须使用新的 operation ID。

## 3. Atomic write

Host 暴露单一 `guarded_atomic_write(path, payload/token, expectedFileIdentity, saveOperationId)`，在目标目录创建唯一临时文件、写入并 flush，随后在同一 native command 内执行平台 CAS；若平台没有 CAS，则执行能保留 displaced target 的 atomic exchange/backup-preserving replace 并在操作后校验 displaced identity。预检查、原子提交和结果分类不得拆成前端多个调用。

`saveOperationId` 必须幂等。Host 在应用配置目录保存小型 durable receipt：operation ID、目标路径 hash、expected/new identity、payload hash、状态 `Prepared/Written/Committed`，receipt 自身需要原子写与 flush。相同 operation/payload 重试返回原结果；相同 operation 不同 payload 被拒绝。

平台竞态语义必须在 P0 ADR 声明：

- 优先使用真正 compare-and-swap；若系统只提供替换，则必须使用能在同一原子操作中保留“替换瞬间旧目标”的 atomic exchange 或 backup-preserving replace；
- 替换后从被置换文件/系统 backup 计算 actual displaced identity。只有它等于 expected identity，operation 才能 commit 并删除 recovery；
- displaced identity 不匹配时，外部版本已经被原子保存在 recovery，app payload 也保留，operation 进入 Conflict。只有能够证明没有第三方再次改写时才自动 exchange 回去，否则交给用户 Compare/Save Copy/选择恢复；
- 仅有 advisory lock、替换前 stat、file watcher 或普通 rename 不足以宣称满足 guarded-write，因为不配合锁的进程仍可竞态写入；
- 平台若没有 CAS、atomic exchange 或 backup-preserving replace，现有目标文件的 autosave 必须关闭，普通 Save 不得默认覆盖，只能 Save Copy；Force overwrite 只允许人工明确确认并显示该平台限制；
- recovery 在 operation commit 或用户解决 Conflict 前不得删除。
- Save As/New File 的 expected identity 为 `Absent`，使用 create-if-absent/no-replace 原语；提交前路径被创建即 Conflict，不将其当作可替换旧文件。

因此产品不声称通用文件系统具有数学意义上的跨进程 CAS；产品保证是：能原子保留 displaced target 才允许默认替换，否则拒绝默认覆盖。P0 必须为 macOS、Windows、Linux 分别记录使用的系统原语与 capability，P1B 用不配合文件锁的竞争写入验证 recovery 中确实保留替换瞬间的外部 bytes。

P1B 必须用真实 filesystem dispatcher 测试：成功替换、写失败、rename 失败、父目录不存在、权限失败、目标在 prepare 后/replace 前被外部替换、锁不被遵守、write response 丢失、commit response 丢失、重复 operation、应用崩溃遗留临时/receipt/recovery 文件以及启动 reconcile。

## 4. FileIdentity

保存前至少校验：canonical path、size、mtime 与内容 hash。性能优化可先用 size/mtime 快筛，但真正覆盖前必须在不可信或变化时计算 hash。平台 inode/file-id 可作增强，不能作为唯一依据。

外部修改时用户选项：

- Reload disk：先提供恢复当前 optimistic text 的方式，再关闭并重开 session；
- Save Copy：写新路径，不覆盖冲突文件；
- Compare：展示 disk/current confirmed diff，不修改正文；
- Force overwrite：仅交互保存、明确确认后允许，autosave 永不 force。

## 5. Autosave

Autosave tick 只有在以下条件全部满足时开始：

- active document 存在；
- pending 可 flush；
- confirmed revision 与 persisted revision 不同；
- pipeline 非 blocked/resync/conflict；
- 没有同文档 save in progress；
- file identity 可验证；
- 文档不是只读/invalid encoding。

干净、保存中或 conflict 的 tick 是结构化 skip，不记作写入失败。真实 I/O 错误需要可见但去重的状态。

## 6. 图片与资源事务

现有 pending image 流程不能在保存前全文替换 Markdown。目标事务：

1. widget/command 产生 image source range 与资源意图；
2. 资源服务复制/下载到临时目标，返回最终路径和 content identity；
3. active binding 校验 document/session/revision；
4. 通过局部 CM transaction 更新对应 URL range；
5. 等待 Core ack；
6. 原子提交资源和文档；
7. 失败时清理未引用临时资源，保留可 Undo 正文状态。

资源提交与文档写盘无法跨文件系统提供真正单事务时，必须定义补偿：资源先落地但文档失败可被垃圾回收；文档不得引用尚未成功落地的最终资源。

## 7. Reload、Close 与切换文档

- Reload：若 dirty，必须先人工决策；干净时关闭旧 session 并从新 disk bytes 建 session。
- Close：pending 先 flush；blocked 提供复制恢复文本和取消关闭；不得用旧 confirmed snapshot 自动保存。
- A→B：先隔离 A 的所有 generation/request，再挂载 B；A 的异步结果只能清理自身资源。
- Save As：准备新 target identity，默认继承 BOM/EOL，成功后 session 绑定新 file identity。
- New File：使用明确默认 BOM/EOL；首次保存按 Save As。

## 8. Export

Export 读取一个明确 revision 的 Core snapshot或经过确认的只读 renderer。Export 可以规范化输出格式，但不得把规范化结果写回正文、改变 dirty 或 persisted revision。

## 9. 错误与用户提示

错误码映射到：可重试、需用户选择、只读降级、阻止保存、致命 session error。相同错误在短时间内去重，但每次关键状态转换都写结构化日志：session hash、revision、operation、error code、duration；不写正文和完整私人路径。

## 10. Save outcome reconcile

`reconcile_document_save(saveOperationId)` 读取 durable receipt、prepared payload hash 和当前磁盘 identity：

1. `Prepared` 且磁盘仍是 expected identity：返回 `NotWritten`，允许复用同 operation 重试；
2. `Written` 且磁盘 hash/identity 与 receipt 一致：幂等提交对应 persisted revision；
3. receipt 已 `Committed`：返回原 commit 结果；
4. 磁盘、receipt、prepared payload 任一不一致：进入 Conflict，保留 recovery copy，不猜测成功；
5. 应用重启先扫描未终结 receipt，再允许相关路径 autosave。

写盘 revision N 后产生的 N+1 输入不参与 N 的 file identity 判断。N commit 只更新 `persistedRevision=N`；N+1 patch/ack 继续按 session/document/revision identity 处理。
