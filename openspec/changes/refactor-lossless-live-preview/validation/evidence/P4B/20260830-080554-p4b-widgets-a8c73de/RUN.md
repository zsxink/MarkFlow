# P4B Widget/Policy Candidate Validation Run

状态：**SUPERSEDED — 未封存（gate 退出码未捕获，不作正式 gate run）**

> ## 封存附录（2026-08-30 补记；历史正文不回写）
>
> 本 run 在 `08:14` 之后被搁置，**从未封存**：`RUN.md` 的 gate 表格停留在 `NOT STARTED`，
> 且**所有 gate 均未捕获退出码**（`gates/` 下只有 `.log`，没有 `.exit`）。
>
> 因此本 run **不作为正式 gate run 计入 P4B**。下面「Commands」表格的 `NOT STARTED`
> 是当时的真实记录状态，现按证据不可变原则原样保留，不回填、不改写。
>
> ### gate 日志的实测内容（可查，但退出码缺失）
>
> | ID | 日志内容摘要 |
> | --- | --- |
> | C01 | 8 files / 279 tests passed |
> | C02 | `tsc --noEmit` 无错误输出 |
> | C03 | 51 files / 843 tests passed |
> | C04 | `✓ built in 4.15s` |
> | C05 | core `test result: ok. 0 passed; 0 failed`（该 crate 无测试） |
> | C06 | tauri `test result: ok. 0 passed; 0 failed`（无测试） |
> | C07 | byte-contract `"pass": true`、`"failed": []` |
> | C08 | `Change 'refactor-lossless-live-preview' is valid` |
> | C09 | `Totals: 61 passed, 0 failed (61 items)` |
> | C10 | `OK: all archived delta specs … are synced to main specs` |
> | C11 | `Built application at: …/src-tauri/target/debug/…` |
> | C12 | lossless `Spec Files: 1 passed, 1 total` |
> | C13 | smoke `1 passed, 5 skipped, 6 total`（见下方口径说明） |
> | C14 | regression `1 passed, 1 total` |
> | C15 | p0s `1 passed, 1 skipped, 2 total`（同口径） |
> | C16 | `git diff --check` 输出为空（无空白错误） |
> | C17 | core `cargo fmt --check` 输出为空 |
> | C18 | core clippy `Finished dev profile` |
> | C19 | tauri clippy `Finished dev profile` |
>
> 日志内容一致指向成功，但**退出码未落盘 = 不可复核**，故只作探索性证据。
>
> ### 「skipped」口径说明（避免后续误读为覆盖不足）
>
> `smoke` 报 `5 skipped`、`p0s` 报 `1 skipped`，**不是测试被跳过**。
> `e2e/specs/smoke/all-smoke.e2e.mjs` 是聚合入口，把 5 个模块以 `register*Tests()`
> 形式导入并在同一 Tauri session 内串行执行；被聚合的 5 个文件自身没有顶层测试，
> 因此被 WDIO 计为 skipped。同理 `p0s/all-p0s.e2e.mjs` 聚合 `p0s-lifecycle.e2e.mjs`。
> 即：**smoke 与 p0s 的实际覆盖是完整的**，skip 计数是聚合设计的显示副作用。
>
> ### 与本 run 相关的结论处置
>
> - 本 run 的 **7.3（真实 IME）FAIL** 结论：根因是锁屏会话，已在
>   `20260830-102354-p4b-ime-7869de8` 中通过真实解锁 GUI 会话解决，中/日文均通过。
>   本 run 的 FAIL 观察保持原样，不因后续成功而改写。
> - 本 run 的 widget/策略项（task/fence/owner/FrontMatter/raw HTML）**只有探索性 PASS**，
>   正式 gate 证据见 `20260830-102354-p4b-ime-7869de8`（20/20，含退出码）。
> - `FAILURES.md` 中 fence boundary 的修正与复测记录保持原样。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P4B |
| Run ID | `20260830-080554-p4b-widgets-a8c73de` |
| Date/time | started 2026-08-30T08:05:54+08:00 |
| Agent/operator | Codex root executor |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Base commit SHA | `a8c73de70eb07ae374eed8ae227ad0097815db0b` |
| Dirty status | Expected candidate implementation/tests/evidence; user GOAL file excluded |
| Feature flags | lossless Core + Live Preview ON; P4B cohorts tested independently OFF/ON |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | PENDING FINAL MANIFEST |

## Scope

- Design: `design/phases/P4B-widgets-cohorts.md` and frozen P4B interaction ADR.
- Candidate: visibility contract, common interaction harness extensions, widget protocol, child-slot owner arbitration, task/fence pilots, FrontMatter/raw HTML policies, and exact-source fallbacks for deferred rich constructs.
- Excluded: P6 hidden-marker behavior; P7 image/table/Mermaid/PlantUML widgets; real IME completion; P4B substrate/item GO decisions.

## Pre-candidate exploratory evidence

- Focused unit suite: 8 files / 279 tests PASS.
- TypeScript: `npx tsc --noEmit` PASS.
- Desktop lossless suite: final exploratory result 22/22 PASS.
- Independent reviewer: PASS on the candidate implementation; no remaining 7.1/7.2/7.4–7.8 code blocker.
- These observations are rerun or explicitly separated from formal candidate gates below.

## Commands

| ID | Command | Status | Output |
| --- | --- | --- | --- |
| C01 | focused P4B unit suite | NOT STARTED | `gates/C01-focused-unit.log` |
| C02 | `npx tsc --noEmit` | NOT STARTED | `gates/C02-tsc.log` |
| C03 | `npm test` | NOT STARTED | `gates/C03-npm-test.log` |
| C04 | `npm run build` | NOT STARTED | `gates/C04-npm-build.log` |
| C05 | `cargo test --manifest-path crates/markflow-core/Cargo.toml` | NOT STARTED | `gates/C05-core-test.log` |
| C06 | `cargo test --manifest-path src-tauri/Cargo.toml` | NOT STARTED | `gates/C06-tauri-test.log` |
| C07 | byte-contract harness | NOT STARTED | `gates/C07-byte-contract.log` |
| C08 | `npx openspec validate refactor-lossless-live-preview --strict` | NOT STARTED | `gates/C08-openspec-strict.log` |
| C09 | `npx openspec validate --all` | NOT STARTED | `gates/C09-openspec-all.log` |
| C10 | `bash scripts/check-archive-synced.sh` | NOT STARTED | `gates/C10-archive-sync.log` |
| C11 | E2E build | NOT STARTED | `gates/C11-e2e-build.log` |
| C12 | `node e2e/run.mjs lossless` | NOT STARTED | `gates/C12-e2e-lossless.log` |
| C13 | `node e2e/run.mjs smoke` | NOT STARTED | `gates/C13-e2e-smoke.log` |
| C14 | `node e2e/run.mjs regression` | NOT STARTED | `gates/C14-e2e-regression.log` |
| C15 | `node e2e/run.mjs p0s` | NOT STARTED | `gates/C15-e2e-p0s.log` |
| C16 | `git diff --check` | NOT STARTED | `gates/C16-diff-check.log` |

## Desktop workflows

| Workflow | Expected | Current state | Evidence |
| --- | --- | --- | --- |
| task checkbox | ARIA state, Space/click local patch, one Undo, exact bytes, read-only no-op | exploratory PASS; formal pending | C12 |
| fence controls | language badge, exact source clipboard, local patch, one Undo, exact bytes, read-only no-op | exploratory PASS after boundary correction; formal pending | C12 + `FAILURES.md` |
| owner arbitration | parent local + independent child widget/fallback, no dual owner | exploratory PASS | C01/C12 |
| FrontMatter/raw HTML | parser-gap exact source; raw HTML inert/source-only | exploratory PASS | C01/C12 |
| real Chinese/Japanese IME | real composition start/update/end + commit + one Undo | FAIL / environment-limited | `FAILURES.md`, `ime/` |

## Failures and retries

See `FAILURES.md`. No failure has been converted into a pass by documentation.

## Data and privacy

- Generated fixtures only; no user document.
- No credential, token, or document content in the logs.
- IME files contain only the fixed strings `# marker\n` and `> marker\n`.
- User-supplied GOAL file is excluded from artifacts and commits.

## Current conclusion

- 7.1/7.2/7.4–7.8 implementation candidate: independent reviewer PASS; formal gates pending.
- 7.3: NOT COMPLETE because no real unlocked GUI composition run has passed.
- 7.9/7.10 and all P4B GO decisions: NOT COMPLETE.
- Program decision: NOT STARTED.
