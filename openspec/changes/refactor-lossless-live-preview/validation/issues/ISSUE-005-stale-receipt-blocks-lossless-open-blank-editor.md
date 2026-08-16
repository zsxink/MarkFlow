# Validation Issue

状态：OPEN（修复已应用但未验证——待人工复测）

| 字段 | 值 |
| --- | --- |
| Issue ID | ISSUE-005 |
| Severity | Functional（阻塞 P1B 人工验收；无数据丢失） |
| Phase | P1B |
| First run ID | `20260816-p1b-human-acceptance-uncommitted-e4981e3` |
| Commit/flags | 工作树未提交 corrective + `losslessCoreSession`（localStorage 钩子） |
| Environment | macOS 26.5.2 / tauri dev |
| Owner | xian（人工验收发现） |

## Expected

flag on 打开 fixture 后能看到内容（Source 源码视图），工具栏/模式指示器与实际视图一致；旧 E2E 残留 receipt 不应阻塞正常打开。

## Actual

flag on 打开任意文件时**编辑器区域完全空白**：WYSIWYG 被隐藏、Source 区域空无一物。

## Minimal reproduction

1. `lossless-receipts/` 存在 2026-08-14 旧 schema 的 receipt（无 `sessionId/documentId/bindingGeneration/revision/canonicalTargetPath/newFileIdentity/recoveryPath` 字段）。
2. flag on → 打开 fixture。
3. `open_lossless_document` 被 `ensure_target_reconciled` 以 `save-outcome-unknown` 拒绝（`receipt_store_has_corruption()` = true）。
4. `openLosslessDocument` catch 后不恢复视图 → 回退 legacy 时 WYSIWYG 仍 hidden、source wrapper 无 CM → 空白。

## Byte/file impact

无。未发生写盘，文件字节未被修改（人工验收的 hash 基线未变）。

## Evidence

- 每次启动日志：`ERROR backend.lossless: Unreadable lossless save receipt found on startup — Host save gate active`（`lib.rs:430`）。
- 8/14 receipt 内容（`op-44488.json` 等 18 个，指向已删除的 `/var/folders/.../T/markflow_dispatch_*` 临时目录）。
- `read_receipt`（`guarded_write.rs:744`）对旧 schema 缺失字段 → serde 解析失败 → `receipt_store_has_corruption()` true。
- `open_lossless_document` 首行 `ensure_target_reconciled`（`mod.rs:150`）在 corruption 时对任意路径返回 Err。
- `showSourceForLossless` 先隐藏 WYSIWYG，失败路径无视图回滚（`integration.ts`）。

## Root cause

1. **残留数据**：8/14 P1B 桌面 E2E 的旧 schema receipt 从未清理（其目标临时目录已删），每次启动触发 corruption gate。
2. **视图回滚缺失**：`openLosslessDocument` 打开失败时没有恢复 WYSIWYG 可见性与模式，legacy 回退后用户看到空白。
3. **模式 UI 不同步**：`setMode('source')` 只改 store，工具栏按钮与 `#mode-indicator` 不跟随 lossless 打开/失败回滚而更新；`btn-wysiwyg` 点击 handler 在守卫拦截后仍翻转按钮/指示器。

## Fix

- **环境**：旧 receipt 移至 `~/Library/Application Support/MarkFlow/lossless-receipts-stale-20260816/`（备份，可还原）。
- **代码**（工作树未提交）：
  - `integration.ts`：新增 `syncModeUI`/`restoreWysiwygView`；`showSourceForLossless` 同步工具栏+指示器；打开失败 catch 时恢复 WYSIWYG 视图与模式。
  - `toolbar.ts`：`btn-wysiwyg` handler 在 lossless binding 存在时只弹 toast，不再翻转按钮/指示器。

## Verification

- `npx tsc --noEmit` PASS；`npm test -- --run src/lib/lossless` 27/27 PASS。
- 待人工复测：flag on 打开 fixture 应显示 Source 内容；打开失败回退应显示 legacy WYSIWYG 内容；模式指示器与实际视图一致。

## Closure

- Fix commit: 未提交（工作树）
- Passing run: 待人工复测 `20260816-p1b-human-acceptance-uncommitted-e4981e3`
- Reviewer: NOT RECORDED
- Closed date: NOT RECORDED
