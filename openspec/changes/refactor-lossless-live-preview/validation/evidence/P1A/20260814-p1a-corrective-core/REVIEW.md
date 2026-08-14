# Independent Review — P1A corrective Core 20260814-p1a-corrective-core

状态: **PASS**

## 0. Candidate & 方法

**复核对象**：`9ad05131fd3bebd938cf2700a30169889f3dac86`（"fix: 修复 P1A Core 会话与坐标边界"），基于 `0103e37`。当前分支 `test/issue-255-lossless-byte-contract`，HEAD == 候选。

**工作树状态**（复核开始前记录）：
```
 M openspec/changes/refactor-lossless-live-preview/tasks.md
 M openspec/changes/refactor-lossless-live-preview/validation/phases/P1A.md
?? openspec/changes/refactor-lossless-live-preview/validation/evidence/P1A/20260814-p1a-corrective-core/
```
仅有证据文件改动，无代码改动。复核期间另有并发进程生成了 `20260814-p1a-final-9ad0513/` 证据目录，本复核不引用其结论，全部验证均为本人独立执行。

**独立 spec 推导依据**：
- `design/01-byte-fidelity-and-position.md` §3（EOL 继承固定顺序：同序号被替换 boundary → 右邻 → 左邻 → dominant → default；§3.5 溢出继续同一邻域顺序）、§5（PositionMap 对非法边界返回明确错误，不得截断）。
- `design/02-core-session-and-sync.md` §2（identity matrix：text patch 需 `bindingGeneration/sessionId/documentId/baseRevision/transactionId`）、§3（所有 change 按旧文档坐标表达）、§5（dirty = confirmedRevision != persistedRevision）、§7（resync 不得覆盖未确认输入）、§8（错误码含 wrong identity）、§9（延迟响应由 generation/identity 丢弃）。

**实际执行的自动化门禁**（均在复核期间重跑，非引用 evidence 日志）：

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| fmt | `cargo fmt --all -- --check` | exit 0 |
| clippy | `cargo clippy --all-targets --all-features -- -D warnings` | exit 0 |
| cargo test | `cargo test`（markflow-core） | exit 0，92 tests 通过（lib 36 + eol_provenance 18 + fixture_l0 4 + fixture_l1 3 + negative 17 + property_position 8 + zz_reviewer_independent 6 + doc 0） |
| byte-contract | `npm run test:byte-contract` | exit 0：fixture verify 稳定；L0 positive 24 / negative 23；L1 positive 95 / negative 93 |

---

## 1. open/reload clean revision（修复项 1）

**声明根因**：`open`/`reload` 使 `persisted_revision=None`，未编辑文档被视为 dirty。

**实现核对**：
- `markflow-core/src/session.rs:148-172` `from_parts`：`persisted_revision: Some(revision)`（:169，open 时 revision 恒为 0）。`open_bytes`（:121-131）与 `open_bytes_with_identity`（:134-146）均经 `from_parts`，无其他调用方，无旁路。
- `markflow-core/src/session.rs:191-215` `reload`：重建 text/original/revision=0 后 `persisted_revision = Some(self.revision)`（:213）。
- `markflow-core/src/session.rs:244-249` `is_dirty`：`Some(persisted) => self.revision != persisted`，`None => true`。open/reload 后 `revision == persisted == 0` → `false`。与 design 02 §5 dirty 定义（confirmed != persisted）一致。
- `markflow-core/src/session.rs:580-591` `mark_persisted_clears_dirty_and_binds_identity` 验证完整生命周期：open clean → 编辑 dirty → persist clean。

**重跑验证**：`session::tests::open_zero_revision_and_clean`（:468-474）与 `reload_resets_content_and_revision`（:606-615）通过；我的故障注入独立确认 fresh open `is_dirty()==false`、reload 后 clean、被拒绝 patch 不置脏。

**结论**：根因确被修复，语义与 design 02 §5 一致。前端 `src/lib/editor.state.ts` 的 dirty 模型（`userRevision > persistedRevision`）与此兼容，无旧 `None` 行为依赖。

## 2. TextPatch identity + reload delayed-patch rejection（修复项 2）

**声明根因**：`TextPatch` 无 binding/session/document 身份；`reload` 不递增 generation，旧 binding 的 delayed patch 可与 revision 0 匹配而被误收。

**实现核对**：
- `markflow-core/src/patch.rs:41-52`：`TextPatch` 新增 `binding_generation/session_id/document_id` 字段。
- `markflow-core/src/patch.rs:60-78` `normalize_changes`：身份校验（:67-72）在 stale-revision 校验（:73-78）**之前**。因此 reload 后旧 generation、base_revision==0 的 delayed patch 命中 `WrongIdentity` 而非误判为合法，满足"不能匹配 revision 0"。
- `markflow-core/src/patch.rs:169-174` `fingerprint`：纳入三元身份，幂等账本（`session.rs:311-317`）与身份一致；reload 清空账本（`session.rs:208-209`）后重放的旧 patch 无账本命中，进入身份校验被拒。
- `markflow-core/src/session.rs:198-206` `reload`：`checked_add(1)` 递增 binding generation（溢出返回 `InternalInvariant`，不静默回绕）。
- `markflow-core/src/session.rs:224-226` 公开 `binding_generation()` 供 bridge 构造 patch。

**重跑验证**：`session::tests::reload_rejects_delayed_patch_from_previous_binding_generation`（:619-628）、`negative::patch_with_wrong_session_or_document_identity_is_rejected`（negative.rs:61-73）通过。我的故障注入额外验证：future generation（7 vs 当前 0）、wrong session_id、wrong document_id 均返回 `WrongIdentity` 且 revision/text/hash 不变。

**结论**：根因确被修复。身份校验位于 normalize 首部、先于 revision 比较，顺序正确；错误码 `wrong-identity` 已在 `error.rs:59-63`/`error.rs:92` 注册，design 02 §8 要求满足。

## 3. Multi-change Inherit EOL base-snapshot resolution（修复项 3）

**声明根因**：多 change patch 在 reverse 应用循环内解析 Inherit EOL，后一个 change 的替换会改变前一个 change 的邻域（`A\nB → X\r\nA\r\nB` 污染为错误结果）。

**实现核对**：
- `markflow-core/src/text_buffer.rs:124-158` `apply_changes`：先对**不可变 base**（`self.logical_text` / `self.line_endings`，未发生任何变更）用 `count_newlines_before` 为每个 change 预解析全部 replacement endings（:132-145），再 reverse 应用（:147-153）。解析与应用的坐标系分离，reverse 只影响 offset 映射，不影响 EOL 判定。
- reverse 应用中，因 `normalize_changes`（patch.rs:89-109）保证 changes 升序且不重叠，后应用的 change 严格在更高 offset，其替换不改变前序 change 范围内的 `count_newlines_before`（`replace_resolved` 在 :170-171 重算的边界与 base 一致）。
- `markflow-core/src/text_buffer.rs:201-248` `resolve_replacement_endings` 顺序核对：removed 同序号（:233-237）→ overflow 链 right→left→dominant（:217-221、:241-245），与 design 01 §3.4/§3.5 及已冻结的 §3.5 顺序消费语义一致。

**回归用例独立推演**（`eol_provenance.rs:328-352`）：base `A\nB`，change1 在 [0,0) 插入 `X\n`(Inherit)，change2 将 [1,2)（boundary 0）替换为 `\n`(ExplicitCrlf)。base 解析：change1 无 removed、右邻=LF → `X\n`；change2 显式 CRLF。结果 `X\nA\r\nB`，与断言一致；修复前行为（change1 取到 change2 的 CRLF）会得 `X\r\nA\r\nB`，正被本修复消除。

**相邻 mixed-EOL golden 独立推演**（`eol_provenance.rs:356-380`）：base 源 `A\r\nB\nC\rD`（逻辑 `A\nB\nC\nD`，boundaries [CRLF,LF,CR]）。change1 [0,1) 替换 A 为 `X\n`(Inherit) → 右邻 CRLF；change2 [1,2) 替换 `\n` 为 `\n`(ExplicitCr) → CR。结果逻辑 `X\n\nB\nC\nD`、endings [CRLF,CR,LF,CR]，回放 = `X\r\n\rB\nC\rD`，与断言一致（我最初误读 change1 为纯插入，重新推演后确认断言正确）。

**结论**：根因确被修复。base-snapshot 预解析符合 design 02 §3"按旧文档坐标表达"的原子 patch 语义。测试 `eol_provenance.rs:328-352`/`:356-380`、`zz_reviewer_independent.rs` 的 `reviewer_multi_change_atomic_eol` 全部通过。

## 4. PositionMap geometry mismatch rejection（修复项 4）

**声明根因**：公开 `PositionMap` 可被配对一个无关 `TextBuffer`，预计算数组被错误索引（越界或静默错误结果）。

**实现核对**：
- `markflow-core/src/position_map.rs:28` 新增 `geometry_id`，`:64` 在构造时取自 `text.geometry_id()`。
- `markflow-core/src/position_map.rs:179-184` `validate_geometry`：不匹配返回 `CoreError::PositionMapMismatch`。所有公开转换方法首行调用：`utf16_for_byte`(:78)、`byte_for_utf16`(:96)、`source_byte_for_byte`(:129)、`byte_for_source_byte`(:138)。其中 `byte_for_source_byte`（:146-176）是唯一索引预计算数组的路径，现已被 geometry 校验保护；binary_search 本身虽保证数组内索引不越界，但此前会给出静默错误结果。
- `markflow-core/src/text_buffer.rs:24` `geometry_id` 字段，`:299-306` `next_geometry_id()` 全局单调 AtomicU64；`:154-156` `apply_changes` 在任何非空变更后刷新。`apply_changes` 是 `TextBuffer` 唯一 `&mut self` 变更入口（grep 确认），无遗漏变更路径。
- `session.rs:346-348`：apply_patch 提交时重建 PositionMap，facade 与 text 恒一致；失败路径不改 position_map，不产生失配。
- 错误码 `position-map-mismatch` 在 `error.rs:63`/`error.rs:93` 注册。

**重跑验证**：`property_position::position_map_rejects_mismatched_text_geometry_without_panicking`（property_position.rs:258-272）通过。我的故障注入对 4 个公开方法在**行数与 EOL 宽度均不同**的外来 buffer 上逐一 `catch_unwind`：均返回 `PositionMapMismatch` 而非 panic；同一 map 对自身几何仍正常（无过度拒绝）。

**结论**：根因确被修复。Geometry 校验覆盖全部公开索引入口，且无未刷新 geometry_id 的旁路变更路径。

## 5. Random fixture hash re-run（列实际重跑的 fixtures + SHA-256）

`cargo test --test fixture_l0` 的 `zero_patch_prepare_save_returns_original_bytes_for_every_fixture` 遍历 byte-contract manifest 全部 24 fixtures，断言零 patch `prepare_save` 返回逐字节原文、revision/hash 稳定、content hash == manifest sha256。通过。

此外我手动以 `crypto.createHash('sha256')` 对 9 个 fixtures 的磁盘文件重算，全部与 `tests/fixtures/byte-contract/manifest.json` 匹配：

| fixture | sha256 | 与 manifest |
| --- | --- | --- |
| utf8-lf-tail0 | `b8ada2a7b0e544abde49ce047b911c3d9838a51422f5e2cb4781ee12a3a4a5c5` | OK |
| utf8-crlf-tail3 | `db562fc521f4ff93c530de24139cc7161a522d12f65948219dfc26b6fb6cc42a` | OK |
| utf8-cr-tail1 | `3e505e2c736942f615b6070bb561442271035453390544cf27f57d34642c0879` | OK |
| utf8-mixed-tail2 | `0a892d540a04d1b306768be51e56b90f89dce7d649f76d0fe87712a9053e3f85` | OK |
| utf8-bom-lf-tail2 | `c7d99fe8fa174dabd66a7be7463cc17d4475272432cf640fb177de53557d92fd` | OK |
| empty | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | OK |
| newlines-only | `6a3cf5192354f71615ac51034b3e97c20eda99643fcaf5bbe6d41ad59bd12167` | OK |
| unicode-emoji | `5466f6833170d5923a67a721110534460ab690069263d9734e1927456f97338b` | OK |
| syntax-frontmatter | `d298cb82a277b66abe81e6b64dceae71c5e8c1571256909ae3d578bf8614616d` | OK |

## 6. Failure-injection atomicity

我独立编写 6 个故障注入测试（`tests/zz_reviewer_fault_injection.rs`，运行后已删除，git 无残留），全部通过：

1. `open_and_reload_clean_and_rejection_does_not_dirty` — fresh open / reload 均 clean；wrong-identity 拒绝后仍 clean。
2. `delayed_pre_reload_patch_rejected_atomically` — reload 前构造 gen-0 patch（base_revision 0），reload 后 gen=1、revision=0，patch 被 `WrongIdentity` 拒绝；revision/text/hash 不变。
3. `stale_revision_atomic` — 正确身份 + 错误 base_revision → `StaleRevision`，revision/text/hash 不变。
4. `wrong_identity_atomic` — wrong session_id 与 wrong document_id 均 `WrongIdentity`，revision/text/hash 不变。
5. `future_generation_rejected` — future generation（7）对称拒绝。
6. `geometry_mismatch_stable_errors` — 4 个公开 PositionMap 方法对行数与 EOL 宽度均不同的外来 buffer：全部 `PositionMapMismatch`、无 panic；自身几何仍可用。

全部失败路径验证"失败后 revision/text/hash 不变"，符合 design 01 §8（失败时原子拒绝、不应用任何 change）。

## Verdict

四项 corrective 修复均独立确认：**根因属实且已被真正修复**。

1. open/reload clean：`from_parts`/`reload` 将 `persisted_revision` 置为 `Some(0)`，`is_dirty()==false`，与 design 02 §5 一致。
2. TextPatch 三元身份 + reload generation 递增：delayed/stale/future/wrong-identity patch 全部稳定拒绝，身份校验先于 revision 比较，错误码 `wrong-identity` 已注册。
3. 多 change Inherit EOL：全部 replacement endings 先对不可变 base 预解析再 reverse 应用；两个回归用例（含 corrective run 声明的 `A\nB → X\nA\r\nB`）独立推演与断言一致。
4. PositionMap geometry 绑定：4 个公开转换方法均先校验 geometry，`position-map-mismatch` 稳定返回，无越界/panic 路径。

门禁全部独立重跑通过（fmt/clippy/cargo test 92 绿 / byte-contract 全绿），9 个 fixture 手动 SHA-256 与 manifest 匹配，故障注入原子性成立。

**状态：PASS。** 可作为 P1A 前进证据。残余人工接受（human byte-contract acceptance / Program Owner Go-No-Go）按阶段设计仍需人工执行，本复核不替代。

## Open issues

1. **design 01 §3.4"surviving boundary"措辞与实现的多 change 语义**（非缺陷，属语义冻结）：实现对所有 change 一律按不可变 base snapshot 解析邻域，即"前序 change 的右邻可以是同 patch 中后序 change 正要替换的 boundary"（base 视角，per-change-surviving）。这与 design 02 §3"按旧文档坐标表达"一致，也已被 golden 测试钉死；但 design 01 §3.4 字面上的"surviving boundary"若读作"survive 整个 patch"，两者在 adjacent 场景会分歧（如 `adjacent_multi_change_mixed_eol_golden` 中 change1 取 CRLF 而非 change2 的显式 CR）。建议在 design 01 §3.4 增加一句明确"multi-change patch 内每个 change 的继承解析基于 base snapshot 边界（按自身 range 的 surviving 语义）"，消除 spec 歧义。
2. **geometry_id 全局计数器回绕**（理论性）：`text_buffer.rs:299-306` 的 AtomicU64 若回绕到已存在 buffer 的 id，理论上旧 PositionMap 可能误配。代码注释已承认（:301-305），实际概率可忽略，不阻塞。
3. **复核期间并发进程生成 `20260814-p1a-final-9ad0513/` 证据目录**：其 gate 输出与本复核一致（fmt/clippy/test/byte-contract 均 0，独立 harness PASS），但其"final"字样不应被误读为本复核结论；建议后续由 Program Owner 决定该目录去留。
