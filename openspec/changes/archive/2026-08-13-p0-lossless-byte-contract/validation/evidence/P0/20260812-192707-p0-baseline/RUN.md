# Validation Run Record — P0 baseline & byte contract

状态：AI GATE PASS

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P0（Slice 0：现状基线与 Byte 合同） |
| Run ID | `20260812-192707-p0-baseline` |
| Date/time | 2026-08-12 19:27:07 +0800 |
| Agent/operator | Claude Code（AI 实现 agent） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `d6f289e`（evidence 提交前基线；evidence 提交后见 git log） |
| Dirty status | evidence 提交前：tasks.md 状态更新；Cargo.lock（sha2 dev-dep） |
| Feature flags | 无 lossless flags；legacy ProseMirror 默认路径 |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `71a646f462a47edb74d06a81deeccecfa829700002650234860b568800fad2e6` |

## Scope

- Design document：umbrella `refactor-lossless-live-preview` P0 阶段设计 + child `p0-lossless-byte-contract`
- Child Issue/change：#255 / `p0-lossless-byte-contract`
- Changed modules：
  - `tests/byte-contract/`（fixtures 生成器、L0/L1 harness、PM characterization）
  - `tests/fixtures/byte-contract/`（24 个 canonical fixtures + manifest + l1-intents）
  - `vitest.characterization.config.ts`、`package.json` scripts
  - `src-tauri/src/dispatcher_contract.rs`、`src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`（dev-deps: sha2, tauri test feature）
  - `openspec/changes/p0-lossless-byte-contract/`（proposal/design/specs/tasks/docs）
- Excluded modules：产品编辑器代码（P0 不改默认行为）、`/Users/xian/markflow-test`（未读取未写入）

## Commands

| ID | Command | Start | End | Exit | Status | Output path |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | `npm test` | 19:25 | 19:25 | 0 | PASS | /tmp/gate_npmtest.log（339 passed） |
| C02 | `npx tsc --noEmit` | 19:25 | 19:25 | 0 | PASS | /tmp/gate_tsc.log（0 errors） |
| C03 | `npm run build` | 19:25 | 19:25 | 0 | PASS | /tmp/gate_build.log（built in ~3.4s） |
| C04 | `cargo test --manifest-path src-tauri/Cargo.toml` | 19:26 | 19:26 | 0 | PASS | /tmp/gate_cargo.log（126 passed） |
| C05 | `npm run test:byte-contract` | 19:14 | 19:14 | 0 | PASS | L0 24/24 + negative 23/23；L1 95/95 + negative 93/93 |
| C06 | `npm run test:characterization` | 19:12 | 19:12 | 0 | PASS（4/4，证明基线违反 L1） | 见 Fixtures 表 |
| C07 | `cargo test dispatcher_contract -- --nocapture` | 19:21 | 19:21 | 0 | PASS（4/4） | /tmp/gate_cargo.log |
| C08 | `npm run test:e2e`（smoke） | 19:27 | 19:34 | 0 | PASS | /tmp/gate_e2e.log（1 spec/5 tests passed，0 failure） |
| C09 | `npx openspec validate --all` | 19:26 | 19:26 | 0 | PASS（61 passed） | /tmp/gate_openspec_all.log |
| C10 | `npx openspec validate refactor-lossless-live-preview --strict` | 19:26 | 19:26 | 0 | PASS | /tmp/gate_umbrella.log |
| C11 | `npx openspec validate p0-lossless-byte-contract --strict` | 19:26 | 19:26 | 0 | PASS | /tmp/gate_child.log |
| C12 | `bash scripts/check-archive-synced.sh` | 19:26 | 19:26 | 0 | PASS | /tmp/gate_archivesync.log |

## Fixtures and byte results

### L0/L1 self-check（oracle + negative controls）

- L0：24 个 fixture 正例全过；23 个 negative（损坏未触及 byte）全被抓住；empty（0 字节）跳过损坏。
- L1：95 个 (fixture × edit intent) 正例全过；93 个 negative 全被抓住。

### PM 尾换行丢失 characterization（基线预期失败，被捕获）

| Fixture | 输入 SHA-256 | intent | oracle 尾部 | saved 尾部 | L1 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| utf8-crlf-tail2 | 6928ce65... | 正文插入 Z | `\r\n\r\n` | `\n` | FAIL（被捕获） | CRLF→LF，边界数低估（2→1） |
| utf8-crlf-tail3 | db562fc5... | 正文插入 Z | `\r\n\r\n\r\n` | `\n` | FAIL（被捕获） | 同上（3→1） |
| utf8-cr-tail1 | 3e505e2c... | 正文插入 Z | `\r` | `''` | FAIL（被捕获） | CR 尾换行完全丢失 |
| utf8-lf-tail3（用户删尾） | 201dc08c... | 删除全部尾部 | 用户意图无尾 | `\n\n\n` | FAIL（被捕获） | 陈旧元数据补回已删边界 |

完整输出与尾部 hex 见 characterization stdout（RUN 附件，随 evidence 提交）。

### Dispatcher contract（真实 dispatcher + 真实 FS）

- `read_write_roundtrip_preserves_bytes`：CRLF+CJK round-trip 通过；write/read payload sha256 一致（`8875a025...`）。
- `read_write_roundtrip_preserves_bom`：UTF-8 BOM round-trip 通过。
- `read_missing_file_returns_error`：缺失路径 → Err。
- `read_oversized_file_returns_error`：>100MB（sparse）→ Err。

## Desktop workflows

| Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
| e2e smoke（打开→保存基础流） | PASS | PENDING | PENDING | /tmp/gate_e2e.log |
| 人工桌面验证（LF/CRLF fixtures、正文单字符编辑、2/3 boundary） | 人工执行 | — | NOT STARTED | 人工验收记录 |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| 无（characterization 的「失败」是预期证明，不是 gate 失败） | — | — | N/A |

## Data and privacy

- Log redaction checked：PASS（未捕获正文/token；记录仅 hash 与尾部 hex）
- No user document used：PASS（fixtures 全部合成；`/Users/xian/markflow-test` 未读未写）
- No credential/token captured：PASS
- Test workspace isolated：PASS（temp dir + 合成 fixtures）

## AI conclusion

- AI gate：PASS（C01–C12 全部 exit 0）
- Go/No-Go recommendation：PENDING（需独立 Reviewer、人工验收、Program Owner）
- Unrun items：Windows/Linux desktop、CJK IME、人工桌面验证（E3/E4）
- Risks：
  1. #189 补偿对 CRLF/CR 尾部 count 低估且一律补 LF（本 run 已证明）。
  2. Windows/Linux guarded-write 原语 BLOCKED（无设备）。
  3. e2e smoke 依赖真实 WebView；本机 macOS 通过。

## Independent review

- Reviewer：NOT RECORDED
- Review status：NOT STARTED
- Review report：NOT RECORDED

## Human acceptance

- Human validator：NOT RECORDED
- Status：NOT STARTED
- Record：NOT RECORDED

## Program decision

- Owner：NOT RECORDED
- Decision：NOT STARTED
- Date：NOT RECORDED
- Conditions：NOT RECORDED
