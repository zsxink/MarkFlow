# Validation Run Record — P0S（Legacy 零编辑写盘安全止血）

状态：AI GATE PASS + 独立 Reviewer PASS + **人工桌面 E3 验收 PASS（2026-08-13，xian）**；Program Go 已由验收人同意记录

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P0S（Slice 0S — Legacy 零编辑写盘安全止血） |
| Run ID | `20260813-031727-p0s-legacy-no-edit-guard` |
| Date/time | 2026-08-13 03:17:27 +0800 |
| Agent/operator | Claude Code（AI 实现 agent） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | ad59b21（P0S start HEAD；代码改动尚未提交，evidence 提交后见 git log） |
| Dirty status | P0S 实现改动在工作树（产品文件 + 测试 + 验证文档；pnpm-lock/pnpm-workspace 未跟踪且未触碰） |
| Feature flags | 无 lossless flags；legacy ProseMirror 默认路径；autosave 使用产品配置（`autosave=true` / `autosaveInterval=10000`） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `768c67190b0007e847bb3134b66ed6f854462d2b6a6961d172fc06245ed7c4b1` |

## 关联历史 run（不可变）

- P0 failing：`openspec/changes/archive/2026-08-13-p0-lossless-byte-contract/validation/evidence/P0/20260812-192707-p0-baseline/`
- P0 corrective（人工发现的零编辑写盘路径）：`…/P0/20260813-005131-p0-corrective-zeroedit-lifecycle/`
  —— 根因链：`openFileInEditor → setMarkdown/hydration → markDocumentPersisted
  serializer 回比（软换行→空格） → setReadOnly(false) 的 setEditable(true) 发送
  update（bumpRevision 0→1，dirty-check 确认） → autosave tick →
  saveActiveDocument → write_file 改写原文件`。
- P0 阶段结论：characterization ACCEPT（基线失败已被准确刻画），Program Owner GO → P0S。
- 历史 evidence 未修改（本次未写 archive 目录）。

## Scope

- 产品实现（归 umbrella change `refactor-lossless-live-preview`）：
  - `src/lib/editor.state.ts`：新增 `TransactionOrigin` 类型、`userRevision`/
    `persistedRevision`、`markProgrammaticContent`、`resetDocumentRevision`、
    `markDocumentPersistedRevision`、`hasUnpersistedUserChanges`。
  - `setMarkdown` 使用 `markProgrammaticContent('hydration')` 显式记录 hydration
    origin（满足 spec 的 transaction origin 分类，非范围扩大）。
  - `src/lib/editor.ts`：`markDocumentPersisted` 改为 revision 驱动（不再 serializer
    回比）；`setMarkdown` 重置 revision 并显式清 dirty；source-mode dirty-check 用
    revision 模型。
  - `src/lib/editor.init.ts`：`onUpdate` dirty-check 不再 serializer 回比，改用
    `bumpRevision + hasUnpersistedUserChanges`。
  - `src/components/sidebar.fileops.ts`：`setReadOnly` 的 `setEditable` 用
    `emitUpdate=false`（不发送正文 update）；`saveActiveDocument` 增加 clean-session
    guard（最终 write 入口，无 unpersisted user changes 直接 `skipped`，不调用
    serializer/write）。
  - `src/components/activeDocument.ts`：`clearActiveDocument` 的 `setEditable` 用
    `emitUpdate=false`。
  - `src/main.ts`：`runAutoSaveTick`（autosave coordinator 入口）增加双检查：
    store dirty AND `hasUnpersistedUserChanges()`。
- 测试：
  - 新增默认绿色 `src/main.lifecycle.guard.test.ts`（1S.5 零编辑 lifecycle regression
    10 fixtures × 双 tick + read-only/editable + A/B + reload + 干净 Ctrl+S + 1S.6
    真实用户编辑 + L1 未转绿守卫）。
  - 更新 `src/lib/editor.state.test.ts`（revision 模型单测）。
  - 更新 `src/main.autosave.test.ts`（coordinator 双检查）。
  - 更新 `src/components/sidebar.fileops.test.ts`（clean guard + 干净 Ctrl+S）。
  - 更新 `tests/byte-contract/legacy-open-autosave.characterization.test.ts`：
    零编辑 lifecycle 从「预期违约」转为「P0S 修复验证」；L1 serializer 失败
    characterization（pm-tail-newline）保持红色不转绿。
- 验证文档：`validation/ENVIRONMENT.md`、`validation/phases/P0S.md`（1S.1 阶段启动记录）。
- Excluded：`pnpm-lock.yaml`/`pnpm-workspace.yaml`（未跟踪、未触碰）；
  P0 evidence archive 目录（未修改）；P1A 及后续阶段（未开始）。

## Commands（全部 exit 0）

| ID | Command | Exit | Status | Output path |
| --- | --- | --- | --- | --- |
| C01 | `npm test` | 0 | PASS（32 files / 364 tests，含 1S.5 零编辑 lifecycle 默认绿色回归 17 项） | gate_npmtest.log |
| C02 | `npx tsc --noEmit` | 0 | PASS（0 errors） | gate_tsc.log |
| C03 | `npm run build` | 0 | PASS | gate_build.log |
| C04 | `npm run test:byte-contract` | 0 | PASS（fixtures --verify + L0/L1 self-check） | gate_bytecontract.log |
| C05 | `npm run test:characterization` | 0 | PASS（9/9：4 serializer 失败刻画 + 5 P0S 零编辑修复验证） | gate_characterization.log |
| C06 | `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | PASS（126 passed） | gate_cargo.log |
| C07 | `npm run test:e2e`（smoke，真实 WebKit WebView） | 0 | PASS（5 passing / 1 spec） | gate_e2e.log |
| C08 | `npx openspec validate --all` | 0 | PASS（61 items，含 umbrella 与归档后全部 delta） | gate_openspec_all.log |
| C09 | `bash scripts/check-archive-synced.sh` | 0 | PASS（全部 archive delta 已同步 main specs） | gate_archivesync.log |
| C10 | `git diff --check` | 0 | PASS | gate_diffcheck.log |

> 注：任务要求的 `npx openspec validate p0-lossless-byte-contract --strict` 因该
> child change 已于 2026-08-13 归档（不再作为 active change），由 `--all`（含归档
> 校验）覆盖。

## P0S 零编辑 lifecycle 证据（默认绿色回归 + characterization）

`src/main.lifecycle.guard.test.ts` 驱动真实 `openFileInEditor` → 真实 Tiptap
`initEditor`（真实 `onUpdate` + 400ms dirty-check）→ 真实 `setReadOnly(false)`/
`setEditable(true, emitUpdate=false)` → 真实 `runAutoSaveTick`（两个 tick）→ 真实
`saveActiveDocument` → 真实 `write_file` 到隔离临时目录真实文件。唯一 mock 为 Tauri
`invoke` IPC（vitest 无 Rust），路由到真实文件系统。**autosave 未关闭（断言产品默认
`autosave=true`/`interval=10000`），保存链路未 mock。**

| fixture | 输入 len | 输入 SHA 前缀 | dirty(open/settle/tick1/tick2) | rev(open/settle) | save count | 保存后 SHA == 输入 | mtime 变化 | 关闭提示 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| utf8-lf-tail0 | 24 | — | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-lf-tail1 | 25 | — | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-lf-tail2 | 68 | bc1b50f4 | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-lf-tail3 | 69 | 201dc08c | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-crlf-tail1 | 71 | — | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-crlf-tail2 | 73 | 6928ce65 | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-crlf-tail3 | 75 | db562fc5 | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-cr-tail1 | 67 | 3e505e2c | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-mixed-tail2 | 91 | 0a892d54 | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |
| utf8-bom-lf-tail2 | 71 | c7d99fe8 | false/false/false/false | 0/0 | 0 | 是 | 否 | 无 |

- read-only → editable 切换（真实 `setEditable`/`setSourceReadOnly` 产品路径）：
  dirty=false、rev=0、save=0、bytes/mtime 不变。
- A/B 文档切换：两个文档均 dirty=false、save=0、bytes/mtime 不变。
- reload（force）后：dirty=false、rev=0、save=0、bytes/mtime 不变。
- 干净 Ctrl+S：返回 `skipped`，`getMarkdown`（serializer）未被调用，无 write。

## 1S.6 真实用户编辑证据

对 utf8-lf-tail2（68B）真实打开后插入字符 `X`：revAfterEdit=1、dirty=true；
真实 `saveActiveDocument` 保存一次，dirty=false、`hasUnpersistedUserChanges()=false`
（persistedRevision 收敛）；写盘 mtime/hash 变化（len 68→71）。保存后字节确实变化
（legacy serializer 损失仍在）——**未把 L1 失败误标为已修复**；`pm-tail-newline`
characterization 仍断言基线违约并保持红色。

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| P0 零编辑打开即写盘（人工发现，corrective 已机器复现） | 2026-08-12 人工验收 / corrective run `20260813-005131` | 本 P0S run（P0S 修复验证） | 已修复：零编辑 dirty=false / save=0 / bytes 不变 / 无关闭提示 |
| 1S.5 read-only 测试曾用裸 `setEditable(true)`（emitUpdate=true）导致 dirty | 本 run 首次 | 改为真实产品路径 `setEditable(…, emitUpdate=false)` + `setSourceReadOnly` | 通过（证明产品路径正确，裸调用仍会 dirty 属预期） |

## Data and privacy

- Log redaction checked：PASS（记录仅 hash/length/mtime/计数；正文内容未写入生产日志）
- No user document used：PASS（fixtures 全部合成；`/Users/xian/markflow-test` 未读未写）
- No credential/token captured：PASS
- Test workspace isolated：PASS（`mkdtemp` 隔离目录 + 合成 fixtures，测试后清理）

## AI conclusion

- AI gate：PASS（C01–C10 全部 exit 0；默认绿色回归 17 项 + characterization 9/9 通过；
  L1 serializer 失败 characterization 保持红色未转绿）
- 修复摘要：
  1. hydration/setEditable 不再 bump userRevision（programmatic 不标脏）；
  2. `setEditable` 同步不发送正文 update（`emitUpdate=false`）；
  3. legacy dirty 改为 revision 驱动（`userRevision > persistedRevision`），
     移除 serializer/normalized string 回比；
  4. autosave coordinator 与最终 write 入口双重 clean guard；
  5. P0 零编辑 failing lifecycle 转默认绿色回归；
  6. 真实用户 transaction 仍 dirty/save/persist 收敛。
- Go/No-Go recommendation：PENDING（需独立 Reviewer + 人工桌面 E3 + Program Owner）
- Unrun items：Windows/Linux desktop、人工桌面 E3（真实 Tauri WebView + 隔离文件）、
  CJK IME、长窗口多周期观察。
- Risks：
  1. P0S 只修复「零编辑错误写盘」；legacy 编辑后 L1 byte fidelity 仍未修复（如实记录）。
  2. 真实用户编辑保存后 serializer 仍会规范化软换行/EOL/尾部（characterization 保持
     红色），P1B 前不得宣称 byte-to-byte。
  3. 干净 Ctrl+S 现在返回 `skipped` 且不写盘——这是 P0S 契约，但用户可能预期「已保存」
     提示；产品 toast 行为已保留（仅 clean 时静默跳过）。

## Independent review

- Reviewer：独立复核 agent（fresh context，2026-08-13）
- Review status：**PASS + Addendum**（含 `setMarkdown` 接入 hydration origin 的针对性确认）
- Review report：`./REVIEW.md`
- P0/P1 findings：无；P2 观察已处理（`markProgrammaticContent`/`TransactionOrigin` 由 hydration 接入消费；`lastPersistedMarkdown` 注释已更新）

## Human acceptance

- Human validator：**xian**（人工执行桌面 E3）
- Status：**ACCEPTED（PASS）** — 2026-08-13，7 个 fixture 副本零编辑打开 + 双 tick + 关闭全部无提示；
  `verify-all.sh` 显示 mtime/length/hash 全部未变（save count=0）；干净 Cmd+S 静默；只读→可写与 A/B
  切换不标脏；全新副本输入 `X` 后正常 dirty/保存/再关无提示。
- Record：`validation/manual-acceptance-p0s-checklist.md`（Section 0–5 + 结论 PASS，验收人签名 xian/2026-08-13）

## Program decision

- Owner：**xian**
- Decision：**GO**（人工桌面 E3 验收 PASS，验收人同意记录 P0S GO；P0S 止血完成）
- Date：**2026-08-13**
- Conditions：P0S 只修复「零编辑错误写盘」；编辑后 L1 byte fidelity 未解决，最终在 P1B，
  由 P1A/P1B 阶段继续验证，P0S 完成后 legacy 默认路径可继续用于人工/发布前验证
