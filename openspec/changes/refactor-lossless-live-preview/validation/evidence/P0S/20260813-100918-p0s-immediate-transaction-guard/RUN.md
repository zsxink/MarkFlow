# Validation Run Record — P0S Immediate Transaction Guard Corrective

状态：**NO-GO**。C01–C12、C14 通过，但 C12 只是 `autosave=false` 的真实 WebKit smoke；C13 独立 Reviewer 发现一个 P0 跨文档保存污染、一个 P1 保存互斥缺口和专用 desktop lifecycle 缺失。不得完成 1S.10，不得进入 P1A。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P0S corrective（立即 Save/切换/关闭数据安全） |
| Run ID | `20260813-100918-p0s-immediate-transaction-guard` |
| Date/time | 2026-08-13 10:09:18 +0800 |
| Agent/operator | Codex（纠偏实现与 AI gate） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Corrective start HEAD | `98847901b8a0ea871f05bad09c7c6faa3e7bf82e` |
| Candidate identity | start HEAD + 本目录 `artifact-manifest.sha256` 所列工作树文件；最终 commit PENDING |
| Feature flags | legacy ProseMirror；autosave=true / interval=10000ms |
| Environment | `./ENVIRONMENT.md`（SHA-256 `363e7ee63db756e3c71843ad60d0521c976ea25177d71d69f4d6b4e96dbaa89d`） |

## 关联历史 run（不可变）

- 首轮 P0S：`../20260813-031727-p0s-legacy-no-edit-guard/`。
- 独立复核发现首轮 gate 漏测 `<400ms` 事务窗口，故历史 GO 保留但被本 corrective gate supersede。
- P0 failing/corrective evidence 保持在归档 child 中，未修改。

## 根因与修复

1. `editor.init.ts` 在 `onUpdate` 后延迟 400ms 才 bump revision；立即 Cmd+S 会 `skipped`，立即 A→B/close 会当作 clean，pending callback 还可能在 B 上执行。
2. `confirmDocumentTransition` 对字符串 `SaveResult` 使用 truthy 判断，`skipped`/`failed` 也会允许切换。
3. 修复将 revision/dirty 移到同步 `onTransaction`；programmatic origin 写入同一 transaction meta；未知 doc-changing transaction fail-safe 为 user；debounce 只做 UI refresh。
4. close 读取 revision 真相；文档 transition 只接受 `saved`；新增 in-flight save revision 测试。

## Commands

| ID | Command | Result |
| --- | --- | --- |
| C01 | `npx vitest run src/lib/editor.state.test.ts src/components/sidebar.fileops.test.ts src/main.autosave.test.ts src/main.lifecycle.guard.test.ts` | PASS，4 files / 72 tests |
| C02 | `npx tsc --noEmit` | PASS，0 errors |
| C03 | `npm test` | PASS，32 files / 373 tests |
| C04 | `npm run test:characterization` | PASS，9/9；L1 serializer 违约仍被捕获 |
| C05 | `npm run test:byte-contract` | PASS，L0 24/24 + negative 23/23；L1 95/95 + negative 93/93 |
| C06 | `cargo test --manifest-path src-tauri/Cargo.toml` | PASS，126/126 |
| C07 | `npm run build` | PASS，Vite production build 完成；仅既有 chunk warnings |
| C08 | `npx openspec validate refactor-lossless-live-preview --strict` | PASS |
| C09 | `npx openspec validate --all` | PASS，61/61 |
| C10 | `bash scripts/check-archive-synced.sh` | PASS |
| C11 | `git diff --check` | PASS |
| C12 | `npm run test:e2e` | PASS，WebKit 605.1.15，1 spec / 5 tests；`autosave=false`，仅 UI smoke，见 `gate_e2e.log` |
| C13 | independent Reviewer desktop lifecycle | **FAIL / NO-GO**；标准 smoke 独立复跑 PASS，但专用 P0S lifecycle 缺失，并发现 in-flight A→B 数据丢失竞态与 save-lock await gap，见 `REVIEW.md` |
| C14 | xian manual immediate Save/A→B/close | PASS（2026-08-13；验收人于当前对话确认三项均已执行） |

## 自动化新增覆盖

- WYSIWYG doc-changing transaction 后同步 `revision=1` / `dirty=true`，不等待 timer 即保存成功。
- 编辑 A 后立即点击 B 并取消，active path 仍为 A、无写盘。
- close handler 即使 UI dirty 尚未刷新，只要 revision dirty 就必须显示未保存流程。
- 同一文档写盘 in-flight 时第二次编辑使 revision 1→2；旧保存完成仍 dirty；第二次保存才 clean。尚未覆盖保存期间 discard-switch 到另一文档。
- document transition：`saved=true`；`skipped=false`；`failed=false`。
- hydration/reload/mode/asset-resolution transaction 明确标记为 programmatic；未知 doc-changing transaction 保守判 user。

## 当前结论

- Product corrective implementation：完成。
- AI automated gate：C01–C12 PASS；C12 是 `autosave=false` 的真实 WebKit smoke，不能代替专用 lifecycle。
- 独立 Reviewer：**NO-GO**。P0：A in-flight save completion 可把 B 标为 clean/写入 A 状态；P1：保存锁在首次 await 后才占用；P1：专用 desktop lifecycle 缺失。
- 人工验收：PASS；xian 已完成 `validation/manual-acceptance-p0s-checklist.md` Section 6 的立即 Cmd+S、A→B、close。
- Open issues：`ISSUE-001`、`ISSUE-002`、`ISSUE-003`。
- Program decision：**NO-GO → P1A**；修复后必须建立新 run-id、运行专用 desktop suite，并由新的独立 Reviewer 复核。
