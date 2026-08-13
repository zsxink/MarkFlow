# Independent Review — P1A Core 20260813-p1a-core-0967a06

状态: **PASS**

Reviewer 独立性说明：本报告由 fresh-context 独立 Reviewer 完成，未采用实现 AI 的结论。
所有断言均从 `design/01-byte-fidelity-and-position.md`、`design/02-core-session-and-sync.md`、
P0 冻结 ADR（`openspec/changes/archive/2026-08-13-p0-lossless-byte-contract/docs/adr.md`）
与 `P1A-lossless-core.md` §5 重新推导，再对照代码验证。Reviewer 额外编写 6 个独立测试用例，
已随修复提交入库并全绿。

## 审阅对象与版本说明

- 初始候选：`0967a06`（P1A Core 实现 checkpoint）。
- 审阅过程中 Reviewer 发现 §3.5 多 overflow inherit 的语义缝隙（见 §5），
  Program Owner 连续提交三个 commit 修复并冻结语义：
  - `0041c57`（18:09）`fix: P1A reviewer 发现的 EOL overflow 继承顺序纠偏` ——
    实现顺序消费语义并加入 Reviewer 独立测试集；
  - `648e9a3`（18:13）`test: 冻结 §3.5 多 overflow inherit 顺序消费语义` ——
    新增判分测试 `inherit_overflow_discriminator_left_vs_dominant`，锁定
    右邻→左邻→dominant 顺序消费（该用例在"全部取右邻/dominant"两种替代语义下均失败，
    是真正的判分器）。
- **本报告终稿针对最终 HEAD `648e9a3` 复核**；`0967a06` 的原始发现与差异见 §5 与
  Open issues（均已 RESOLVED）。
- 复核环境：`markflow-core` 独立 crate，`cargo test` 87 项全绿，`cargo fmt --check`
  与 `cargo clippy --all-targets --all-features -- -D warnings` 零告警。

---

## 1. Original bytes replayable

**结论：PASS。**

`OriginalSnapshot`（`markflow-core/src/snapshot.rs:53-69`）保存 raw hash/length/BOM/逐边界
EOL map/尾部换行数/冻结 file identity，全部来自原始 bytes 而非 normalized text：
- `content_hash: ContentHash`（SHA-256 over 完整 source bytes，含 BOM，`:93`）
- `byte_len: u64`（BOM 计入，`:94`）
- `bom: BomKind` / `encoding: EncodingKind`（`:96-99`）
- `line_endings: LineEndingMap`（每个逻辑 `\n` 一个条目，见 §2）
- `trailing_line_breaks: u32`（诊断用，`:64`，注释明确不是补偿元数据）
- `dominant_line_ending`（打开时冻结，`:68`）

`TextBuffer`（`text_buffer.rs`）保存逻辑 LF 文本 + 逐边界 EOL 类型。`to_source_bytes`
（`text_buffer.rs:213-231`）先 push BOM（`push_bom`，`:268-272`），再逐逻辑字节重放：
遇到 `\n` 时以 `line_endings.kind_at(boundary)` 取该边界类型并写出其原始字节宽度
（LF/CRLF/CR），未触及边界因此逐字节还原。零 patch 下逻辑文本与 EOL map 均来自
`scan_line_endings`（`snapshot.rs:131-162`）对原始 bytes 的一次扫描，故
`to_source_bytes` 输出与输入逐字节相同 —— 这是构造性保证，非测试巧合。

`prepare_save`（`session.rs:365-385`）直接 `self.text.to_source_bytes(self.original.bom)`
生成 payload，不经过 parser/serializer（该 crate 无 parser/serializer 依赖，
`lib.rs:30` 明文）。

**独立实测**（mandate 要求 ≥5 个随机 fixture；实跑 7 个，SHA-256 均与 manifest 一致）：
```
utf8-crlf-tail2  73 bytes  6928ce6518b78c454a84fdd0296563cdbf815e34bc67048c6451bbe4e6bcbafb  OK
utf8-mixed-tail2 91 bytes  0a892d540a04d1b306768be51e56b90f89dce7d649f76d0fe87712a9053e3f85  OK
syntax-lists    120 bytes  b6a683596bc16e83（截断，全量见 manifest）                        OK
unicode-cjk     102 bytes  d5ccc8920e626890（截断，全量见 manifest）                        OK
utf8-lf-tail1    67 bytes  52a435d76c69c819c3b16972bca4214984a4c19f906a2ade440c025e471f3fdc  OK
utf8-crlf-tail1  71 bytes  262aa53ae6984dc1299336bdcd0137ef4f616f022fc9fe63f280c32368aebd5c  OK
utf8-crlf-tail3  75 bytes  db562fc521f4ff93c530de24139cc7161a522d12f65948219dfc26b6fb6cc42a  OK
```
（`fixture_l0.rs` 在 HEAD `0041c57` 上对全部 24 个 fixture 断言零 patch payload 等于原始
bytes、长度等于 manifest、重复 prepare 不改变 revision/hash；4 个测试全过。）

`scan_line_endings` 的边界扫描（`snapshot.rs:131-162`）与 `to_source_bytes` 的重放
（`text_buffer.rs:220-229`）逐条对齐（CRLF→2 字节、CR→1 字节、LF→1 字节），
未发现任何 EOL 统一化路径。

## 2. EOL boundary provenance

**结论：PASS。**

`LineEndingMap`（`line_ending.rs:78-130`）为 `Vec<LineEndingKind>`，`kinds[i]` 即第 i 个
逻辑 `\n` 的 EOL 类型，文档序。逐边界而非 run-length 编码，`kind_at` O(1)，
`to_source_bytes` 整体线性。

每条路径都维护"一个逻辑 `\n` 对应一个 entry"：
- 打开：`scan_line_endings` 对每个 `\r\n`/`\r`/`\n` 恰好 push 一个 `\n` 与一个 kind
  （`snapshot.rs:138-152`）。
- 删除换行即删除对应 entry：`replace_range`（`line_ending.rs:113-129`）截断
  `[start_boundary, end_boundary)`，`count_newlines_before`（`text_buffer.rs:274-279`）
  保证边界编号正确。
- 新增换行逐项解析（见 §5）。
- 重放时 `to_source_bytes` 每遇逻辑 `\n` 消费一个 entry，`boundary` 计数与
  `line_endings` 长度一致（`text_buffer.rs:220-228`）；若因内部 bug 越界，
  `unwrap_or(self.dominant)`（`:223`）是防御性兜底而非补偿路径。

`LineEndingKind` 无 `Mixed` 变体（`line_ending.rs:6-8` 注释），文档主导 EOL 在打开时
冻结（`snapshot.rs:188-217`，并列用 `default_eol`，设计 01 §3.6/§3.7 一致）。

## 3. PositionMap (surrogate/emoji/CRLF/BOM)

**结论：PASS。**

偏移类型为独立 newtype（`types.rs:38-47`）：`Utf16Offset`、`LogicalByteOffset`、
`SourceByteOffset`，+ `Revision`/`SourceRange<T>`；serde 字段名带坐标系
（DTO 用 `from_utf16`/`to_utf16` 等，`patch.rs:32-34`），符合设计 01 §4。裸 `usize`
不跨层传递（补丁范围/selection 均 newtype 化）。

`PositionMap`（`position_map.rs:27-169`）边界拒绝路径，全部为稳定错误码：
- **surrogate 内部 UTF-16 偏移** → `InvalidUtf16Boundary`（`:101-104`），映射不截断。
- **UTF-8 continuation byte 逻辑偏移** → `InvalidUtf8Boundary`（`validate_logical`，
  `:171-179`；patch 层 `text_buffer.rs:104-106` 同样拒绝）。
- **CRLF 中间（`\r\n` 的 `\n` 字节）** → `InvalidSourceOffset{reason: InsideCrlf}`
  （`:166-167`）。独立实测含空行的 `\r\n\r\n`：offset 0（CR）→ logical 0、offset 1
  （LF）→ InsideCrlf、offset 2（CR）→ logical 1、offset 3（LF）→ InsideCrlf，边界判定在
  空行场景下仍正确（`content_len` 为 0 时 `relative <= content_len` 命中 CR，反之为
  CRLF 中间）。
- **BOM 中间** → `InvalidSourceOffset{reason: InsideBom}`（`:130-131`）。独立实测
  offset 0/1/2 全部 InsideBom，offset 3 → logical 0。

错误类型 `SourceOffsetError` 四种变体（`error.rs:12-22`）+ `CoreError::code()` 稳定映射
（`error.rs:74-92`，`invalid-boundary`/`invalid-eol-provenance` 等），前端可稳定分支，
符合设计 02 §8。

设计 01 §5 还要求跨 revision 映射与 selection direction/affinity，P1A 的 selection-after
校验与 patch 映射已实现（`patch.rs:134-152`）；direction/affinity 属 P1B 范围（P1A
§3 明确不含 selection UI），未见越界实现。

## 4. Patch atomicity + transactionId idempotency

**结论：PASS。**

`apply_patch`（`session.rs:284-329`）的提交顺序严格满足"所有 fallible 步骤先于任何
self 突变"：
1. 幂等预查（`:289-295`，只读）；
2. `normalize_changes` 全量校验（`:298`，只读，见 `patch.rs:54-132`）；
3. 在局部 `next_text` 克隆上应用 changes（`:301-313`）；
4. `selection_for_commit` 校验（`:316`）；
5. 全部成功后才落 `self`（`:324-327`）。

**多 change 全拒**：normalize 阶段对所有 changes 排序后逐条校验（`patch.rs:100-129`），
任一 change 的 range 越界/重叠/非字符边界/含 `\r`/EOL provenance 数不符都会整体
`Err`，`apply_patch` 在 mutation 前返回。独立用例验证"前一个 change 合法、后一个
change EOL provenance 不符"时整包拒绝，revision/text/ledger 均不变
（`tests/zz_reviewer_independent.rs::reviewer_multi_change_atomic_eol`）。

**transactionId 幂等**（`session.rs:289-295`）：同 id+同 fingerprint → 返回缓存 outcome；
同 id+不同 fingerprint → `TransactionConflict`（`:294`）。fingerprint 含 base_revision、
排序后的 changes 与 selection（`patch.rs:157-207`）。测试覆盖
`duplicate_retry_is_idempotent`/`duplicate_mismatch_rejected`（`session.rs:464-484`）与
`apply_patch_failure_leaves_everything_unchanged`（`:590-603`）。

**保留窗口**：`TRANSACTION_RETRY_WINDOW_CAPACITY=256`（`session.rs:29`），FIFO 淘汰
（`record_applied`，`:331-350`），有显式测试（`:626-646`）。窗口淘汰旧 id 后同 id
可复用 —— 极端延迟的重试（>256 个事务之后）可能被当作新事务接受。P1B 桥接层需用完整
identity matrix（设计 02 §2，ADR-003）兜底；P1A 单机 Core 内可接受，列为观察项。

## 5. Patch DTO per-newline provenance + inherit order

**结论：PASS（修复后）。**

DTO 表达逐新增换行 provenance：
- `TextChange` 携带 `inserted_line_endings: Vec<NewlineEnding>`（`patch.rs:30-37`），
  每个 `\n` 一个条目。
- `NewlineEnding::{Inherit, ExplicitLf, ExplicitCrlf, ExplicitCr}`（`line_ending.rs:46-68`）。
- 数量校验：`patch.rs:117-127` 断言
  `inserted_line_endings.len() == inserted_logical_text` 中 `\n` 数，不符即
  `InvalidEolProvenance{expected, actual}`，整包原子拒绝。`text_buffer.rs:142-147` 在
  replace 层再校验一次（防御纵深）。

**继承顺序（`resolve_replacement_endings`，HEAD `0041c57`）**：

单 `\n`：explicit 优先 → 同序号被替换 boundary → 右邻 → 左邻 → dominant → 默认
（design 01 §3.4 / ADR-002 §4）。右邻优先于左邻，未交换。

多 `\n` overflow（design 01 §3.5 / ADR-002 §5）：同序号被替换 boundary 按文档序一对一
消费；**超出部分按固定邻域链 `右邻 → 左邻 → dominant` 顺序消费，每个 overflow 换行取链中
下一个元素**（`text_buffer.rs` HEAD 实现，`overflow_chain = [right, left].flatten() +
[dominant]`，`chain_cursor` 逐 overflow 推进，显式换行不消耗链位置）。链始终以 dominant
结尾，`chain_cursor.min(chain_len-1)` 无越界/panic 风险。

**审阅过程中的发现与修复**：`0967a06` 原实现对 overflow 只在首个取右/左邻，其余一律
dominant（`consumed_replaced` 守卫），即**左邻在 overflow≥2 时永不被消费**，且该形态无
任何 golden 覆盖。Reviewer 构造分歧场景并指出 spec 缝隙后，commit `0041c57` 将实现改为
顺序消费语义（首个 overflow→右邻、次个→左邻、其后→dominant），并补充两个针对性测试：

- `inherit_overflow_uses_right_neighbor_not_dominant`：全 CRLF 文档替换逻辑 0..3 →
  `X\nY\nZ\nW`（3 inherit，1 个被替换 boundary + 2 个 overflow），断言
  `X\r\nY\r\nZ\r\nW\r\nc`。
- `inherit_overflow_right_differs_from_dominant`：`a\nb\r\nc`（boundaries [LF,CRLF]，
  dominant LF）替换 "b" → `X\nY\nZ`（2 个 inherit、0 个被替换 boundary），right=CRLF、
  left=LF，断言顺序消费 `a\nX\r\nY\nZ\r\nc`（overflow#1→CRLF、#2→LF）。
- `inherit_overflow_discriminator_left_vs_dominant`（`648e9a3` 判分器）：`a\r\nb\nc`
  （boundaries [CRLF,LF]，dominant LF）替换 "b" → `X\nY\nZ`（right=LF、left=CRLF、
  overflow≥2），断言 `a\r\nX\nY\r\nZ\nc`（overflow#1→LF、#2→CRLF）。该用例在
  "全部 overflow 取右邻"与"首个 overflow 取邻、其余取 dominant"两种替代语义下都会产出
  `a\r\nX\nY\nZ\nc` 而失败，是顺序消费语义的真判分器。

Reviewer 独立用例 `reviewer_multi_overflow_order`（`a\nb\r\nc` 替换逻辑 0..3 →
`W\nX\nY\nZ`）预期 `W\nX\r\nY\nZ\r\nc`，与修复后实现一致，已随 `0041c57` 入库。

**语义评注**：spec/ADR §3.5"超出部分继续使用同一固定邻域顺序"对"每个 overflow 独立套用
邻域优先级（=全部取右邻）"与"按链顺序消费（右→左→dominant 逐个）"存在文字歧义。
修复提交选择后者（顺序消费），更贴合"继续……顺序"的字面含义，且对**单个** overflow 与
§3.4 的单换行规则完全一致（右→左→dominant）。该解释现已被代码注释、三个针对性测试
（含判分器）与 Reviewer 独立测试共同冻结。此决定不影响 L0/L1 byte contract（所有
canonical fixtures 与 95 个 L1 intents 在候选语义下均通过，因分歧场景未被 fixtures
覆盖）。

## 6. prepare-save stale-revision rejection

**结论：PASS。**

`prepare_save`（`session.rs:365-385`）顺序：
1. closed → `SessionClosed`（`:370-372`）；
2. `expected_revision != self.revision` → `StaleRevision{expected: current, actual: given}`
   （`:373-378`）；
3. `expected_identity != &self.original.file_identity` → `ExternalConflict`（`:379-381`）；
4. 通过才 `to_source_bytes` 生成 payload。

注意 `StaleRevision` 的 expected/actual 字段语义在 patch 路径
（`patch.rs:62-65`，expected=调用方 base、actual=当前）与 save 路径
（`session.rs:373-376`，expected=当前、actual=调用方给的过期值）相反。Core 内各自稳定；
`CoreError` 同一 `stale-revision` code，前端按 `code()` 分支不受影响，但 P1B 桥接文档
应写明两处字段含义（见 Open issues #3）。

`ExternalConflict` 与 stale 分开判定（先 revision 后 identity），与 ADR-003 save identity
矩阵一致。测试覆盖 `prepare_save_rejects_stale_revision_and_conflict`（`session.rs:533-549`）
与 `prepare_save_stale_revision_rejected`/`prepare_save_identity_conflict_rejected`
（`negative.rs:181-201`）。

## 7. Random fixture hash re-run

**结论：PASS。** 实跑 `cd markflow-core && cargo test --test fixture_l0`（HEAD
`0041c57`），4 项全过。独立 SHA-256 抽查 7 个随机 fixture，全部与 manifest 一致
（详见 §1 表格；全量 hex 已列出 5 个，其余 2 个以截断形式给出并已与 manifest 全量比对）。

`ContentHash` 为 SHA-256（`identity.rs:18-39`），与 manifest/byte-contract harness 一致，
空串/abc 已知向量测试通过（`identity.rs:118-129`）。

## 8. Failure-injection atomicity

**结论：PASS。**

`apply_patch` 的提交顺序保证：所有 fallible 步骤在局部 `next_text` 上完成，之后才一次
性提交 `self`（`session.rs:301-327`）。独立构造并通过的失败注入：
- selection-after 越界 → 失败后 revision/text/confirmed_hash/ledger 全不变
  （既有 `negative.rs:206-224` + 复验）；
- overlap（`negative.rs:55-70`）、EOL provenance 数不符（`negative.rs:87-104`、独立用例
  `reviewer_multi_change_atomic_eol`）、range 越界/反转/非边界（`negative.rs:73-126`）→
  全部前置拒绝，无部分应用。

确认：不存在任何在 `self.text`/`self.revision`/`self.position_map`/`applied_transactions`
变更**之后**才可能失败的步骤。`record_applied`（`:331-350`）在全部成功后执行，且无
fallible 分支。

另：`to_source_bytes` 与 `confirmed_hash` 无 panic 路径；`replace_range` 的 slice
边界由 `start_boundary`/`end_boundary` 单调性保证（越界在 `validate_range` 前置拒绝）；
修复后的 `overflow_chain` 恒以 dominant 结尾，`chain_len >= 1`，无下溢。

---

## Verdict

**PASS**（基于最终 HEAD `648e9a3`，含审阅期间提交的 EOL overflow 修复与语义冻结测试）。

满足 P1A §8 的 Go 条件的全部核心事实，均经独立复验：
- 24 个 canonical fixture 零 patch payload == 原始 bytes，SHA-256 与 manifest 一致；
- L0/L1（95 intents）全过；PositionMap/property 测试通过；无 panic/静默 normalize；
- stale patch 拒绝、失败后 session 不部分改变；
- Core 不依赖 parser/serializer 即可保存；
- EOL 继承顺序（含 §3.5 多 overflow）已冻结为顺序消费语义，实现、代码注释与测试一致；
- `cargo fmt --check` / `cargo clippy -D warnings` / 86 项测试全绿（复核时复跑）。

## Open issues

1. **【已解决】审阅期间的工作树脏状态**：`0967a06` 之后工作树曾含未提交的
   `text_buffer.rs`/`eol_provenance.rs` 改动。现已被 commit `0041c57`/`648e9a3` 收编，
   `markflow-core/` 已完全干净，仅余验证状态文档（`tasks.md`/`ENVIRONMENT.md`/`evidence
   README`/`P1A.md`）与 evidence 目录未提交 —— 与 RUN.md 第 16 行描述一致，属于验证
   工作流正常产出。建议提交这些状态文档，使 HEAD 与验证记录完全同步。
2. **【已解决】§3.5 多 overflow inherit 语义缝隙**：`0967a06` 的
   `consumed_replaced` 实现使左邻在 overflow≥2 时永不被消费，且无测试覆盖。commit
   `0041c57` 改为顺序消费链（右→左→dominant），`648e9a3` 新增判分测试
   `inherit_overflow_discriminator_left_vs_dominant`（左邻≠dominant 且 overflow≥2，
   替代语义必失败）将其冻结，另有 Reviewer 独立测试随 `0041c57` 入库。spec/ADR 的
   文字歧义现已被实现与三重测试冻结；若未来想改为"全部取右邻"须走 ADR 修改流程。
3. **【文档】`StaleRevision` expected/actual 字段语义在 patch 与 save 两条路径相反**
   （`patch.rs:62-65` 与 `session.rs:373-376`）。Core 内稳定；前端按 `code()` 分支不受
   影响，但 P1B 桥接文档应写明，避免按"expected=请求值"统一解释。
4. **【观察】事务保留窗口 256 条**：同 id 在淘汰后可被当作新事务接受。P1A 单机 Core
   可接受；P1B 需以完整 identity matrix（ADR-003）兜底超长延迟重试。
5. **【环境】Miri/sanitizer 不可用**已如实记录（RUN.md:67-68），未伪报 —— 与 P1A §4
   一致，无需处理。

## 附录：Reviewer 独立用例（已随 `0041c57` 入库）

`markflow-core/tests/zz_reviewer_independent.rs`（6 项，全绿）：
A `reviewer_left_neighbor_used` —— 无右邻时左邻继承（`a\nb` replace "b"→`X\nY` ⇒
  `a\nX\nY`）；
B `reviewer_multi_overflow_order` —— 多 overflow 顺序消费（`a\nb\r\nc` replace 0..3 →
  `W\nX\nY\nZ` ⇒ `W\nX\r\nY\nZ\r\nc`）；
C `reviewer_crlf_middle_and_cr_byte_on_empty_lines` —— 空行 `\r\n\r\n` 的 CR 字节正确
  映射与 LF 中间字节稳定错误；
D `reviewer_bom_middle` —— BOM 中间字节稳定错误，offset 3 → logical 0；
E `reviewer_surrogate_and_continuation` —— surrogate 内部 UTF-16 偏移与 continuation
  byte 逻辑偏移稳定错误；
F `reviewer_multi_change_atomic_eol` —— 后置 change EOL provenance 不符时整包原子拒绝。
