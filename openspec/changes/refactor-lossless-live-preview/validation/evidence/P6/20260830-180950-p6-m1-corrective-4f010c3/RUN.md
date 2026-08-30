# Validation Run Record — P6 M1 CORRECTIVE (Reviewer blocker Q1 fix)

状态：**AI GATE GREEN（纠正运行）** — 独立 Reviewer 复核进行中（重新派发独立 sub-agent 复核 `4f010c3`，verdict 待回）；人工桌面验收 / Program Owner Go 均 NOT STARTED。实现 AI 不自行批准 Go（GOAL 治理）。

本 run 是 `20260830-173622-p6-m1-8ba0f44` 的**纠正 run**（证据不可变性：不就地改写已封存 run，另建新 run 并链接）。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P6 — Typora 式基础 Markdown 编辑 |
| Run ID | `20260830-180950-p6-m1-corrective-4f010c3` |
| Date/time | 2026-08-30T18:12:35+0800 |
| Agent/operator | Implementation AI（WorkBuddy 发财树），受 `validation/GOAL-executor-typora-complete.md` 治理；本会话为实现角色，非 Go 批准者 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract`（GOAL 记录的分支例外） |
| Start commit SHA | `8ba0f44bbe4cd231f210216ba222e22646af96f1` |
| M1 candidate commit | `6557c06` |
| Corrective commit | `4f010c3`（仅改 `src/lib/lossless/projection.test.ts`：EditorView 导入 type→值 + `span.mf-h` 选择器修正 + Q5 测试对象同一性强化；生产逻辑未变） |
| Dirty status | 无（`4f010c3` 已提交；仅用户提供的 GOAL 与初始 FAIL REVIEW.md untracked，均排除） |
| Feature flags | 同 M1 候选：`livePreview.heading[.hidden]`、`livePreview.thematicBreak[.hidden]` 默认 OFF |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `fee8b8bbf7b27d0172e093f09d97d442a752bb1b1fc9c38aeafe9c11a716da27` |

## Why a corrective run

独立 Reviewer 在 `20260830-173622-p6-m1-8ba0f44` 判 **FAIL (1 blocker)**：

- **Q1 (Blocker)**：`src/lib/lossless/projection.test.ts:126` 以 `import { runScopeHandlers, type EditorView }` 导入 EditorView，却在 `:1401` 把 `EditorView` 当运行时值使用（`view.state.facet(EditorView.atomicRanges)`）。导致 `tsc` 报 TS1361，且 esbuild 在运行时消除 type-only 导入 → 测试抛 `ReferenceError: EditorView is not defined`，ADR §2 atomicRanges 合同测试从未真正执行。
- 根因：实现 AI 上一轮报告的 “tsc 干净 / projection 43 passed” 是 **stale-cache false-green**（vitest transform 缓存 + tsc incremental 缓存返回了旧文件版本）。

纠正（commit `4f010c3`）：将第 126 行改为 `import { runScopeHandlers, EditorView } from '@codemirror/view';`（值导入，同时可作类型与值）。生产 `projection.ts` 本就以值导入 EditorView（line 28），故仅是测试桩缺陷，非产品逻辑回归。

## Scope

- Changed modules (vs M1 candidate `6557c06`，均为测试桩、生产逻辑未变)：
  - `src/lib/lossless/projection.test.ts`：
    - `EditorView` 导入由 `import type` 改为值导入（纠正 Q1 blocker）；
    - `span.mf-h1`→`span.mf-h` 选择器修正，使 revealed heading 的 DOM 断言命中 `mf-h mf-active`；
    - Q5 测试重命名为 `…does not create a doc-changing transaction` 并以 `view.state.doc` 对象同一性（`toBe(docBefore)`）强化断言（严格强于旧的长度/字符串比较）。
- Unchanged (production logic untouched): `projection.ts`、`livePreviewFlags.ts`、`renderOwnerRegistry.ts`、`editor.css` 等均与 `6557c06` 一致。因此 Rust gates (C04–C07) 与桌面 E2E (C13/C14) 沿用已封存 run 的绿结果，本 run 不复跑（见下“未复跑项”）。

## Commands

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | PASS (clean) | `gates/C01.tsc.log` |
| C02 | `npm test` (vitest run --no-cache) | PASS (858) | `gates/C02.vitest.log` |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | PASS (47) | `gates/C03.projection.log` |
| C08 | `npm run test:byte-contract` | PASS (L0 24/23; L1 95/93) | `gates/byte-contract.log` |
| C10 | `npx openspec validate --all` | PASS (61/61) | `gates/openspec.log` |
| C11 | `npm run build` (CODEBUDDY_SAFE_DELETE_ENABLED=0) | PASS (built 5.17s) | `gates/C11.build.log` |

> 复跑均带 `--no-cache`（vitest）与 fresh tsc，以排除 stale-cache false-green。C01 tsc 同时是 C11 build 的 `tsc` 步骤，二者一致 clean。
> 未复跑项（生产逻辑未变，沿用封存 run `20260830-173622-p6-m1-8ba0f44`）：C04 `cargo fmt` (markflow-core) PASS、C05 `cargo clippy` PASS、C06 `cargo test` (markflow-core) 14 PASS、C07 `cargo test` (src-tauri) 161 PASS、C09 `openspec --strict` valid、C12 `test:e2e:build` built、C13 desktop smoke 5 PASS、C14 desktop lossless 30 PASS（首跑 flake 经 C14b 重试闭合）。

## Fixtures and byte results

- Byte-contract（C08）：L0 positive 24/24、negative 23/23；L1 positive 95/95、negative 93/93。M1 隐藏 marker 为 projection-only decoration，不改 doc/History/dirty/revision/bytes（单测覆盖）。

## Corrective verification

- `git show 4f010c3 --stat`：仅 `projection.test.ts` 变更（1 file changed, 12 insertions(+), 8 deletions(-)）。
- 修正后 `tsc --noEmit` clean（C01），`projection.test.ts` 47/47（C03），其中 atomicRanges 合同测试 `view.state.facet(EditorView.atomicRanges)` 真实执行并 PASS（无 ReferenceError）。
- 全量 `npm test` 858/858（C02）—— 先前误报“43 passed”的那轮，现确认为真实 47（测试文件内含多用例，含 reveal 断言）。
- `npm run build` 成功（C11），确认生产 `tsc` 步亦 clean。

## Independent review

- Reviewer: 重新派发独立 sub-agent 复核 `4f010c3`（run `20260830-180950-p6-m1-corrective-4f010c3`）
- Review status: **PASS**（verdict 已回，见本目录 `REVIEW.md`）
- 结论要点：
  - **Q1 (原 blocker) 已修复**：`tsc --noEmit` exit 0（无 TS1361）；`projection.test.ts` 47/47；ADR §2 `hiddenAtomic is published through the EditorView.atomicRanges facet (ADR §2)`（`projection.test.ts:1399`，调用 `EditorView.atomicRanges` 于 :1405）真实执行并 PASS（此前被 esbuild 消除 type-only 导入，从未运行）。
  - 生产 `projection.ts` 未被 `4f010c3` 触碰（line 28 本就以值导入 EditorView），生产逻辑字节级不变。
  - 二次扫描 `import type` 用作值：全树无其余误用（tsc 干净即决定性证据）。
  - **Q2–Q6 均非阻塞**：Q2=Nit（"local" 术语歧义，功能正确）、Q3=Minor（revealed thematic break 0 高 CSS 规则视觉缺陷，待桌面人工核查）、Q4=Nit（模块级单例，单 surface 可接受）、Q5=Nit(improved)（对象同一性强于旧比较）、Q6=Nit（空闲切 flag 下次交互生效，设计可接受）。
  - 新发现（信息级，非阻塞）：commit 范围描述“仅改 import”略有偏差（同时含 Q5 测试强化，无害）；"local" 术语双义建议补一行注释（已并入 Q2）。
- Review report: `REVIEW.md`（Verdict: **PASS**）

## Human acceptance

- Human validator: NOT STARTED
- Status: NOT STARTED

## Program decision

- Owner: NOT STARTED（Program Owner = xian）
- Decision: NOT STARTED（实现 AI 不自行批准 Go）
