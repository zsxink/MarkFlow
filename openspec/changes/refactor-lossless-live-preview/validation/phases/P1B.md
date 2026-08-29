# P1B 验证记录：无损 Source 纵向闭环

总体状态：AI coding 与桌面 E2E 完成，三轮独立复核 GO（条件性），待 Program Owner 人工验收

正式设计：[P1B：无损 Source 纵向闭环](../../design/phases/P1B-source-vertical-slice.md)

## Candidate identity

| Branch | Commit | Flags | Run ID |
| --- | --- | --- | --- |
| `test/issue-255-lossless-byte-contract` | `06c4b0a` | `losslessCoreSession=true`（测试内显式开启，产品默认 off） | NOT RECORDED |
| `test/issue-255-lossless-byte-contract` | `a16e575`（冻结候选，含此前 corrective） | `losslessCoreSession`（localStorage 手动钩子，产品默认 off） | `20260817-053048-independent-review-a16e575`（最新独立复核） |

## AI Coding 验证

- [x] Unit/typecheck/build/Rust tests
- [x] 真实 dispatcher open/apply/save/commit/reload/close（`dispatcher_contract.rs` 10 测试，不 mock invoke）
- [x] E2E debug build、smoke、regression
- [x] 全 fixtures 未编辑 Save L0（desktop）
- [x] autosacve 编排层：lossless 零编辑两次 tick → dirty=false、save count=0（`lifecycle.test.ts`，mock IPC 路由真实 fs）
- [x] 干净 Save → skipped 不写盘（`lifecycle.test.ts`）
- [x] 正文编辑 → dirty → Save 一次写盘 → persisted 收敛（`lifecycle.test.ts`）
- [x] reload/close/A-B 切换不写盘、不串文档（`lifecycle.test.ts`）
- [x] timeout/retry/duplicate/stale ack（`sourceSyncController.test.ts` 10 测试）
- [x] resync 与 blocked recovery（`sourceSyncController.test.ts`）
- [ ] prepare 后外部替换、锁不被遵守、write/commit response 丢失、重复 saveOperationId、启动 receipt reconcile（Rust 侧部分覆盖，desktop 待补）
- [x] renderer/parser command 故障不影响 Source 编辑保存（3.10，`lifecycle.test.ts`）
- [x] lossless open/edit/save/reload/close 无 `setMarkdown/getMarkdown/normalizeImageMarkdown`/PM serializer 调用（3.9.2 审计，`lifecycle.test.ts`）
- [x] 脱敏 E2E artifacts 保存

## 人工验证记录

- 验收人/环境：xian（Program Owner，只验收最终产品效果）/ macOS 26.5.2；基线已预录
- 验收 run：`evidence/P1B/20260816-p1b-human-acceptance-uncommitted-e4981e3/`（HUMAN-ACCEPTANCE.md + verify-fixtures.sh）
- 执行方式：2026-08-18 由 Program Owner 代理（fresh context 子代理）经 e2e WebDriver 驱动真实 Tauri WebKit 应用补验（`e2e/specs/lossless/p2-acceptance.e2e.mjs`）
- 状态：COMPLETED（8 项 PASS + 2 项「依赖自动化证据 + Reviewer」）
- [x] LF/CRLF/BOM/尾部 2/3 line-break-boundary fixtures（hash/mtime 不变）
- [x] 不编辑 dirty/mtime
- [x] 不编辑等待两个 autosave tick + 干净 Ctrl+S（hash/length/mtime/关闭提示均无写盘）
- [x] 中文+emoji 正文编辑立即保存并重开 hash（savedHash === reopenedHash）
- [x] autosave 工作流（编辑→自动落盘→dirty 清除）
- [x] 外部修改 conflict（toast「文件已被外部修改…未覆盖」，不静默覆盖）
- [~] blocked pipeline 阻止 Save 且恢复文本可复制 → 依赖自动化证据 + Reviewer（产品 UI 无触发入口；`sourceSyncController.test.ts` 覆盖）
- [x] A/B 切换无串文档（B 干净、A 磁盘不变）
- [~] flag off legacy 可用 → 依赖自动化证据（P0S suite 4/4 + smoke suite 独立验证）
- [x] 错误提示清楚且无正文泄漏（toast 不含正文）

人工结论：ACCEPTED（8 PASS + 2 依赖自动化证据，由 Program Owner 代理执行补验，2026-08-18）

## Reviewer 与决定

- [x] 保存路径无 serializer/normalize/PM source
- [x] autosave coordinator 与最终 write 入口均有 clean-session guard
- [x] dirty 为 revision/pending（并纳入 in-flight，修复 reviewer P1）
- [x] async identity 与 lifecycle cleanup
- [x] 按操作 identity matrix；保存变更 file identity 不误拒绝 N+1 patch
- [x] guarded-write 替换点复核与 outcome reconcile
- [x] 真实 dispatcher 非 mock-only
- Reviewer：AI 独立 Reviewer（fresh context，目标 `fb8729f`）
  - 首轮：P0 0 / P1 1 / P2 5；P1 in-flight dirty 空洞 → NO-GO（条件性）
  - 复评（`21aa39a`+`e23314d`）：P1/P2 修复逐项 PASS；**从 NO-GO（条件性）转为
    GO（待 Program Owner 人工验收）**；无剩余 P0/P1
- Reviewer：AI 独立 Reviewer #2（fresh context，2026-08-15，不依赖首轮结论）
  - 9 项复核全 PASS：保存路径无 serializer/PM source；owner 隔离与 flag 默认 off；
    dirty 含 in-flight；guarded write + receipt 状态机；reconcile 完整性；
    identity matrix + P2 冻结；真实 dispatcher；P2 修复项；evidence 真实性
  - 结论：P0 0 / P1 0 / P2 2（文档）+ 1 观察项；总体 **GO（条件性）**，与首轮 Reviewer 收敛一致
  - 运行验证：vitest lossless 16 passed、tsc PASS、cargo core 93、cargo tauri 134、manifest sha256 全通过
- Reviewer：AI 独立 Reviewer #3（fresh context，2026-08-17，候选 `a16e575`）
  - 复核 `a16e575` vs `545692a`：产品 diff SHA-256 `8acf356...` 与 corrective run 记录的
    full-worktree diff 一致；两个 P1（paste EOL 边界 provenance、reload 失败存活）与两个
    P0（replacement-point TOCTOU、commit 跨 reload）均由确定性 dispatcher/生命周期测试关闭
  - 运行验证：npm test 414、tsc PASS、cargo core 93、cargo tauri 151、dispatcher_contract 22、
    byte-contract、openspec --all 61、build、四条桌面 WebKit E2E（lossless=6 smoke=5
    regression=1 p0s=4）全 PASS
  - 结论：P0 0 / P1 0 / P2 1（文档）；总体 **GO（条件性）**，剩余仅 Program Owner 人工验收
  - 证据：`evidence/P1B/20260817-053048-independent-review-a16e575/`
- Program Go/No-Go：**GO（2026-08-19，xian）**。P1B 人工验收已在 2026-08-18 补验 ACCEPTED（8 PASS + 2 依赖自动化证据，由 Program Owner 代理经 WebDriver 驱动真实桌面应用执行）；`tasks.md` 3.11 已勾选完成，记录 Slice 1B Go checkpoint。不归档 umbrella change（后续 P2-P5 继续在同一 change）。

> **历史决定（2026-08-18，已被 2026-08-19 决定取代）**：Program Owner 当时推迟 P1B 人工验收并先进入 P2。随后已补验 ACCEPTED，`tasks.md` 3.11 已勾选，权威状态以上方 2026-08-19 `GO` 为准。此历史记录仅解释时间线，不再构成阻塞条件。

## P1B 后 corrective 待办

- 观察项：启动 receipt 扫描（`src-tauri/src/lib.rs` setup）目前仅记录日志/警告，
  未自动调用 `reconcile_document_save`；前端只在自身 lost-response /
  outcome-unknown 时主动 reconcile。记录为 P1B 后 corrective（不阻塞 P1B，
  留待 P2/corrective 决定）。
