# P0 Lossless Byte Contract — 设计

本 child change 是 Issue #254 程序（umbrella `refactor-lossless-live-preview`）的 P0 切片实现设计。P0 的目标是建立现状基线与机器可判定的 byte 合同，不实现 markflow-core，不切换默认编辑器。能力合同见 [byte-contract-harness spec](./specs/byte-contract-harness/spec.md)；阶段验证记录与门禁见 umbrella `validation/phases/P0.md` 与 `design/phases/P0-baseline-contract.md`。

## 1. 基线刻画（tasks 1.1）

- 基线：`feat-v0.1.0@6bfba453`（`6bfba45307c1dd509dd7864de4e4f0ed495c57d7`）。
- 当前编辑链路（umbrella design.md「当前基线」）：
  `read_file(String) → setMarkdown() → Tiptap/ProseMirror document → editor.storage.markdown.getMarkdown() → normalizeImageMarkdown() → write_file(String)`。
- P0 记录：支持平台（macOS 实测；Windows/Linux BLOCKED）、feature flags（当前无 lossless flags，`legacyProseMirror` 默认路径）、日志目录（`app_config_dir().join("logs")`，启动打印 `log_dir=`）、Node/npm/Rust/Tauri/WebView 版本、仓库 branch/commit/dirty status。

## 2. Fixtures 与 harness 布局（tasks 1.2–1.3）

```text
tests/fixtures/byte-contract/
  README.md                 # 生成与引用说明
  manifest.json             # 每个 fixture 的 path/length/sha256/bom/eol/trailing/encoding
  fixtures/<id>.md          # 合成生成的二进制 fixtures
  l1-intents.json           # 每个 fixture 至少 3 组 L1 edit intent（from/to/inserted/surviving 预期）
tests/byte-contract/
  generate-fixtures.mjs     # 确定性生成 fixtures（固定 seed，无随机时间戳）
  l0-harness.mjs            # L0 byte-for-byte 判定（sha256/len/diff==0）
  l1-harness.mjs            # L1 surviving-interval 判定（prefix/suffix/存活 span + JSON diff）
  negative-control.mjs      # 故意损坏未触及 byte → 必须失败
  pm-tail-newline.characterization.test.ts  # PM 尾换行丢失复现（独立 suite）
  legacy-open-autosave.characterization.test.ts # 真实打开/dirty/autosave/写盘生命周期复现
```

- fixtures 全部确定性合成，绝不写入 `/Users/xian/markflow-test`。
- L1 edit intent 记录源 range 与 inserted bytes；harness 生成 old→new surviving interval map，逐区间比较 bytes。
- negative control 是 harness 自身的自检：损坏一个未触及 byte 必须导致验证失败。

## 3. Legacy PM 数据损坏复现（tasks 1.4）

现状（`src/lib/editor.ts`）：`setMarkdown()` 在打开时捕获 `trailingNewlines = content.match(/\n+$/)?.[0].length`，`getMarkdown()` 在 serializer 输出末尾 `'\n'.repeat(tn)` 补回。该方案在以下场景不满足 L1：

1. **CRLF/CR 尾部边界**：文件以 `\r\n` 或 `\r` 结尾时，补偿一律补 LF，尾部字节被改写。
2. **用户显式增删尾换行**：元数据在打开时冻结，正文编辑保存时把陈旧计数补回，覆盖用户对尾部的意图。
3. **Mixed EOL**：补偿无法区分每个边界的原始类型。
4. **零编辑打开即改写**：`setMarkdown()` 把进入 PM 前的 Markdown 作为 persisted baseline，却在 `markDocumentPersisted()` 中拿 PM serializer 输出回比；段落内 soft break 会被序列化为空格，导致打开即 dirty。随后 `setReadOnly(false)` 的 `setEditable()` 默认发送 update，autosave 在约 10 秒后把 serializer 结果写回磁盘。
5. **打开时全篇 EOL 归一化**：`normalizeImageMarkdown()` 内部把 `\r\n` 全部替换为 `\n`，且尾部 `content.match(/\n+$/)` 对 CRLF/CR 低估 boundary 数，因此即使没有用户正文 transaction，也可能发生 CRLF→LF 与尾部坍缩。

P0 必须分别覆盖两条路径：

- serializer 级 characterization：正文局部编辑后用 L1 byte diff 证明未触及尾部被改写；
- 产品生命周期 characterization：使用真实打开、dirty、autosave 和实际临时文件，开启产品实际 autosave 默认值，零编辑等待至少两个 tick，记录 dirty、关闭提示、save count、mtime 与 SHA-256。

后者不得用“输入文件与 oracle 副本自比较”冒充真实 L0，也不得用 `autosave=false` 的 smoke 代替。两类预期失败测试以显式命令运行，不进入默认长期红色 suite；但止血修复合入后，零编辑不写盘必须另有默认长期绿色回归。

## 4. 冻结 ADR（tasks 1.5）

> 权威决策记录见 [docs/adr.md](./docs/adr.md)，本节为设计摘要。以下决策在 P0 冻结，
> 后续 Slice 只能通过同步修改 capability spec / Patch DTO / golden fixtures 的流程变更。

### ADR-1 坐标类型
- `Utf16Offset`（CodeMirror transaction/selection）、`LogicalUtf8ByteOffset`（Core 逻辑 LF 文本）、`SourceByteOffset`（含 BOM 与原始 EOL 宽度的磁盘 bytes）、`Revision`、`Affinity`、`SourceRange<T>`。
- 禁止裸 `number` 跨层传位置；DTO 显式带坐标单位；Rust newtype 与 TS branded type 防误用。
- PositionMap 提供 UTF-16↔logical UTF-8、logical↔source byte、跨 revision patch 映射；落在 surrogate pair / UTF-8 continuation / CRLF 中间 / BOM 中间的请求返回稳定错误码，禁止截断到最近边界继续。

### ADR-2 EOL inheritance 与 paste provenance
- 每个逻辑 `\n` 对应一个 `LineEndingEntry`（LF/CRLF/CR）。
- 未被 edit range 覆盖的 boundary 保留原类型；删除换行即删除对应 entry。
- paste/drop 在 CM 归一化前读取原始 payload，把每个原始换行编码为 transaction annotation 的显式 `LF/CRLF/CR`；普通键入与无可信来源命令写 `Inherit`。
- `Inherit` 解析顺序唯一冻结：同序号被替换 boundary → 插入点右邻 surviving boundary → 左邻 surviving boundary → 文档主导 EOL → 新文档默认 EOL。禁止交换右/左邻优先级。
- 一次 replacement 多个 `Inherit` 换行按文档顺序一对一消费被替换 boundary，超出部分继续同一邻域顺序。
- 文档主导 EOL 由原始 snapshot 计数决定，并列时用打开时冻结的 `defaultEol`，不随当前平台临时变化；无换行文件用创建配置中冻结的 `defaultEol`。

### ADR-3 按操作 identity matrix
异步结果按操作分组校验 identity，禁止「所有字段全等」：
| 操作 | 必需 identity |
| --- | --- |
| text patch/ack | `bindingGeneration`、`sessionId`、`documentId`、`baseRevision/resultRevision`、`transactionId` |
| Render IR | `bindingGeneration`、`sessionId`、`documentId`、`revision`、`requestId`、`sourceHash` |
| save | `sessionId`、`documentId`、`expectedRevision`、`expectedFileIdentity`、`saveOperationId` |
| resource | `bindingGeneration`、`sessionId`、`documentId`、目标 source range/revision、`resourceOperationId` |

旧文档 A 的结果不得应用到文档 B；但 revision N 保存更新 file identity 后，合法 N+1 patch/ack 仍可继续收敛（`fileIdentity` 不作为 patch/ack 的 stale 条件）。

### ADR-4 guarded-write / CAS capability
- Host 暴露单一 `guarded_atomic_write(path, payload/token, expectedFileIdentity, saveOperationId)`：目标目录创建唯一临时文件、写入并 flush，随后在同一 native command 内完成平台 CAS / atomic exchange / backup-preserving replace，并在替换点从被置换文件计算 actual displaced identity；等于 expected 才 commit，否则进入 Conflict 且保留 recovery。
- `saveOperationId` 幂等；配置目录保存 durable receipt（operation id、target path hash、expected/new identity、payload hash、Prepared/Written/Committed），receipt 原子写并 flush。
- 预检查、原子提交与结果分类不得拆成前端多个调用；仅有 advisory lock / 替换前 stat / file watcher / 普通 rename 不满足 guarded-write。
- 无 CAS/exchange/backup-preserving 原语的平台：autosave 关闭、普通 Save 只允许 Save Copy，Force overwrite 仅人工确认后允许。
- P0 每平台记录实际系统原语：macOS（实测验证）、Windows、Linux（BLOCKED，未登记设备）。recovery 在 commit 或用户解决 Conflict 前不得删除。
- Save As/New File expected identity 为 `Absent`，使用 create-if-absent/no-replace；提交前路径被创建即 Conflict。

### ADR-5 无效 UTF-8 行为
- P1 首期对无效 UTF-8 文件只读或拒绝打开，禁止 replacement decode 后覆盖写盘。

### ADR-6 Save As 格式策略
- 已有文档 Save As 默认继承原 BOM/EOL；新文档使用显式默认；改变格式必须是用户命令并显示影响。

## 5. 真实 Tauri dispatcher contract harness（tasks 1.6）

- 通过真实 Tauri dispatcher（`@tauri-apps/api` `invoke` 或等价真实 IPC）调用当前 `read_file`/`write_file` 与未来 Core commands，禁止仅 mock `invoke`。
- 断言 command 名、参数形状、错误码、session 生命周期；每个命令的 stdout/退出码/payload hash 单独记录。
- P0 建立最小骨架（当前 read/write 的真实 round-trip + 错误码路径）；Core commands 的命令签名以 umbrella design.md Bridge 最小 API 为合同。

## 6. 行为矩阵（tasks 1.9–1.10）

- Muya `e52106f`、Vditor `a1302b0` 固定 SHA 矩阵：block closure、marker reveal、selection、Enter/Backspace、paste、History 的「可借鉴机制」与「禁止移植机制」冻结进本 change 的矩阵文档（非架构依据）。
- ChatGPT Desktop 26.803.61601 黑盒矩阵：合成输入观察 selection/Enter/Backspace/paste/Undo/Redo/marker/export，每条观察标注 `Observed` / `Officially documented` / `Inference`；无公开源码时禁止推断内部编辑器或 byte-to-byte 架构，`Inference` 不得进入 MarkFlow 的 MUST 合同。

## 7. 验证与证据

- 按 umbrella `VALIDATION-PROTOCOL.md` 运行：`evidence/P0/<run-id>/RUN.md` + 不可变 `ENVIRONMENT.md`（含 environment hash）。
- gate：`npm test`、`npx tsc --noEmit`、`npm run build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`npm run test:e2e`（smoke）、`npx openspec validate --all`、`bash scripts/check-archive-synced.sh`。
- P0 特殊 gate：必须同时保存 serializer characterization 与真实产品生命周期 characterization；桌面测试配置必须记录 autosave 的真实值。历史 run 不可回写，发现覆盖缺口后创建新的 corrective run-id，并由独立 Reviewer 重新复核新增证据。
- P0 只增加测试、fixtures 与文档；回滚为关闭/撤销本 child change，不影响产品 runtime。

## 8. 范围边界

- 不实现 markflow-core、不改默认编辑器、不 cherry-pick draft、不用 trim/normalize 字符串比较代替 byte 比较、不把预期失败测试留默认红色 suite、不改 `/Users/xian/markflow-test` 原件。
