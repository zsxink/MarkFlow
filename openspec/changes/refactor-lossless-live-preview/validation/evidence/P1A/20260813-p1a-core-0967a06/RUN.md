# Validation Run Record — P1A Core

状态：**AI gates PASS，独立 Reviewer CONDITIONAL PASS，§3.5 语义已冻结，待人工验收**

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P1A（最小 Lossless Core） |
| Run ID | `20260813-p1a-core-0967a06` |
| Date/time | 2026-08-13（Core run） |
| Agent/operator | 实现 AI（MarkFlow P1A 阶段） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `0967a06`（Core 实现）→ `0041c57`（reviewer EOL overflow 纠偏）→ `648e9a3`（§3.5 冻结测试）最终 candidate |
| Dirty status | Core 代码与证据已提交；剩 tasks.md/阶段文档状态行（待人工验收后定稿） |
| Feature flags | 无 lossless flags；Core 未接入产品入口 |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `5475b35757e7b4a47179375b74f76a12bb6c7332dfc4fdc291f0a3372e1f339f` |

## Scope

- Design document: `design/phases/P1A-lossless-core.md`、`design/01-byte-fidelity-and-position.md`、`design/02-core-session-and-sync.md`
- Child Issue/change: umbrella `refactor-lossless-live-preview`（tasks 2.1–2.7.1 完成）
- Changed modules: 新增独立 `markflow-core` crate（8 个 src 模块 + 5 个集成测试 + bench example）
- Excluded modules: 不实现 parser、Render IR、widgets、History；不接入默认编辑器；不修改 src-tauri/ 与前端

## Commands

| ID | Command | Exit | Status | Output path |
| --- | --- | --- | --- | --- |
| C01 | `cargo fmt --all -- --check` | 0 | PASS | `gate_core_fmt.log` |
| C02 | `cargo clippy --all-targets --all-features -- -D warnings` | 0 | PASS | `gate_core_clippy.log` |
| C03 | `cargo test`（Core 全量） | 0 | PASS | `gate_core_test.log` |
| C04 | `cargo run --example bench_large_inputs --release` | 0 | PASS | `gate_core_bench.log` |
| C05 | `npm run test:byte-contract`（P0 canonical fixture L0/L1 参照） | 0 | PASS | `gate_bytecontract_p0.log` |

## 测试汇总（`gate_core_test.log`）

- lib：35 passed
- integration `fixture_l0`：4 passed（零 patch prepare-save = 原始 bytes / 重复 clean prepare / hash / 无 parser 依赖）
- integration `fixture_l1`：3 passed（95 个 L1 intents 全匹配 oracle + 尾部保留 + 负向控制）
- integration `negative`：16 passed
- integration `property_position`：7 passed
- integration `eol_provenance`：15 passed（Mixed EOL 继承顺序 / 显式 paste provenance / BOM 保留 / provenance 数量原子拒绝 / §3.5 overflow 顺序）
- integration `zz_reviewer_independent`：6 passed（独立 reviewer 测试集，见下）
- 合计 86 项全绿，`-D warnings` 下 clippy 零告警

## Fixtures and byte results

- L0：24 个 canonical fixtures 全部 `zero_patch_prepare_save == original bytes`，SHA-256 与 manifest 一致，重复 clean prepare 不改变 revision/hash（`fixture_l0.rs`）
- L1：95 个 canonical L1 intents 全部 `saved == oracle(raw splice)`，prefix/suffix/BOM/trailing 逐字节断言（`fixture_l1.rs`）
- P0 harness 参照：L1 positive 95 / negative 93 全 PASS（`gate_bytecontract_p0.log`）
- 详细逐 fixture 结果见 `fixture_l0.rs`/`fixture_l1.rs` 测试名与断言消息

## Large-input benchmark（`gate_core_bench.log`）

| 大小 | open | prepare-save | patch | prepare-after-edit |
| --- | --- | --- | --- | --- |
| 1 MiB | 15.2ms | 1.0ms | 6.3ms | 0.99ms |
| 10 MiB | 75.1ms | 4.6ms | 28.1ms | 4.4ms |
| 50 MiB | 306.9ms | 21.9ms | 137.4ms | 23.5ms |

结论：进入 P1B 不会明显阻塞打开/输入（50 MiB open < 0.5s，prepare-save ~22ms）。

## Miri / sanitizer

- `cargo miri --version`：stable toolchain 无 `cargo-miri` 组件，Miri 不可用（如实记录，不伪报）。
- sanitizer 未启用（需 nightly/目标平台支持）。安全边界依赖独立 Reviewer 静态复核 + panic 审计完成。

## Failures and retries

实现过程中修复的测试期望错误（EOL 继承测试断言、UTF-16 surrogate 测试边界）均为测试自身问题。
**独立 reviewer 发现 §3.5 EOL overflow 继承顺序偏差**：多个 inherit 换行超出被替换 boundary 时，
应按固定邻域顺序顺序消费（被替换→右邻→左邻→dominant），原实现对 overflow 只取右邻。
已由 reviewer 独立测试集复现并纠偏（commit `0041c57`），修复后 reviewer 测试全绿。

## Independent reviewer 发现与纠偏

- reviewer 在 `markflow-core/tests/zz_reviewer_independent.rs` 写了 6 个独立断言（从 spec 推导，非 AI 测试）。
- Case B `reviewer_multi_overflow_order` 复现 §3.5 overflow 顺序消费问题。
- 修复后全部 PASS：left-neighbor、multi-overflow-order、CRLF-middle、BOM-middle、surrogate/continuation、multi-change-atomic-eol。

## Data and privacy

- 日志 redaction：本阶段无正文/私人路径写入日志
- No user document used
- No credential/token captured
- 测试 workspace 隔离（`markflow-core/tests` 只读 canonical fixtures）

## AI conclusion

- AI gate：全部 PASS（fmt / clippy -D warnings / 78 test / L0 / L1 / benchmark）
- panic 审计：非测试代码仅 2 处 `.expect()`（position_map UTF-16 循环，可证明不可触发）；无 parser/serializer 依赖
- Go/No-Go recommendation：**CONDITIONAL GO** — Core 实现与 AI 验证全过；等待独立 Reviewer 复核 + 人工验收后由 Program Owner 决定
- Unrun items：Miri/sanitizer（环境不可用，已记录）；逐 fixture hash 人工抽查（Reviewer 执行）
- Risks：无已知 P0/P1 数据完整性问题

## Independent review

- Reviewer：fresh-context 独立 Reviewer（已完成）
- Review status：**CONDITIONAL PASS**（基于 `0967a06`；条件已解决）
- Review report：`./REVIEW.md`
- Reviewer 独立验证 7 个随机 fixture SHA-256、6 个独立测试用例（A-F）
- Reviewer Open issues 处置：
  - #1（候选 commit 非工作树头）→ 已提交 `0041c57` 修复
  - #2（§3.5 多 overflow 语义缝隙）→ 已冻结 sequential-advance 语义 + 判分测试 `648e9a3`
  - #3（StaleRevision 字段语义文档）→ 待 P1B 桥接文档注明，非功能缺陷
  - #4（事务窗口 256 观察）→ P1B identity matrix 兜底，非阻塞
  - #5（Miri 不可用）→ 已如实记录，无处理

## Human acceptance

- 验收人：NOT RECORDED（P1A 无 UI，人工审阅 Core API / byte diff / 零 patch prepare-save 报告）
- Status：NOT STARTED（待 xian 按 `validation/manual-acceptance-p1a-checklist.md` 执行）
- 说明：P1A 人工验收为**代码审阅**，非桌面操作；清单已备妥

## Program decision

- Owner：xian
- Decision：NOT STARTED
- Conditions：人工验收通过（Reviewer 已 CONDITIONAL PASS，条件已解决）
