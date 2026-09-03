# MarkFlow 清理/重构 落地优先级

> 每项 = 一个 issue + 分支 + PR。优先级 P0 最高。

---

## P0 — 安全（立即）

| # | 事项 | 位置 |
|---|------|------|
| 1 | 修复 `write_file_binary` 零校验任意写盘 | `commands/export.rs:616-618` |
| 2 | 统一 `download_image` 与 `download_image_to_storage` 的安全预算 | `files_image.rs:898/855` |
| 3 | 移除生产路径 `.lock().unwrap()` panic（poisoned mutex 恢复） | `ignore.rs:42`、`watcher.rs:209/264` |

## P0 — 文档误导（立即，改动仅文档可在 main 但需 PR）

| # | 事项 | 位置 |
|---|------|------|
| 4 | 标记/归档已放弃的 `docs/markflow-core-stages/` | `docs/markflow-core-stages/` |
| 5 | 删除重复未归档 `openspec/changes/fix-trailing-newlines-lost/`（归档版已存在，跑 `npx openspec validate --all`） | `openspec/changes/` |

## P1 — 去重（收益高、风险低）

| # | 事项 | 位置 |
|---|------|------|
| 6 | 合并 mermaid/plantuml 右键菜单族 + 删逐字重复 helper | TS（B3） |
| 7 | 抽 `blobToBase64` / `svgToPng` 公共助手 | TS（B3） |
| 8 | 统一 modal/dialog 双系统 | TS（B3） |
| 9 | Rust 原子写 / normalize_lexical / base64 校验 / symlink 防护 / 远程抓取 / save-as 导出 去重 | Rust（C3） |

## P1 — 死代码清扫（风险低）

| # | 事项 | 位置 |
|---|------|------|
| 10 | 前端死导出/空 hide 函数/死文件清扫（B1 全表） | `src/` |
| 11 | 后端死代码清扫（C1 全表，含 settings 遗留字段、`_state` 参数、死错误变体） | `src-tauri/src/` |

## P2 — 超行文件拆分（先拆最大/最独立的）

| # | 文件 | 目标模块 |
|---|------|---------|
| 12 | `commands/files_image.rs` 1152→ | `mod/storage|pending|remote.rs` |
| 13 | `commands/files.rs` 879→ | `path|io|tree|crud|export_dialog.rs` |
| 14 | `commands/export.rs` 785→ | `mod.rs` + `pdf_macos.rs` |
| 15 | `http.rs` 672→ | `url|dns|redirect|magic|redact.rs` |
| 16 | `components/fileTree.core.ts` 770→ | aria/drag/tree-mutation 拆 |
| 17 | `lib/exportTheme.ts` 624→ / `lib/imageUtils.ts` 536→ / `lib/docxExport.ts` 480→ / `lib/editor.extensions.ts` 460→ / `components/settings.ts` 537→ / `components/toolbar.ts` 405→ | 按 B2 表 |

## P2 — 循环依赖 / 分层（改动面大，先 explore 再动）

| # | 事项 | 位置 |
|---|------|------|
| 18 | 破 `sidebar.fileops ↔ sidebar.conflict` 循环 | TS（B4/D1） |
| 19 | `lib/` 不 import `components/`，回调注入 | TS（B4/D3） |
| 20 | `fileTree.core` 反向依赖 / barrel 绕过、active-path 单真相、`editor.ts` 拆 api/bootstrap | TS（B4/D2, D7） |

## P3 — 低优先 / 记录

| # | 事项 |
|---|------|
| 21 | 更新/归档 `docs/bundle-baseline.md`、`docs/file-tree-performance.md`；`bundle-report.html` 出 git |
| 22 | 清理 `docs/triage/test-issues.md` 未决项（转 issue 或勾掉） |
| 23 | 收敛未跟踪 roadmap 内存文件 → `docs/next-phase-roadmap.md` 或 openspec |
| 24 | `AppState`/`Settings` 字段分组、`open_file_in_new_window` 抽几何函数、async 不阻塞（`blocking_save_file`） |
| 25 | 错误约定统一（`AppError` 迁移） |

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
