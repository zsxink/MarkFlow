# P0S 验证记录：Legacy 零编辑写盘安全止血

总体状态：**P0S GO（PASS）**。候选 `d74a79d4ce0205f97fc94080966dc9a3af62ddf8` 的
final evidence run [`20260813-1715-p0s-final-d74a79d`](../evidence/P0S/20260813-1715-p0s-final-d74a79d/RUN.md)
manifest 16 项 0 mismatch，独立 Reviewer final gate **PASS**
（`…/20260813-1715-p0s-final-d74a79d/REVIEW.md`），ISSUE-001/002/003 closure 完整，
xian 人工验收适用候选确认，Program Owner 批准 P0S GO → **允许进入 P1A**。ISSUE-004 已关闭。

历史治理说明：上一轮 `20260813-170525` NO-GO 指出的「final 证据链不可审计」已由本 final run
修复（新建独立不可变 run + manifest 0 mismatch + ISSUE closure 补全 + 状态一致）。
历史 `20260813-100918-p0s-immediate-transaction-guard` 保留原样（顶部 NO-GO / candidate
`9884790`，manifest 未重算）。

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
| `test/issue-255-lossless-byte-contract` | 9884790（纠偏 start HEAD；实现工作树，详见新 RUN manifest） | legacy + autosave=true / interval=10000 | `20260813-100918-p0s-immediate-transaction-guard` |

## 纠偏复核与修复（2026-08-13）

独立 Reviewer 对首轮 P0S 给出 NO-GO，核心复现为：WYSIWYG 输入后 `<400ms` 立即 Cmd+S、A→B 或关闭时，`onUpdate` 的 `dirty-check` 尚未执行，revision/dirty 仍为 clean；保存会 `skipped`，切换/关闭会无提示继续，延迟任务还可能污染下一个文档。另发现 `SaveResult` 字符串的 truthy 判断会把 `skipped`/`failed` 当成保存成功。

纠偏实现：

- `onTransaction` 在 ProseMirror dispatch 同一调用栈内分类 doc-changing transaction，并同步 bump revision/dirty；
- hydration、reload、mode sync 与 image asset-resolution 在同一 transaction 上携带 origin meta；未知 doc-changing transaction 按用户编辑保守处理；
- debounce 只保留 `editor:update` 等非权威 UI 刷新，旧 `dirty-check` 被取消；
- close 使用 revision 真相；A→B 选择保存时仅 `saved` 允许继续；
- 新回归覆盖：立即保存、立即 A→B、立即 close gate、保存过程中继续输入、`saved/skipped/failed` 三态与跨文档隔离。

AI gate：`npm test` 32 files / 373 tests、targeted 72/72、characterization 9/9、byte contract、TypeScript、Rust 126/126 均 PASS；标准 `npm run test:e2e` 在真实 WebKit 605.1.15 上 5/5 PASS。该 smoke 使用 `autosave=false`，只能证明基础 UI，不满足专用 P0S lifecycle。编辑后 L1 serializer byte loss 仍保持 characterization，不在 P0S 宣称修复。

人工纠偏验收：xian 于 2026-08-13 确认已完成并通过输入后不等待的三项操作：立即 Cmd+S、立即 A→B（取消后仍停留 A 且内容保留）、立即关闭（取消后窗口与内容保留）。记录见 `validation/manual-acceptance-p0s-checklist.md` Section 6。该结果有效，但不覆盖 Reviewer 新发现的“保存已 in-flight 后 discard-switch B”竞态。

### 二次纠偏（2026-08-13）— 修复 ISSUE-001/002/003

上一轮 Reviewer 的 NO-GO 三个问题在本轮修复：

- **ISSUE-001（P0）in-flight 保存污染**：`saveActiveDocument` 保存启动捕获 `documentGeneration`（`getDocumentGeneration()`），异步完成后 `setLastReadStats`/`markDocumentPersisted`/`setMarkdown(prepared)` 全部带 generation 守卫；不匹配时保留新文档状态，仅记 debug 日志。`resetDocumentRevision()` 每次 hydration/reload bump generation，打开 B 必然 bump。补单元测试精确命中竞态。
- **ISSUE-002（P1）保存锁 await gap**：`savingInProgress = true` 移到任何 await 之前，整个函数体 `try/finally`，所有 return 路径均释放锁。顺带修复 `confirmDocumentTransition` 的 `saved === 'saved'`（原来 `skipped`/`failed` 字符串 truthy 会放行切换）。
- **ISSUE-003（P1）专用 desktop lifecycle**：新增 `e2e/specs/p0s/` suite（`npm run test:e2e:p0s`，autosave=true interval=2000ms，预置 byte-contract fixtures），4 个测试：零编辑双 tick 字节不变、立即 Cmd+S 保存 X、立即 A→B discard 不污染、干净 Cmd+S 不写盘。e2e-only（`import.meta.env.MODE === 'e2e'`）暴露 `window.__markflowEditor`/`__markflowStore` 供测试 dispatch 真实 ProseMirror transaction 与断言 active/dirty。

修复后 gate：`npm test` 375/375、fileops 15/15、characterization 9/9、byte-contract、tsc、build、cargo 全过；`npm run test:e2e:p0s` 4/4（真实 WebKit 605.1.15）；标准 `npm run test:e2e` smoke 5/5 未破坏。

独立复核：fresh-context Reviewer **PASS**（Addendum 见 `evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/REVIEW.md`）。P0/P1 findings 无；P2 × 1（`saveActiveDocumentAsNewFile` 另存为路径缺 generation 守卫，既有缺口，非本次范围）；P3 × 3（测试命名/覆盖度细节）。红线全过。

### 二次人工确认（2026-08-13）— 完成

xian 于桌面 E3 二次人工确认 `p0s-reverify-20260813/` 隔离副本：

- **立即 A→B（不保存 → A 不写盘）**：选「不保存」后切到 B，诊断日志 `result=discard`、零 `Saved active`；A 文件 hash/length/mtime 与基线一致，**未被写盘**。切回 A 重新加载磁盘原始内容（「不保存」丢弃未保存编辑为预期语义，非数据丢失）。
- **立即 Cmd+S**：输入字符后不等待立即 `Cmd+S`，`Saved active document`（`interactive:true`），文件含输入字符（如 `BodyX paragraph`），保存成功未 skipped。

Program Owner（xian）：**P0S 恢复 GO** → 允许进入 P1A。
> ⚠️ 本条为 ISSUE-004 之前的二次人工确认记录，已被 evidence 治理（final run +
> final gate PASS + Program Owner 最终批准）supersede；当前权威状态见本文件顶部「P0S GO」。

## AI Coding 验证（首轮历史 run）

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

## 人工验证记录（首轮历史）

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

## Reviewer 与决定（首轮历史；已被 corrective gate supersede）

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
- Corrective Reviewer：**NO-GO**，报告见 `evidence/P0S/20260813-100918-p0s-immediate-transaction-guard/REVIEW.md`
- Open blocking issues：`ISSUE-001` in-flight 跨文档污染（P0）、`ISSUE-002` save-lock await gap（P1）、`ISSUE-003` 专用 desktop lifecycle 缺失（P1）
- Program Go/No-Go：**NO-GO → P1A**；首轮 GO 保留为历史结论，不再代表当前候选。1S.10 保持未完成

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
- 纠偏候选还必须执行清单 Section 6：输入后不等待，立即 Cmd+S、A→B、close。
- 验收记录必须明确：P0S 只修复「零编辑错误写盘」，不解决编辑后 byte-to-byte（最终在 P1B）。
