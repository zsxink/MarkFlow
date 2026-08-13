# Validation Run Record — P0S Final（Legacy 零编辑写盘安全止血，候选 d74a79d）

状态：AI GATE PASS（run `20260813-1715-p0s-final-d74a79d`）；独立 Reviewer final gate 与人工/Program Go 待执行

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P0S（Slice 0S — Legacy 零编辑写盘安全止血） |
| Run ID | `20260813-1715-p0s-final-d74a79d` |
| Date/time | 2026-08-13 17:15:00 +0800 |
| Agent/operator | Claude Code（AI 实现 agent） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| **Candidate commit** | `d74a79d4ce0205f97fc94080966dc9a3af62ddf8`（P0S 纠偏修复最终候选） |
| Dirty status | 产品文件 clean（工作树仅验证文档/evidence 改动，见 git status） |
| Feature flags | 无 lossless flags；legacy ProseMirror 默认路径；autosave 使用产品配置（`autosave=true` / `autosaveInterval=10000`） |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `e364ff920c2290c971b995063d5a266a381e818ffe856566569803551492dfb5` |

## 关联历史 run（不可变，未改写）

- P0 failing：`openspec/changes/archive/2026-08-13-p0-lossless-byte-contract/validation/evidence/P0/20260812-192707-p0-baseline/`
- P0 corrective：`…/P0/20260813-005131-p0-corrective-zeroedit-lifecycle/`
- P0S 首轮：`20260813-031727-p0s-legacy-no-edit-guard/`（AI GATE + 首轮 Reviewer PASS）
- P0S corrective NO-GO：`20260813-100918-p0s-immediate-transaction-guard/`
  —— 该目录保持历史原样（顶部 NO-GO / candidate `9884790`），本次不重算其 manifest。
- 独立 gate review（evidence 治理 NO-GO）：`20260813-170525-independent-review-d74a79d/`
  —— Reviewer 指出 final 证据不是新封存 run、manifest mismatch、ISSUE closure 缺失、状态矛盾。
- **本 run**：依据该 review 的 remediation 要求，以候选 `d74a79d` 新建的 final run。

## Scope

- 产品实现（归 umbrella change `refactor-lossless-live-preview`）：
  - `src/lib/editor.state.ts`：`TransactionOrigin`、`userRevision`/`persistedRevision`、
    `documentGeneration`（文档身份令牌，hydration/reload bump）、
    `markProgrammaticContent`/`resetDocumentRevision`/`markDocumentPersistedRevision`/
    `hasUnpersistedUserChanges`/`getDocumentGeneration`。
  - `src/lib/editor.ts`：`setMarkdown` 重置 revision + 显式清 dirty + origin meta；
    `markDocumentPersisted` revision 驱动，移除 serializer 回比。
  - `src/lib/editor.init.ts`：`onTransaction` 同步分类 doc-changing transaction（
    `<400ms` 立即保存/切换/关闭读取同步真相）；e2e-only 暴露 `__markflowEditor`/`__markflowStore`。
  - `src/components/sidebar.fileops.ts`：`savingInProgress` 锁在任何 await 前占用 +
    `try/finally` 释放；保存启动捕获 `documentGeneration`，异步完成后
    `setLastReadStats`/`markDocumentPersisted`/`setMarkdown(prepared)` 带 generation 守卫；
    clean-session guard；`confirmDocumentTransition` 仅 `saved === 'saved'` 放行。
  - `src/components/activeDocument.ts`：`setEditable(…, emitUpdate=false)`。
  - `src/main.ts`：autosave coordinator 双检查（store dirty AND `hasUnpersistedUserChanges()`）。
- 测试：
  - 新增 `src/main.lifecycle.guard.test.ts`（零编辑 lifecycle 默认绿色回归）。
  - 新增 P0/P1 竞态单元测试（in-flight A save → B 不污染；双 Save 锁）。
  - `e2e/specs/p0s/`：P0S desktop lifecycle suite（autosave=true interval=2000ms），
    零编辑双 tick 不写盘 / 立即 Cmd+S 落盘 / 立即 A→B discard 不污染 / 干净 Cmd+S 不写盘。
- 验证文档：`validation/phases/P0S.md`、`validation/README.md`、`tasks.md`、issues。
- Excluded：`pnpm-lock.yaml`/`pnpm-workspace.yaml`（未跟踪、未触碰）；P0/P0S 历史 evidence
  目录（未修改）；P1A 及后续阶段（未开始）。

## Commands（全部 exit 0，candidate d74a79d）

| ID | Command | Exit | Status | Output path |
| --- | --- | --- | --- | --- |
| C01 | `npm test` | 0 | PASS（32 files / 375 tests） | gate_npmtest.log |
| C02 | `npx tsc --noEmit` | 0 | PASS（0 errors） | gate_tsc.log |
| C03 | `npm run build` | 0 | PASS | gate_build.log |
| C04 | `npm run test:characterization` | 0 | PASS（9/9：5 P0S 零编辑修复验证 + 4 L1 失败刻画保持红色） | gate_characterization.log |
| C05 | `npm run test:byte-contract` | 0 | PASS（fixtures + L0/L1 self-check ok） | gate_bytecontract.log |
| C06 | `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | PASS（126 passed） | gate_cargo.log |
| C07 | `npm run test:e2e:build` | 0 | PASS（e2e 模式构建） | gate_e2e_build.log |
| C08 | `npm run test:e2e:p0s` | 0 | PASS（真实 WebKit 605.1.15，4/4：autosave=true 零编辑双 tick 不写盘、立即 Cmd+S 落盘、立即 A→B discard 不污染、干净 Cmd+S 不写盘） | gate_e2e_p0s.log |
| C09 | `npm run test:e2e`（smoke） | 0 | PASS（5/5，基础 UI 未破坏） | gate_e2e_smoke.log |
| C10 | `npx openspec validate refactor-lossless-live-preview --strict` | 0 | PASS | gate_openspec_strict.log |
| C11 | `npx openspec validate --all` | 0 | PASS（61 items） | gate_openspec_all.log |
| C12 | `bash scripts/check-archive-synced.sh` | 0 | PASS | gate_archivesync.log |
| C13 | `git diff --check` | 0 | PASS | gate_diffcheck.log |

## P0S 零编辑 lifecycle 证据

`src/main.lifecycle.guard.test.ts` 驱动真实 `openFileInEditor` → 真实 Tiptap `initEditor`
（真实 `onTransaction` 同步 revision/dirty）→ 真实 `setReadOnly(false)`/`setEditable(…, emitUpdate=false)`
→ 真实 `runAutoSaveTick`（两个 tick）→ 真实 `saveActiveDocument` → 真实 `write_file` 到隔离临时目录。
唯一 mock 为 Tauri `invoke` IPC（vitest 无 Rust），路由到真实文件系统。**autosave 未关闭**。

`e2e/specs/p0s/p0s-lifecycle.e2e.mjs` 在真实 WebKit WebView 上以 autosave=true（interval=2000ms）
验证：零编辑打开 7 个 byte-contract fixtures（LF/CRLF/CR/Mixed/BOM/tail0-3）等待两个 tick 后
字节/mtime 不变；立即 Cmd+S 后磁盘含输入字符；立即 A→B discard 后 A 未被写盘；干净 Cmd+S 不写盘。

## 人工证据（复用，非本 run 自动）

- 人工验收记录：`validation/manual-acceptance-p0s-checklist.md` Section 6（立即 Cmd+S/A→B/close）+
  Section 7（二次纠偏：立即 A→B 不保存不写盘 + 立即 Cmd+S 落盘），xian / 2026-08-13。
- 注意：Reviewer 要求在新 final candidate 的人工记录上重新确认适用性；本 run 完成后由 Program Owner
  依据同一候选 `d74a79d` 的人工记录决定 GO。

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| P0S 首轮证据封存不当（final 指向 NO-GO 目录、manifest mismatch、ISSUE closure 缺失） | `20260813-100918` | **本 final run `20260813-1715`** | 新建独立不可变 run，candidate 明确为 d74a79d，manifest 待校验 |
| ISSUE-001/002/003 正文 closure 未补全 | `20260813-100918` | 本 run 后补全（见 issues/） | 逐项填 Fix/Verification/Closure，链接本 run |

## Data and privacy

- Log redaction checked：PASS（记录仅 hash/length/mtime/计数；正文内容未写入生产日志）
- No user document used：PASS（fixtures 全部合成；`/Users/xian/markflow-test` 仅人工验证副本，本 run 未读写）
- No credential/token captured：PASS
- Test workspace isolated：PASS（e2e 用隔离 `.tmp-*` 目录 + 合成 fixtures，测试后清理）

## AI conclusion

- AI gate：PASS（C01–C13 全部 exit 0；375 单测 + 9/9 characterization + 4/4 p0s desktop e2e +
  5/5 smoke + 126 Rust + 61 openspec）
- 修复摘要（d74a79d）：
  1. 同步 transaction 分类 + revision/dirty 同步更新（消解 `<400ms` 数据丢失窗口）；
  2. 保存锁任何 await 前占用（消解 save-lock await gap）；
  3. document generation 守卫（消解 in-flight 保存跨文档污染）；
  4. autosave coordinator + 最终 write 双重 clean guard；
  5. P0S desktop lifecycle e2e suite（autosave=true）。
- 待办：新 final run 的独立 Reviewer final gate + Program Owner 依人工记录决定 GO；ISSUE-004 closure。
- Risks：P0S 只修复「零编辑错误写盘」，legacy 编辑后 L1 byte fidelity 仍未解决（characterization
  保持红色，最终在 P1B）。

## Independent review

- Reviewer：独立 gate review（`20260813-170525-independent-review-d74a79d/REVIEW.md`）
- 功能复核结论：产品安全修复与本轮自动化均 PASS，未发现新 P0 行为缺陷
- evidence 治理结论：NO-GO（final 证据链不满足不可变审计协议），要求新建 final run + 补全 ISSUE closure
- **本 run 即依据该 remediation 新建的 final run**；后续独立 Reviewer final gate 记录见本目录 REVIEW.md（待派）

## Human acceptance

- Human validator：xian
- Status：ACCEPTED（Section 6 + Section 7 人工记录，2026-08-13）
- 适用性确认：待 Program Owner 以候选 `d74a79d` 确认

## Program decision

- Owner：NOT RECORDED（待 final gate + Program Owner）
- Decision：NOT STARTED
- Date：NOT RECORDED
- Conditions：ISSUE-004 关闭 + manifest 校验通过 + 新独立 Reviewer PASS + Program Owner GO
