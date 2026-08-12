# Validation Run Record — P0 corrective（零编辑 lifecycle characterization）

状态：CORRECTIVE AI GATE PASS（仅覆盖新增 corrective scope；不构成完整 P0 Go）

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P0 corrective（人工发现未覆盖的零编辑写盘路径） |
| Run ID | `20260813-005131-p0-corrective-zeroedit-lifecycle` |
| Date/time | 2026-08-13 00:51:31 +0800 |
| Agent/operator | Claude Code（AI 实现 agent） |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract` |
| Commit SHA | `dd5969b`（evidence 提交前基线；evidence 提交后见 git log） |
| Dirty status | evidence 提交前：P0 corrective scope 工作树改动（见 ENVIRONMENT.md） |
| Feature flags | 无 lossless flags；legacy ProseMirror 默认路径 |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `04342195f6376786968121c56931ade99b539959bb617c17fe579ad8422a9705` |

## 关联历史 run（不可变）

- 历史 AI/Reviewer run：`20260812-192707-p0-baseline`（`validation/evidence/P0/20260812-192707-p0-baseline/`）
  —— serializer/L0/L1/dispatcher 证据继续有效，**未修改**。本 corrective run 补充其遗漏的
  “零编辑打开 → dirty → autosave → 写盘”生命周期路径。
- 人工验收记录：`openspec/changes/p0-lossless-byte-contract/docs/manual-acceptance-checklist.md`
  （验收人 xian，2026-08-12；副本在 `/Users/xian/markflow-test/manual-acceptance-20260812/`）。

## 根因（人工发现 → 机器复现）

人工实测：仅打开文件、零编辑，应用即 dirty=true，autosave（默认开启，~10s）把
serializer 输出写回原文件。根因链：

`openFileInEditor → setMarkdown()/hydration → markDocumentPersisted() 拿 PM
serializer 输出回比（段落内软换行被序列化为空格 → dirty=true）→ setReadOnly(false)
的 setEditable(true) 发送 update（dirty-check 调度器确认）→ autosave tick →
saveActiveDocument() → write_file 改写原文件`。

## Scope

- 新增：`tests/byte-contract/legacy-open-autosave.characterization.test.ts`
  （真实 legacy 生命周期 characterization）
- 新增：`openspec/changes/p0-lossless-byte-contract/docs/lifecycle-open-autosave-characterization.md`
- 更新：`docs/pm-tail-newline-characterization.md`（链接 corrective scope）、`tasks.md`（4.4–4.6）
- Excluded modules：产品编辑器代码（P0 不改默认行为）、`/Users/xian/markflow-test`（未读取未写入）

## Commands

| ID | Command | Exit | Status | 输出 |
| --- | --- | --- | --- | --- |
| C01 | `npm test` | 0 | PASS（339 passed / 31 files，characterization 未进入默认 suite） | /tmp/gate2_npmtest.log |
| C02 | `npx tsc --noEmit` | 0 | PASS（0 errors） | /tmp/gate2_tsc.log |
| C03 | `npm run build` | 0 | PASS | /tmp/gate2_build.log |
| C04 | `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | PASS（126 passed） | /tmp/gate2_cargo.log |
| C05 | `npm run test:e2e`（smoke） | 0 | PASS（5 passing；autosave=false smoke，不能替代 lifecycle） | /tmp/gate2_e2e.log |
| C06 | `npm run test:byte-contract` | 0 | PASS（fixtures --verify + L0/L1 self-check） | /tmp/gate2_bytecontract.log |
| C07 | `npm run test:characterization` | 0 | PASS（9/9：4 serializer + 5 lifecycle，均捕获基线违约） | /tmp/gate2_characterization.log |
| C08 | `npx openspec validate p0-lossless-byte-contract --strict` | 0 | PASS | /tmp/gate2_child.log |
| C09 | `npx openspec validate refactor-lossless-live-preview --strict` | 0 | PASS | /tmp/gate2_umbrella.log |
| C10 | `npx openspec validate --all` | 0 | PASS | /tmp/gate2_openspec_all.log |
| C11 | `bash scripts/check-archive-synced.sh` | 0 | PASS | /tmp/gate2_archivesync.log |

## Lifecycle characterization 证据（task 4.4/4.5）

测试驱动真实 `openFileInEditor` → 真实 Tiptap `initEditor`（真实 `onUpdate` +
400ms dirty-check 调度器）→ 真实 `setReadOnly(false)`/`setEditable(true)` update →
真实 autosave coordinator `runAutoSaveTick`（生产 `setInterval(runAutoSaveTick, 10000)`
的同一 tick，驱动两个 tick）→ 真实 `saveActiveDocument` → 真实 `write_file` 到隔离
临时目录真实文件。唯一 mock 边界是 Tauri `invoke` IPC（vitest 无 Rust），其把
`read_file`/`write_file`/`get_file_stats`/`file_metadata` 路由到真实磁盘。
**autosave 未关闭（断言产品默认 `autosave=true`），保存链路未 mock。**

| fixture | 输入 len | 输入 SHA-256 | dirty(open→settle→tick1→tick2) | 关闭提示 | save count(tick1/tick2) | 保存后 SHA-256 | mtime | 失败类型 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| utf8-lf-tail2 | 68 | `bc1b50f4…a0` | true→true→false→false | “未保存的更改” | 1 / 1 | `12162470…78` | 变化 | 软换行 `\n`→` ` |
| utf8-lf-tail3 | 69 | `201dc08c…d1` | true→true→false→false | “未保存的更改” | 1 / 1 | `c6e6dacd…12` | 变化 | 软换行 `\n`→` ` |
| utf8-crlf-tail2 | 73 | `6928ce65…fb` | true→true→false→false | “未保存的更改” | 1 / 1 | `9f18b50b…a1` | 变化 | CRLF→LF（5→0）、尾 `\r\n\r\n`→`\n`（2→1）、软换行 `\n`→` ` |
| utf8-crlf-tail3 | 75 | `db562fc5…2a` | true→true→false→false | “未保存的更改” | 1 / 1 | `9f18b50b…a1`（与 tail2 相同） | 变化 | CRLF→LF（6→0）、尾 `\r\n\r\n\r\n`→`\n`（3→1）、软换行 `\n`→` ` |

- 保存后 SHA 与人工实测逐个一致（见 manual-acceptance-checklist.md）：
  `12162470…78`、`c6e6dacd…12`、`9f18b50b…a1`。
- dirty 状态：打开阶段 `markDocumentPersisted` 即发现 serializer 输出 ≠ baseline
  （软换行→空格），`dirty=true`；`setEditable(true)` update 后 400ms dirty-check
  确认（`revision` 0→1）。tick1 写盘后 `markDocumentPersisted` 把写回内容记为
  baseline，dirty=false，tick2 跳过（save count 保持 1）。
- 分项 diff（soft break / EOL / trailing）与完整 stdout 见
  `docs/lifecycle-open-autosave-characterization.md` 与 characterization stdout。

## 替代性证明（task 4.6）

L0 oracle self-check 只比较两个给定文件、从不产生 dirty/autosave/写盘；
`pm-tail-newline.characterization.test.ts` 不驱动真实 open/autosave/save 生命周期；
`autosave=false` E2E smoke 显式关闭 autosave，与失败路径相反。三者均不能替代本条
characterization（详见 `docs/lifecycle-open-autosave-characterization.md`）。

## Desktop workflows

| Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- |
| e2e smoke（autosave=false） | PASS | PASS | PASS | /tmp/gate2_e2e.log |
| 零编辑 lifecycle（autosave 默认开启） | 机器捕获违约 | 机器捕获违约 | PASS（characterization 9/9） | C07 |
| 人工桌面验证（LF/CRLF、B1-B5 正文单字符编辑、重开、ADR 审阅） | 人工执行 | — | NOT STARTED | 人工验收记录 |

## Failures and retries

| Issue | First run | Retry run | Final state |
| --- | --- | --- | --- |
| 人工发现：零编辑打开即 dirty/autosave 写盘（历史 AI gate 未覆盖） | 2026-08-12 人工验收 | 本 corrective run | 已机器捕获（characterization 5/5 + SHA 与人工一致） |

## Data and privacy

- Log redaction checked：PASS（记录仅 hash 与分项 diff/尾部 hex，未捕获正文/token）
- No user document used：PASS（fixtures 全部合成；`/Users/xian/markflow-test` 未读未写）
- No credential/token captured：PASS
- Test workspace isolated：PASS（`mkdtemp` 隔离目录 + 合成 fixtures，测试后清理）

## AI conclusion

- Corrective AI gate：PASS（C01–C11 全部 exit 0；新增 lifecycle characterization 捕获零编辑写盘违约，SHA 与人工一致）
- 历史 AI GATE PASS 不再单独视为完整 P0 AI gate（参见 umbrella `validation/phases/P0.md`）
- Go/No-Go recommendation：PENDING（需新独立 Reviewer、完整人工验收、Program Owner）
- Unrun items：Windows/Linux desktop、CJK IME、人工桌面验证 B1-B5/重开/ADR 审阅、长窗口多周期写盘（watcher/重载交互，见 characterization 文档“已知缺口”）
- Risks：
  1. 零编辑打开即写盘（本 run 已证明；P0S 止血前存在）。
  2. 保存后 SHA 与人工一致，说明复现精确；watcher/重载导致的长窗口持续写盘超出本 run。
  3. Windows/Linux guarded-write 原语 BLOCKED（无设备）。

## Independent review

- Reviewer：NOT RECORDED（task 8.3 待派）
- Review status：PENDING
- Review report：NOT RECORDED

## Human acceptance

- Human validator：xian（已执行人工验收发现零编辑路径；结论记录于 manual-acceptance-checklist.md）
- Status：CORRECTIVE RUN REQUIRED（新 corrective 范围待人工对照确认；B1-B5/重开/ADR 未完成）
- Record：`docs/manual-acceptance-checklist.md`

## Program decision

- Owner：NOT RECORDED
- Decision：NOT STARTED
- Date：NOT RECORDED
- Conditions：NOT RECORDED
