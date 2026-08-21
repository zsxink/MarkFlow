# RUN.md — P3 独立复核 + 桌面 E2E 全量重跑（Program Owner 授权的自动化验证）

- Run ID: `20260821-210027-p3-verification-rerun-head807b3ad`
- Date: 2026-08-21
- HEAD: `807b3ada786ebcb6039cffd3ee450cf3025fc3d4`（与 Reviewer GO 候选 `70f314c` 仅差 docs/evidence 提交，产品代码一致）
- Branch: `test/issue-255-lossless-byte-contract`
- 性质：复核（verification rerun）。所有命令在本会话 fresh 执行，非引用历史日志。
- 分工授权：Program Owner 只负责实际界面展示/产品形态的人工验证；其余验证由实现 AI 自动化完成。

## 1. 全 gate 重跑（第一轮复核）

| Gate | 命令 | 结果 |
| --- | --- | --- |
| tsc | `npx tsc --noEmit` | PASS（exit 0） |
| vitest | `npm test` | PASS — **42 files / 519 tests**，12.38s |
| build | `npm run build` | PASS — built in 3.58s（仅 chunk>500kB 警告） |
| byte-contract | `npm run test:byte-contract` | PASS — positive 95/95, negative **93/93**, missed=[] |
| core rust | `cd markflow-core && cargo test` | PASS — 37+18+4+3+17+8+6 = **93 passed, 0 failed** |
| tauri rust | `cd src-tauri && cargo test` | PASS — **151 passed, 0 failed** |
| openspec | `npm run validate:openspec` | PASS — **61 passed, 0 failed** |

## 2. 桌面 E2E 全套件重跑（真实 Tauri app + WebKit 605.1.15）

| Suite | 用例数 | 结果 |
| --- | --- | --- |
| `node e2e/run.mjs lossless` | 10（P1B lifecycle 6 + P2 live-preview 4，含 100 次模式切换） | **10 passing** (1m27s) |
| `node e2e/run-lossless-acceptance.mjs` | 15（P2-1~9 acceptance + P1B-1/2/3/4/5/8/10） | **15 passing** (1m2s) |
| `node e2e/run.mjs p0s` | 4（零编辑两 tick、立即 Cmd+S、A→B discard、干净 Ctrl+S） | **4 passing** (37s) |
| `node e2e/run.mjs regression` | 1（真实后端导出两份完整 PDF） | **1 passing** (552ms) |

- 首次尝试将 p0s 与 regression 并行启动导致 WDIO ECONNREFUSED（两个 driver 抢占），
  已作废并串行重跑；上表为串行 fresh 结果。p0s 日志见 `gates/e2e-p0s.log`。
- 已知依赖注记（沿用 P2）：WebKit WebDriver 无法注入 Cmd+Shift+Z 组合键，
  Redo 组合键依赖人工确认（REDO-NOTE，acceptance 运行内打印）。

## 3. characterization

`npm run test:characterization` — PASS：**2 files / 9 tests**（legacy open→autosave
lifecycle + P0S fix verification），日志 `gates/characterization.log`。

## 4. N1 修复抽查（代码级）

- `sidebar.conflict.ts` lossless 路径写 `binding.logicalText` 而非 `getMarkdown()`；
  named seam `bindPersistedAfterResave` 保持路径对称。
- 回归测试在 `sidebar.conflict.test.ts:82`（dirty lossless → logicalText）与 `:97`
  （dirty legacy → getMarkdown 不变），均含于上述 519。

## 结论

机器可验证面（单元/集成/Rust/byte-contract/OpenSpec/四个桌面 E2E suite 共 30 个
desktop 用例 + characterization 9 项）全部独立重跑通过。Reviewer GO（`70f314c`）
声明与本 run 一致。

剩余不可自动化项（归 Program Owner 人工界面验证）：
真 IME composition 会话手感、Redo 组合键（WebDriver 注入限制）、accessibility/
screen-reader 主观体验、30 分钟连续编辑观察的整体观感、视觉样式主观满意度。
