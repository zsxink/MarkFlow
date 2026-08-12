# P0 冻结 ADR

> 状态：**FROZEN**（2026-08-12，P0 baseline）
>
> 本文件是 Issue #254 lossless 重构的 P0 决策记录。后续任何 Slice 若需修改
> 以下决策，必须走「同步修改 capability spec / Patch DTO / golden fixtures」
> 的流程，不能实现中临时更改。
>
> Reviewer 签字：PENDING（独立 Reviewer 复核后在此记录）

## ADR-001 坐标类型

**决策：** 文本位置分四种显式类型，禁止裸 `number` 跨层传递。

| 类型 | 用途 |
| --- | --- |
| `Utf16Offset` | CodeMirror transaction/selection |
| `LogicalUtf8ByteOffset` | Core 逻辑 LF 文本 |
| `SourceByteOffset` | 磁盘 bytes（含 BOM 与原始 EOL 宽度） |
| `Revision` / `Affinity` / `SourceRange<T>` | 版本归属 / 边界插入偏向 / 半开区间 |

**要求：**
- DTO 显式携带坐标单位或使用不同字段名；Rust newtype 与 TS branded type 防误用。
- PositionMap 提供 UTF-16↔logical UTF-8、logical↔source byte、跨 revision patch 映射，以及 selection direction/affinity。
- 落在 surrogate pair / UTF-8 continuation byte / CRLF 中间 / BOM 中间的请求返回稳定错误码，**禁止**截断到最近字符边界后继续。

**理由：** UTF-16/UTF-8/source 三套坐标错位是最大风险面（design.md Risks），显式类型让错位在编译期暴露。

## ADR-002 EOL inheritance 与 paste provenance

**决策：** 每个逻辑 `\n` 对应一个 `LineEndingEntry`（`LF`/`CRLF`/`CR`）。规则唯一冻结：

1. 未被 edit range 覆盖的 boundary 保留原类型。
2. 删除换行时删除对应 entry。
3. paste/drop 在 CM 归一化前读取原始 payload，把每个原始换行编码为 transaction annotation 的显式 `LF`/`CRLF`/`CR`；普通键入与无可信来源命令写 `Inherit`。
4. `Inherit` 解析顺序（**唯一**，禁止模块间交换）：同序号被替换 boundary → 插入点右邻 surviving boundary → 左邻 surviving boundary → 文档主导 EOL → 新文档默认 EOL。
5. 一次 replacement 插入多个 `Inherit` 换行时，按文档顺序一对一消费被替换 boundary；超出部分继续同一邻域顺序。
6. 文档主导 EOL 由原始 snapshot 计数决定；并列时用打开时冻结的 `defaultEol`，不随当前平台临时变化。
7. 文件无换行时使用文档创建配置中冻结的 `defaultEol`。
8. `insertedLineEndings` 数组长度必须等于 `insertedLogicalText` 中逻辑 `\n` 数；缺失/数量不符时 Core 稳定报错并原子拒绝整个 Patch。
9. Save As 默认保留已有文档 BOM/EOL；新文档用显式默认；改格式必须是用户命令并显示影响。

**理由：** Mixed EOL 在跨行替换时「未触及边界」定义必须无歧义（umbrella design 已列为风险），唯一顺序保证 golden test 可精确断言每个新增/复用边界。

## ADR-003 按操作 identity matrix

**决策：** 异步结果按操作分组校验 identity，禁止「所有字段全等」判断。

| 操作 | 必需 identity | 不作为 stale 条件 |
| --- | --- | --- |
| text patch/ack | `bindingGeneration`、`sessionId`、`documentId`、`baseRevision/resultRevision`、`transactionId` | `fileIdentity` |
| Render IR | `bindingGeneration`、`sessionId`、`documentId`、`revision`、`requestId`、`sourceHash` | `fileIdentity` |
| save | `sessionId`、`documentId`、`expectedRevision`、`expectedFileIdentity`、`saveOperationId` | 新输入产生的更高 optimistic revision |
| resource | `bindingGeneration`、`sessionId`、`documentId`、目标 source range/revision、`resourceOperationId` | 无关文件的 identity |

**要求：**
- 每种 request/response DTO 显式包含本行字段。
- 旧文档 A 的 ack/IR/资源/save completion 不得应用到文档 B。
- revision N 保存更新 file identity 后，合法 N+1 patch/ack 仍继续收敛（`fileIdentity` 不是 patch/ack 的 stale 条件）。

**理由：** 共享「全等」判断会把「保存更新了 file identity」误判为「编辑失效」，导致合法编辑被拒。

## ADR-004 guarded-write / CAS capability

**决策：** Host 暴露单一 `guarded_atomic_write(path, payload/token, expectedFileIdentity, saveOperationId)`：目标目录创建唯一临时文件、写入并 flush，随后在同一 native command 内完成平台 CAS / atomic exchange / backup-preserving replace，并在替换点从被置换文件计算 actual displaced identity；等于 expected 才 commit，否则保留 recovery 并进入 Conflict。

**要求：**
- 预检查、原子提交与结果分类不得拆成前端多个调用。
- `saveOperationId` 幂等；配置目录保存 durable receipt（operation id、target path hash、expected/new identity、payload hash、状态 `Prepared/Written/Committed`），receipt 自身原子写并 flush；相同 operation/payload 重试返回原结果，相同 operation 不同 payload 拒绝。
- 仅有 advisory lock / 替换前 stat / file watcher / 普通 rename 不足以宣称 guarded-write。
- recovery 在 commit 或用户解决 Conflict 前不得删除。
- Save As/New File 的 expected identity 为 `Absent`，使用 create-if-absent/no-replace；提交前路径被创建即 Conflict。

**平台 capability（P0 记录）：**

| 平台 | 系统原语 | P0 状态 |
| --- | --- | --- |
| macOS | WKWebView 桌面；guarded-write 原语待 P1B 用不配合文件锁的竞争写入实测（候选：`rename`/`exchange` 语义 + 备份保留） | AVAILABLE（待 P1B 实测） |
| Windows | 待登记设备后记录（候选：`ReplaceFile`/`MoveFileEx` 语义） | BLOCKED |
| Linux | 待登记设备后记录（候选：`renameat2`/link+unlink 模式） | BLOCKED |

**无 CAS/exchange/backup-preserving 原语的平台：** autosave 关闭、普通 Save 只允许 Save Copy、Force overwrite 仅人工确认后允许。

**理由：** 外部进程不配合锁仍可竞态写入；只有能原子保留「替换瞬间旧目标」并复核 displaced identity 的操作才允许默认覆盖。

## ADR-005 无效 UTF-8 行为

**决策：** P1 首期对无效 UTF-8 文件只读或拒绝打开；禁止 replacement decode 后覆盖写盘。

**理由：** 数据完整性优先于打开成功率（umbrella design 约束「初期只承诺 UTF-8 与 UTF-8 BOM」）。

## ADR-006 Save As 格式策略

**决策：** 已有文档 Save As 默认继承原 BOM/EOL；新文档使用显式默认；改变格式必须是用户命令并显示影响。

**理由：** 避免 Save As 静默改变未触及格式字节，符合 L0/L1 保真方向。
