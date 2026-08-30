# Validation Run Record — P6 M1 (substrate 9.1/9.2 + cohort M1 heading/paragraph/thematic break)

状态：**AI GATE GREEN（候选）** — 独立 Reviewer / 人工桌面验收 / Program Owner Go 均 NOT STARTED。实现 AI 不自行批准 Go（GOAL 治理）。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P6 — Typora 式基础 Markdown 编辑 |
| Run ID | `20260830-173622-p6-m1-8ba0f44` |
| Date/time | 2026-08-30T17:36:22+0800 |
| Agent/operator | Implementation AI（WorkBuddy 发财树），受 `validation/GOAL-executor-typora-complete.md` 治理；本会话为实现角色，非 Go 批准者 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract`（GOAL 记录的分支例外） |
| Start commit SHA | `8ba0f44bbe4cd231f210216ba222e22646af96f1` |
| Dirty status | M1 未提交 diff（见下 Scope / `git status`） |
| Feature flags | `livePreview.heading` + `.hidden`、`livePreview.thematicBreak` + `.hidden` 默认 OFF；paragraph 无 marker 归入 M1 但无 flag。测试显式 ON 后复原 OFF |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `7dfcf53222d0f294684212679519fdfb2fb5a1c9f925343e07fff9a5674e6f6c` |

## Scope

- Design document: `design/phases/P6-true-wysiwyg-hidden-markers.md` §2/§5/§9.1/§9.2/§9.3/§9.7。
- Changed modules:
  - `src/lib/lossless/livePreviewFlags.ts`（新增）— projection 与 hidden 分离 flag（9.7），默认 OFF，含 E2E hook `__setLivePreviewFlag`。
  - `src/lib/lossless/projection.ts` — 接入 `hidden` 可见性状态、`buildHiddenConstruct`（heading marker 隐藏 + thematic break 规则 widget）、`hiddenAtomicRanges` 经 `EditorView.atomicRanges` 发布（9.1）；`resolveConstructVisibility` 现返回 `hidden`（9.2）。
  - `src/lib/lossless/renderOwnerRegistry.ts` — `thematicBreak` 升为 local（仅当 `livePreview.thematicBreak` ON；默认 `source-fallback`）。
  - `src/styles/editor.css` — 新增 `.mf-hr` 规则（thematic break 渲染为分隔线）。
  - `src/lib/lossless/projection.test.ts` / `renderOwnerRegistry.test.ts` — M1 单测 + FALLBACK_KINDS 分区修正。
- Excluded modules: `validation/GOAL-executor-typora-complete.md`（用户提供的指令文档，保持 untracked 不提交）；cohort M2a/M2b/M3a/M3b（不在 M1 范围）；真实 CJK/日文 IME、screen reader、视觉基线、长时稳定（PENDING-MANUAL 桌面）。

## Commands

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | `npx vitest run src/lib/lossless/projection.test.ts` | PASS (43) | `gates/C01.log` |
| C02 | `npm test` | PASS (854) | `gates/C02.log` |
| C03 | `npx tsc --noEmit` | PASS | `gates/C03.log` |
| C04 | `cargo fmt --manifest-path markflow-core/Cargo.toml -- --check` | PASS | `gates/C04.log` |
| C05 | `cargo clippy --manifest-path markflow-core/Cargo.toml --all-targets --all-features -- -D warnings` | PASS | `gates/C05.log` |
| C06 | `cargo test --manifest-path markflow-core/Cargo.toml` | PASS (14) | `gates/C06.log` |
| C07 | `cargo test --manifest-path src-tauri/Cargo.toml` | PASS (161) | `gates/C07.log` |
| C08 | `npm run test:byte-contract` | PASS (L0 24/23; L1 95/93) | `gates/C08.log` |
| C09 | `npx openspec validate refactor-lossless-live-preview --strict` | PASS | `gates/C09.log` |
| C10 | `npx openspec validate --all` | PASS (61/61) | `gates/C10.log` |
| C11 | `npm run build` | PASS | `gates/C11.log` |
| C12 | `npm run test:e2e:build` | PASS | `gates/C12.log` |
| C13 | `node e2e/run.mjs smoke` | PASS (5 passing) | `gates/C13.log` |
| C14 | `node e2e/run.mjs lossless` | FLAKE（29 passing / 1 fail：WebDriver click JS 异常，非断言失败） | `gates/C14.log` |
| C14b | `node e2e/run.mjs lossless`（retry） | PASS (30 passing) | `gates/C14b-lossless-retry.log` |
| C15 | `bash scripts/check-archive-synced.sh` | PASS | `gates/C15.log` |
| C16 | `git diff --check` | PASS | `gates/C16.log` |

> C14 首跑 `① headingStrong` 用例因 WebDriver `click` JS 异常失败（基础设施层，无产品断言失败）；相同代码在更早的直跑（30 passing）与本重试 C14b（30 passing）均通过 → 判定为 Flaky（环境/headless WebKit 点击抖动），无需产品修复。重试证据见 `gates/C14b-lossless-retry.log`。

## Fixtures and byte results

- Byte-contract（C08）：L0 positive 24/24 pass、negative 23/23 pass；L1 positive 95/95 pass、negative 93/93 pass。M1 隐藏 marker 为 projection-only decoration，不改 `EditorState.doc`/`History`/dirty/revision/bytes（单测 `hidden marker produces no doc transaction` 覆盖）。

## Desktop workflows

| Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
| smoke：launch / file open / mode / save-reload / settings | 真实 Tauri 窗口 + 隔离 workspace 通过 | 5 passing（WebKit 605.1.15） | PASS | `gates/C13.log` |
| lossless：byte 保真 / mode switch 100× / marker reveal / widget / policy | 全部通过 | C14b 30 passing（retry） | PASS（首次 FLAKE 已重试闭合） | `gates/C14b-lossless-retry.log` |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| C14 `① headingStrong` WebDriver click JS 异常（无断言失败） | FAIL（exit 1，29/30） | C14b PASS（exit 0，30/30） | FLAKY — 环境/headless 点击抖动，非产品回归；不修复 |

## Data and privacy

- Log redaction checked: PASS
- No user document used: PASS
- No credential/token captured: PASS
- Test workspace isolated: PASS

## AI conclusion

- AI gate: **GREEN** — 全部要求的 GOAL/VALIDATION-PROTOCOL gate 通过（C01–C13, C15, C16）；C14 首次 flake 经重试 C14b 闭合（30/30）。
- Go/No-Go recommendation: 实现 AI **不自行批准 Go**。建议候选进入独立 Reviewer 复核 → 桌面人工验收（含真实 CJK/日文 IME、screen reader、视觉基线）→ Program Owner Go，遵循 GOAL §2.6/§2.8 治理。
- Unrun items（PENDING-MANUAL，桌面，E1–E4 证据等级要求）：真实中文/日文 IME 邻 marker 不丢字/不取消/一次 Undo；screen reader / 高对比 / zoom / 主题 / read-only；light/dark/sepia 视觉基线；≥8h/≥2 sessions 长时稳定 soak。
- Risks: flag 默认 OFF，关闭 hidden 回 dimmed、关闭 construct 回 source（单测覆盖，doc/History/dirty/revision/bytes 不变）；真实 IME/视觉未由自动化套件覆盖，需在桌面人工验收阶段补证。

## Independent review

- Reviewer: NOT STARTED
- Review status: NOT STARTED
- Review report: NOT STARTED

## Human acceptance

- Human validator: NOT STARTED（P6 人工验收由主会话派出验收人执行并签名，用户不参与；见 GOAL 顶部「人工验收责任划分」）
- Status: NOT STARTED
- Record: NOT STARTED

## Program decision

- Owner: NOT STARTED（Program Owner = xian）
- Decision: NOT STARTED
- Date: NOT STARTED
- Conditions: NOT STARTED
