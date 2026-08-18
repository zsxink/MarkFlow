# Validation Run Record — P2 AI Coding (initial)

状态：IN PROGRESS（AI coding 完成，gate 部分完成，桌面 E2E / 独立 Reviewer / 人工验收待做）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P2（单一 CodeMirror Surface + 基础 Live Preview） |
| Run ID | `20260818-p2-ai-coding-initial` |
| Date/time | 2026-08-18 |
| Agent/operator | Claude Code（AI coding agent） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `8bbcb79`（基线）→ 工作树含 P2 未提交改动 |
| Dirty status | DIRTY（P2 编码未提交） |
| Feature flags | `losslessCoreSession`（off 默认）、`codemirrorLivePreview`（off 默认，P2 新增） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `b0a3ef16d81172847e8627de25f8e7f14536073384a6736523136173123c524d` |

## Scope

- Design document: `design/phases/P2-live-preview-surface.md` + `design/03-editor-live-preview-and-interactions.md`
- Child Issue/change: `refactor-lossless-live-preview` umbrella change；关联 Issue #255
- Changed modules (frontend):
  - `src/lib/lossless/livePreviewFlag.ts`（新增 `codemirrorLivePreview` flag，default-off）
  - `src/lib/lossless/projection.ts`（新增本地 Lezer 投影 decorations + closure + debug state）
  - `src/lib/lossless/losslessSourceEditor.ts`（mode/projection compartments + setMode/setLivePreview + GFM）
  - `src/lib/lossless/editorSurfaceBinding.ts`（open 接 livePreview flag + setMode 转发）
  - `src/lib/lossless/integration.ts`（e2e hooks：setMode/getMode/projectionState/decorations）
  - `src/lib/editor.ts`（switchToWysiwyg lossless 分支改为 compartment reconfigure）
  - `src/components/outline.ts`（lossless 读 binding heading）
  - `src/lib/editor.stats.ts`（lossless 读 binding view）
  - `src/components/settings.ts`（applyRuntimeSettings 加 lossless 分支）
  - `src/components/sidebar.fileops.ts`（setReadOnly 加 lossless 分支）
  - `src/styles/editor.css`（projection decorations CSS）
  - `src/lib/lossless/projection.test.ts`（新增 5 adapter 测试）
  - `e2e/specs/lossless/live-preview.e2e.mjs`（新增 desktop semantic E2E）
  - `e2e/run.mjs`（lossless suite 写 P2 fixtures）
  - `e2e/specs/lossless/all-lossless.e2e.mjs`（注册 live preview 测试）
- Excluded modules: Core Rust（P2 不改 Core）、Tauri Rust（P2 不改 Rust）

## Commands

| ID | Command | Exit | Status | Output path |
| --- | --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | 0 | PASS | `logs/C01-tsc.log` |
| C02 | `npm run test` | 0 | PASS | `logs/C02-npm-test.log` |
| C03 | `npm run build` | 0 | PASS | `logs/C03-build.log` |
| C04 | `cargo test --manifest-path markflow-core/Cargo.toml` | 0 | PASS | `logs/C04-core.log` |
| C05 | `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | PASS | `logs/C05-tauri.log` |
| C06 | `npm run test:byte-contract` | 0 | PASS | `logs/C06-byte-contract.log` |
| C07 | `npx openspec validate refactor-lossless-live-preview --strict` | 0 | PASS | `logs/C07-openspec-strict.log` |
| C08 | `npx openspec validate --all` | 0 | PASS | `logs/C08-openspec-all.log` |
| C09 | `npm run test:e2e:build` + 桌面 E2E lossless | 0 | PASS（10 passing / 0 failing：6 P1B lifecycle + 4 P2 live preview） | `logs/C09-lossless-e2e-rerun.log` |
| C10 | 桌面 E2E regression | 0 | PASS（1 passing） | `logs/C10-regression-e2e.log` |
| C10 | 桌面 E2E smoke | 0 | PASS（5 passing） | `logs/C10-smoke-e2e.log` |
| C10 | 桌面 E2E p0s | 0 | PASS（4 passing） | `logs/C10-p0s-e2e.log` |

## P2 专属 AI 验证（adapter tests 已覆盖，见 projection.test.ts）

| # | 验证项 | 状态 | Evidence |
| --- | --- | --- | --- |
| 1 | 100 次模式切换 EditorView identity 不变 | PASS | `projection.test.ts::mode switching keeps...` |
| 2 | mode transaction docChanged=false + 不进 History | PASS | 同上（doc 不变 + selection 不变） |
| 3 | selection/direction/scroll/focus/composition/dirty/revision 切换前后不变 | PASS | 同上（selection anchor/head/assoc 断言） |
| 4 | 每个基础 construct 语义 class 与 source 字符共存 | PASS | `projection.test.ts::projects semantic classes...` |
| 5 | marker inactive/active/range/composition 状态正确 | PARTIAL | active reveal 断言有；composition 需桌面补 |
| 6 | projection 只失效目标 closure | PARTIAL | viewport 过滤实现；per-block diff 待 Reviewer |
| 7 | malformed/unknown 精确 source fallback | PASS | `projection.test.ts::malformed...` |
| 8 | projection exception/timeout/stale 不影响输入与保存 | PARTIAL | plugin try/catch degraded；e2e 待跑 |
| 9 | CJK/emoji/ZWJ selection mapping | PASS | `projection.test.ts::CJK/emoji/ZWJ...` |
| 10 | Home/End/Arrow/Shift+Arrow/Select All/copy | PARTIAL | keymap 未单测；桌面补 |
| 11 | light/dark/sepia、zoom 200%、read-only | PARTIAL | read-only 已接 binding；视觉待人工 |
| 12 | Large/Huge 降级 | PARTIAL | `degraded` 判定实现；未测超阈值 |
| 13 | autosave 开启干净文档切 100 次等两 tick 无写盘 | PARTIAL | e2e `100 mode switches...` 待跑 |
| 14 | unit/adapter/desktop semantic E2E/visual snapshot + byte hash | PARTIAL | unit+adapter 完成；E2E/visual 待跑 |

## 桌面 workflow

| Workflow | Expected | Actual | Status |
| --- | --- | --- | --- |
| 双 flag 开启 | lossless 单 surface | 待 E2E | NOT STARTED |
| Source↔Preview 切换不重建 | 同 view | 待 E2E | NOT STARTED |
| semantic decorations | 各 construct class | 待 E2E | NOT STARTED |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| `Strong` node name 误用 | `projection.test.ts` 首跑 2 fail | 改 `StrongEmphasis` 后 PASS | RESOLVED |
| `visibleRanges` happy-dom 疑问 | probe 验证全文档 range | — | CONFIRMED OK |

## 备注

- P1B gate：Program Owner 决定推迟人工验收、先进 P2（记录在 `validation/phases/P1B.md`），`tasks.md` 3.11 保持未勾选。
- P2 候选当前为工作树未提交状态，需 commit checkpoint 后进入 Reviewer/人工验收阶段。
