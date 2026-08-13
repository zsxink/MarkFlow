# P0S 验证记录：Legacy 零编辑写盘安全止血

总体状态：AI GATE PASS + 独立 Reviewer PASS（run `20260813-031727-p0s-legacy-no-edit-guard`）
+ **人工桌面 E3 验收 PASS（2026-08-13，xian）** + **Program GO（2026-08-13）** —— P0S 阶段完成

正式设计：[P0S：Legacy 零编辑写盘安全止血](../../design/phases/P0S-legacy-no-edit-save-guard.md)

## 阶段启动记录（1S.1，2026-08-13）

- **P0 characterization 结论**：ACCEPT —— 仅表示 legacy 失败已被准确刻画，不代表
  byte fidelity 已修复。人工基线 REJECT 的三项失败（零编辑打开即 autosave 改写、
  中间软换行 `\n`→` `、CRLF 尾坍缩 2→1/3→1）全部由 corrective run 逐字节复现。
- **Program Owner**：GO → P0S（任何继续提供 legacy 默认路径的可发布/人工验收构建
  必须先通过 P0S）。
- **P0S start commit**：`ad59b21`（`docs: 同步 lossless 程序设计/验证文档与 P0S 止血设计`）
- **Branch**：`test/issue-255-lossless-byte-contract`
- **Flags/settings**：无 lossless flags；legacy ProseMirror 默认路径；
  autosave 使用产品实际配置（`DEFAULT_SETTINGS.autosave=true` /
  `autosaveInterval=10000`），不得通过全局关闭 autosave 绕过。
- **引用的不可变 P0 evidence**（`openspec/changes/archive/2026-08-13-p0-lossless-byte-contract/validation/evidence/P0/`）：
  - failing run：`20260812-192707-p0-baseline/`（`RUN.md`/`ENVIRONMENT.md`/`REVIEW.md`）
  - corrective run：`20260813-005131-p0-corrective-zeroedit-lifecycle/`
    —— 根因链：`openFileInEditor → setMarkdown/hydration → markDocumentPersisted
    serializer 回比（软换行→空格） → setReadOnly(false) 的 setEditable(true) 发送
    update（bumpRevision 0→1，dirty-check 确认） → autosave tick →
    saveActiveDocument → write_file 改写原文件`。
- **产品实现归属**：所有 P0S 产品改动归 umbrella change `refactor-lossless-live-preview`；
  P0 evidence-only child `p0-lossless-byte-contract` 已归档，保持历史边界，不修改其证据。

## Candidate identity

| Branch | Commit | Flags/settings | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | ad59b21（P0S start；实现尚未提交） | legacy + autosave=true / interval=10000 | `20260813-031727-p0s-legacy-no-edit-guard` |

## AI Coding 验证

- [x] Unit/typecheck/build/Rust/OpenSpec gates（run C01–C10 全 exit 0）
- [x] `setContent`/hydration 不增加 user revision（rev(open/settle)=0/0，10 fixtures）
- [x] `setEditable`/read-only 切换不发送正文 update、不增加 user revision（`emitUpdate=false`；产品路径测试通过）
- [x] legacy dirty 不依赖 PM serializer/normalized string 回比（revision 驱动；干净 Ctrl+S 断言 `getMarkdown` 未调用）
- [x] autosave coordinator clean guard（`runAutoSaveTick` 双检查：store dirty AND `hasUnpersistedUserChanges()`）
- [x] 最终 write 入口 clean guard，错误 UI dirty 仍不写盘（`saveActiveDocument` clean-session 前置 guard）
- [x] 干净 Ctrl+S 返回 `skipped`，不调用 serializer/write（unit + 真实 lifecycle 双证）
- [x] LF/CRLF/CR/Mixed/BOM/tail0-3 lifecycle regression（10 fixtures 默认绿色）
- [x] autosave=true，零编辑等待至少两个 tick（真实 `runAutoSaveTick` × 2）
- [x] dirty=false、save count=0、hash/length/mtime 不变、关闭无提示
- [x] A/B 打开、只读→可写、reload 不产生零编辑写盘
- [x] 一个真实用户 transaction 增加 revision/dirty，legacy 保存仍可触发（revAfterEdit=1，save 后 persisted 收敛）
- [x] P0 编辑后 L1 failing characterization 仍被如实记录，未误标为已修复（`pm-tail-newline` 保持红色）
- [x] 新 RUN 链接不可变的 P0 failing/corrective evidence（RUN.md Identity/关联历史 run）

## 人工验证记录

- 验收人/日期/设备：xian / 2026-08-13 / macOS Darwin 25.5.0（Tauri dev build，DEBUG；WKWebView）
- fixture/hash：7 个 byte-contract fixture 副本于 `/Users/xian/markflow-test/p0s-acceptance-20260813/`
  （SHA-256/length/mtime 见清单 Section 1 记录表；`verify-all.sh` 验收后全 OK 字节未变）
- autosave/interval：产品默认 `autosave=true` / `autosaveInterval=10000`（未关闭）

- [x] LF tail2/tail3 零编辑等待两个 tick
- [x] CRLF tail2/tail3 零编辑等待两个 tick
- [x] dirty=false、save count=0、hash/length/mtime 不变
- [x] 关闭无未保存提示
- [x] 干净 Ctrl+S 不写盘
- [x] 只读→可写与 A/B 切换不标脏
- [x] 全新副本输入一个字符后正常 dirty/save（`manual-edit-utf8-lf.md.md`，正文 `BodyX paragraph`，保存成功）
- [x] 验收记录明确 P0S 不解决编辑后 byte fidelity

人工结论：**ACCEPTED（PASS）** — 零编辑写盘安全验证通过；编辑后 L1 byte fidelity 边界如实记录待 P1B

## Reviewer 与决定

- [x] Reviewer 静态检查没有接受 serializer 输出作为 baseline（`lastPersistedMarkdown` 只写不读；dirty 全部 `hasUnpersistedUserChanges()`）
- [x] Reviewer 确认没有扩大 trailing metadata 或全局关闭 autosave（`trailingNewlines` scope 与 P0 相同；`DEFAULT_SETTINGS.autosave=true` 保持）
- [x] Reviewer 确认 transaction origin/revision 不漏真实用户编辑（`bumpRevision()` 仅 onUpdate 守卫 + source-mode 真实编辑两处）
- [x] Reviewer 重跑 LF + CRLF/Mixed 真实 desktop lifecycle（17/17 默认绿色回归 + 5/5 characterization 实盘链路）
- [x] Reviewer 确认 clean guard 位于最终 write 前（`saveActiveDocument` L118-129，位于 getMarkdown/write 之前）
- Reviewer：独立复核 agent（fresh context，2026-08-13）
- 复核结论：**PASS**（报告在 `evidence/P0S/20260813-031727-p0s-legacy-no-edit-guard/REVIEW.md`）
- 复核后针对性改动确认：**PASS**（Addendum 确认 `setMarkdown` 接入 `markProgrammaticContent('hydration')` 为语义等价重构，消解 P2-1；原结论不变）
- P0/P1 findings：无
- P2 观察：`lastPersistedMarkdown` 注释已更新为事实描述；`markProgrammaticContent`/`TransactionOrigin` 已由 hydration 接入消费（消解）。均可后续清理
- Open blocking issues：无
- Program Go/No-Go：**GO（2026-08-13，Program Owner=xian）** —— 人工桌面 E3 验收 PASS、
  验收人同意记录 P0S GO；P0S 止血完成，可进入 P1A（架构前置，另行独立 checkpoint 后推进）

## 人工验收交接（自动化 gate 完成后）

人工桌面 E3 步骤、预期与记录表见 `validation/manual-acceptance-p0s-checklist.md`（项目内资产）。
验收人 xian 执行；AI 不得替验收人勾选人工验证结果。要点：
- 使用真实 Tauri WebView + 真实隔离文件（副本放 `/Users/xian/markflow-test/p0s-acceptance-<date>/`）。
- autosave 使用产品配置（默认开启，interval=10000ms），等待至少两个 interval，**不关闭 autosave**。
- 记录 dirty / close prompt / save count / mtime / hash / length。
- 零编辑路径（LF/CRLF/CR/Mixed/BOM tail0-3）：dirty=false、save=0、bytes 不变、无关闭提示。
- 干净 Ctrl+S：不写盘、不弹「已保存」。
- 只读→可写与 A/B 切换：不标脏。
- 全新副本输入一个字符：仍 dirty/save。
- 验收记录必须明确：P0S 只修复「零编辑错误写盘」，不解决编辑后 byte-to-byte（最终在 P1B）。
