# MarkFlow 清理/重构 落地优先级

> **状态：方案已收口（归档）** — 本表已逐条标注落地状态：`✅ 已完成` 项附 PR/issue 链接，`⚠️ 部分完成` 与 `❌ 未完成` 项统一指向遗留项跟踪 issue **#337**。本表不再是待办清单。
> 归档日期：2026-10-21。归档位置：`docs/archive/cleanup-plan/`。

> 每项 = 一个 issue + 分支 + PR。优先级 P0 最高。

---

## P0 — 安全（立即）

| # | 事项 | 位置 | 状态 |
|---|------|------|------|
| 1 | 修复 `write_file_binary` 零校验任意写盘 | `commands/export.rs:616-618` | ✅ 已完成（issue #332 / PR #335，commit `c73d1f3`） |
| 2 | 统一 `download_image` 与 `download_image_to_storage` 的安全预算 | `files_image.rs:886/928` | ⚠️ 部分完成：二者已共用 `fetch_remote_image_bytes` → `MAX_IMAGE_SIZE`；但 `download_image` 仍自行 temp+rename，未走 `atomic_write_image`，且缺少 `download_image_to_storage` 具备的 storage-root 校验（`authorized_storage_root` + `ensure_safe_directory`；其 `validate_path_in_workspace` 已覆盖 workspace 边界与 symlink 检查）→ 剩余部分未完成 → #337 |
| 3 | 移除生产路径 `.lock().unwrap()` panic（poisoned mutex 恢复） | `ignore.rs:42`、`watcher.rs:209/264` | ✅ 已完成（issue #333 / PR #336，commit `0992417`；改用 `error::lock_mutex_infallible`，其余 `.lock().unwrap()` 仅存于测试） |

## P0 — 文档误导（立即，改动仅文档可在 main 但需 PR）

| # | 事项 | 位置 | 状态 |
|---|------|------|------|
| 4 | 标记/归档已放弃的 `docs/markflow-core-stages/` | `docs/markflow-core-stages/` | ✅ 已完成（issue #256 / PR #257，commits `b0efd58` + `8953508`） |
| 5 | 删除重复未归档 `openspec/changes/fix-trailing-newlines-lost/`（归档版已存在，跑 `npx openspec validate --all`） | `openspec/changes/` | ✅ 已完成（commit `b0efd58`） |

## P1 — 去重（收益高、风险低）

| # | 事项 | 位置 | 状态 |
|---|------|------|------|
| 6 | 合并 mermaid/plantuml 右键菜单族 + 删逐字重复 helper | TS（B3） | ❌ 未完成 → #337（helper 文件仍逐字相同，各 41 行；两个菜单约 165 行、约 95% 相同） |
| 7 | 抽 `blobToBase64` / `svgToPng` 公共助手 | TS（B3） | ❌ 未完成 → #337（`blobToBase64` ×4：`plantumlContextMenu.ts:107`、`imageContextMenu.ts:124`、`mermaidContextMenu.ts:107`、`exportTheme.ts:608`；`svgToPngBlob` ×2：`mermaidContextMenu.ts:81`、`plantumlContextMenu.ts:81`） |
| 8 | 统一 modal/dialog 双系统 | TS（B3） | ❌ 未完成 → #337（`ui/modal.ts` 68 行、`ui/dialog.ts` 184 行并存；`showModal` 仍被 `linkDialog.ts`、`newFileDialog.ts`、`settings.ts`、`toolbar.ts` 使用） |
| 9 | Rust 原子写 / normalize_lexical / base64 校验 / symlink 防护 / 远程抓取 / save-as 导出 去重 | Rust（C3） | ❌ 未完成 → #337（`normalize_lexical` ×2：`files.rs:512`、`files_image.rs:72`；原子 temp+rename 写 **×5**：`files.rs:131`（`atomic_write`）、`files_image.rs:263`（`atomic_write_image`）、`files_image.rs:394`（`write_manifest`，rename 于 :404）、`files_image.rs:948`（`download_image`，rename 于 :960）、`export.rs:572`（`commit_pdf_file`，rename 于 :574）——与 `analysis.md` C3 一致；base64 解码 + 20MB 校验内联 ×6：`files.rs:386/427/452/762`、`files_image.rs:502/726`；尚无 `fs/atomic.rs`、`fs/path_safety.rs`、`decode_bounded_base64`、`http::fetch_body_with_limit`；`files.rs` 中 4 个 SVG/PNG save-as 命令近乎重复（另有 `save_image_export` / `save_document_export`）） |

## P1 — 死代码清扫（风险低）

| # | 事项 | 位置 | 状态 |
|---|------|------|------|
| 10 | 前端死导出/空 hide 函数/死文件清扫（B1 全表） | `src/` | ⚠️ 部分完成：#300 / PR #303（commit `b440307`）已清理 `getTheme`、`hide*ContextMenu` ×5、`isDocumentOverComplexityLimit`、`isMermaidTheme`、`generateImageName`。**盘点校正**：`analysis.md` B1 表中的 `disableVimMode`（`lib/vim.ts`）与 `useInputDelay`（`components/ui/inputDelay.ts`）两个「死文件」在仓库历史中从未存在（`git log --all` 无任何记录，只出现在盘点文档自身），`b440307` 并未删除它们——该两行盘点不成立，不应计入已完成项。仍存在：`fileExists` / `takeCliFile` / `cleanupExpiredPendingImages` / `clearSettingsCache`（`lib/storage.ts:245/249/234/97`）、`getStoragePath`（`imageUtils.ts:103`）、`compareEntries`（`fileTree.state.ts:25`）、`hasLanguageLoader`（`codemirror-languages.ts:53`）、`TaskScheduler` class（`taskScheduler.ts:12`）、`renderMenu`（`components/menu.ts:64`）、`classifyError`（`lib/error.ts:46`）→ 剩余部分未完成 → #337 |
| 11 | 后端死代码清扫（C1 全表，含 settings 遗留字段、`_state` 参数、死错误变体） | `src-tauri/src/` | ⚠️ 部分完成：`b440307` 已清理 `AppError::lock_poisoned` / `watcher_start_failed`、过期 `allow(dead_code)` 与 logger 死语句。仍存在：`consume_close_permission` / `cleanup_close_permission`（`#[allow(dead_code)]`，`state.rs:66-79`）、`FileEntry.children`（`commands/files.rs:22`）、`authorized_storage_root(_state)`（`files_image.rs:132`）、`resolve_path(_state)`（`files.rs:112`）、`live_preview`（`config/settings.rs:16`）→ 剩余部分未完成 → #337 |

## P2 — 超行文件拆分（先拆最大/最独立的）

| # | 文件 | 目标模块 | 状态 |
|---|------|---------|------|
| 12 | `commands/files_image.rs` 1152→ | `mod/storage|pending|remote.rs` | ❌ 未完成 → #337（现状 1266 行） |
| 13 | `commands/files.rs` 879→ | `path|io|tree|crud|export_dialog.rs` | ❌ 未完成 → #337（现状 1003 行） |
| 14 | `commands/export.rs` 785→ | `mod.rs` + `pdf_macos.rs` | ❌ 未完成 → #337（现状 779 行） |
| 15 | `http.rs` 672→ | `url|dns|redirect|magic|redact.rs` | ❌ 未完成 → #337（现状 672 行） |
| 16 | `components/fileTree.core.ts` 770→ | aria/drag/tree-mutation 拆 | ❌ 未完成 → #337（现状 782 行） |
| 17 | `lib/exportTheme.ts` 624→ / `lib/imageUtils.ts` 536→ / `lib/docxExport.ts` 480→ / `lib/editor.extensions.ts` 460→ / `components/settings.ts` 537→ / `components/toolbar.ts` 405→ | 按 B2 表 | ❌ 未完成 → #337（现状 624 / 527 / 480 / 797 / 542 / 413 行） |

## P2 — 循环依赖 / 分层（改动面大，先 explore 再动）

| # | 事项 | 位置 | 状态 |
|---|------|------|------|
| 18 | 破 `sidebar.fileops ↔ sidebar.conflict` 循环 | TS（B4/D1） | ❌ 未完成 → #337（`sidebar.fileops.ts:12` import `./sidebar.conflict`，`sidebar.conflict.ts:8` import `./sidebar.fileops`） |
| 19 | `lib/` 不 import `components/`，回调注入 | TS（B4/D3） | ❌ 未完成 → #337（仍有 12 处 import（10 个文件，`editor.ts:1`/`:3` 与 `editor.extensions.ts:17`/`:18` 各为两条）：`editor.extensions.ts:17-18`、`editor.ts:1,3`、`editor.table.ts:3`、`editor.table-handles.ts:10`、`editor.complexity.ts:5`、`editor.image.bubble.ts:7`、`docxExport.ts:2`、`pdfExport.ts:4`、`documentExport.ts:1`、`editor.init.ts:31`） |
| 20 | `fileTree.core` 反向依赖 / barrel 绕过、active-path 单真相、`editor.ts` 拆 api/bootstrap | TS（B4/D2, D7） | ❌ 未完成 → #337 |

## P3 — 低优先 / 记录

| # | 事项 | 状态 |
|---|------|------|
| 21 | 更新/归档 `docs/bundle-baseline.md`、`docs/file-tree-performance.md`；`bundle-report.html` 出 git | ⚠️ 部分完成：`bundle-report.html` 已自 `b440307` 起 untracked + gitignored（`.gitignore:5`）；`bundle-baseline.md` 已加历史基线横幅并标注为已过期（本次收尾）；`file-tree-performance.md` 尚未刷新 → 剩余部分未完成 → #337 |
| 22 | 清理 `docs/triage/test-issues.md` 未决项（转 issue 或勾掉） | ❌ 未完成 → #337（仍有 4 条未勾选项，见该文件第 15/19/20/21 行；文件自 2026-07-19 未更新） |
| 23 | 收敛未跟踪 roadmap 内存文件 → `docs/next-phase-roadmap.md` 或 openspec | ⚠️ 部分完成：`.claude/memory/` 现有 **17** 个文件，已全部纳入版本控制（其中 6 个由 `3709be7` 首次入库：5 个 `roadmap-*.md` + `source-mode-line-wrapping.md`，其余由更早/更晚的提交入库）。但 **5 个 `roadmap-*.md`** 仍与 `docs/next-phase-roadmap.md` 并存，未收敛 → 剩余部分未完成 → #337 |
| 24 | `AppState`/`Settings` 字段分组、`open_file_in_new_window` 抽几何函数、async 不阻塞（`blocking_save_file`） | ❌ 未完成 → #337 |
| 25 | 错误约定统一（`AppError` 迁移） | ⚠️ 部分完成：`AppError` / `AppErrorCode` 已存在并用于 `commands/settings.rs`；仍有 **43** 个 `#[tauri::command]`（共 53 个）返回 `Result<_, String>`（`files.rs` 21、`files_image.rs` 12、`export.rs` 4、`lib.rs` 3、`files_meta.rs` 1、`files_pagination.rs` 1、`logger.rs` 1）；若按函数计（含私有 helper，排除测试）为 97 个（`files_image.rs` 36、`files.rs` 29、`export.rs` 13、`http.rs` 6、`files_pagination.rs` 3、`lib.rs` 3、`logger.rs` 3、`files_meta.rs` 2、`fs/ignore.rs` 1、`fs/watcher.rs` 1） → 剩余部分未完成 → #337 |

---

## 建议顺序

```
P0(1-5) → P1 去重(6-9) → P1 死代码(10-11) → P2 文件拆分(12-17)
       → P2 分层(18-20) → P3(21-25)
```

先做 P0 安全与文档误导（低成本、杜绝误导/隐患），再做去重与死代码（低风险高收益），最后做超行与分层（需要 explore 的放后面）。

## 验收门

每项闭合必须：
1. `npx tsc --noEmit`（TS 改动）
2. `npm test`（vitest）
3. Rust 改动跑 `cargo check` / `cargo test`
4. 涉及导出/API 变动确认无遗留 import 调用
5. PR 合并前按 `AGENTS.md` 派独立 agent 复核
