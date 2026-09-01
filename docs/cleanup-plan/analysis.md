# MarkFlow 全量盘点：清理 + 重构清单

> 分析日期：2026-08-31，基于当前 `main`（HEAD `6bfba45`）。
> 所有 file:line 均为实测。分四块：**A 文档**、**B 前端代码**、**C 后端代码**、**D 产物/依赖**。

---

## A. 文档：过期 / 失效 / 无用

### A1. `docs/markflow-core-stages/` —— 已放弃的大重构方案（**最高优先清理**）

- 目录含 `M0`–`M8`、`product-plan.md`、`technical-plan.md`、`feature-migration-matrix.md`、`README.md` 共 15 个文件。
- `docs/next-phase-roadmap.md`（2026-08-30 定稿）明确写：
  > "markflow-core 分层（M1–M8）大重构方案，**已全部关闭并放弃**……下阶段不再以任何重构线为主线条目。"
- 但这些文档自身仍写着"状态：方案已校准，待 M0 技术基线冻结 / 待实施"（`README.md`、`product-plan.md` 头部），会被当作**正在进行的事**——误导。
- **建议**：整目录标记为「已废弃/冻结」，或移入 `docs/archive/`。若保留为历史存档，必须在每个文件头部加醒目废弃横幅。

### A2. `docs/bundle-report.html` + `docs/bundle-baseline.md` —— 过期性能基线

- 记录于 2026-07-19/20，`dist/` 基线 8.7 MB / 72 文件；实测当前 `dist/` 已 **9.2 MB**。
- `bundle-report.html` 是 `rollup-plugin-visualizer` 生成的快照（963 KB，已入库 git），并非稳定的规范文件，属**一次性产物**。
- **建议**：`bundle-report.html` 移出 git（它可再生，不入版本库）；`bundle-baseline.md` 更新为当前值，或改为"由 CI/命令在需要时重新生成"的说明文档。

### A3. `docs/file-tree-performance.md` —— 基线可能过期

- 记录了 100k 文件的验收耗时（2026 年实现后生成），属一次性验收记录。
- **建议**：标注「为历史验收记录，如需复核用 `npm run benchmark:file-tree` 重跑」，或归档。非规范文件。

### A4. `docs/superpowers/specs/` —— 早期设计文档

- 两个文件：`2026-07-05-architecture-optimization-design.md`、`2026-07-23-markflow-issue-workflow-design.md`。
- 与现在 `openspec/specs/`（唯一权威规范）重复，且描述的是早期 `superpowers` 工作流（已迁移到 OpenSpec）。
- **建议**：确认其内容已并入 openspec 后归档；否则保留但标注历史。

### A5. `docs/triage/test-issues.md` —— 遗留未关闭跟踪项

- 内有 4 条未勾选问题（"打开文档时图片后空行被去掉""不显示内容与源码""插入图片后空行""源码模式切换文件不更新"）。其中第一条即 newline-loss 类，已由 `fix-trailing-newlines` 处理过。
- **建议**：逐条验收——已修复的勾掉；确实未修复的转入 `gh issue` 跟踪。避免做成"永不关闭"的死清单。

### A6. `openspec/changes/fix-trailing-newlines-lost/` —— 重复的未归档 change

- 该目录内容与已归档的 `openspec/changes/archive/2025-07-25-fix-trailing-newlines-lost/` **逐文件相同**（已验证 spec/design 完全一致），却仍留在 `openspec/changes/`。
- `npx openspec validate --all` 可能把它当新的待评审 change。
- **建议**：直接删除 `openspec/changes/fix-trailing-newlines-lost/`（归档版本已存在，属操作残留）。

### A7. `docs/knowledge/ui-fixes.md` —— 自声明"历史排障，非规范"（保留）

- 头部已注明"记录历史排障……**不是行为规范**"，定位正确，**无需清理**，仅作知识库。

### A8. 内存文件 `.claude/memory/` —— 需整理

- 6 个**未跟踪**的 roadmap 文件（`roadmap-*.md`、`source-mode-line-wrapping.md`）+ `MEMORY.md` 已修改（未提交）。
- 这些是 2026-08-30 满清头脑风暴的记录，与 `docs/next-phase-roadmap.md`（也是未跟踪）内容重叠。
- **建议**：决策性内容收敛进 `docs/next-phase-roadmap.md` 或 openspec；临时头脑风暴草稿删除。当前未跟踪状态有丢失风险。

---

## B. 前端代码（`src/`）：清理 + 重构

### B1. 过期/无用代码（已验证无任何 import 方）

| 符号 | 位置 | 建议 |
|------|------|------|
| `getTheme` | `lib/theme.ts:12` | 删除 |
| `hideContextMenu`（空函数体） | `components/ui/contextMenu.ts:57` | 删除 + 移除调用 |
| `hideImageContextMenu`（空） | `components/imageContextMenu.ts:38` | 删除 + 移除调用 |
| `hideMermaidContextMenu`（空） | `components/mermaidContextMenu.ts:35` | 删除 + 移除调用 |
| `hidePlantumlContextMenu`（空） | `components/plantumlContextMenu.ts:35` | 删除 + 移除调用 |
| `isDocumentOverComplexityLimit`（恒 false stub） | `lib/editor.complexity.ts:74` | 删除或接真实状态 |
| `isMermaidTheme` | `lib/mermaid.ts:63` | 删除 |
| `fileExists` / `takeCliFile` / `downloadImage` / `cleanupExpiredPendingImages` / `clearSettingsCache` | `lib/storage.ts:148/220/231/235` | 5 个死导出，删除（`main.ts:68` 已直接 `invoke('take_cli_file')`） |
| `getStoragePath` / `generateImageName`（被 `generateImageFileName` 取代）/ `copyImageToStorage`(export) | `lib/imageUtils.ts:103/170/178` | 删除 / 去掉 export |
| `compareEntries`（仅本文件用） | `components/fileTree.state.ts:25` | 改私有 |
| `hasLanguageLoader` | `lib/codemirror-languages.ts:47` | 删除 |
| `TaskScheduler` class（仅 `scheduler` 单例被用） | `lib/taskScheduler.ts` | class 改私有或删 |
| `renderMenu`（`showMenu` 才是对外 API） | `components/ui/menu.ts` | 删除或并入 `showMenu` |
| `useInputDelay`（无 import） | `components/ui/inputDelay.ts` | 删除文件 + hook |
| `disableVimMode` | `lib/vim.ts` | 删除（死开关） |
| `classifyError`(export) | `lib/error.ts:46` | 去掉 export（仅内部用） |

### B2. 需重构的超行文件（> 400 行，规范目标 500–900 行）

| 文件 | 行数 | 拆分建议 |
|------|------|---------|
| `components/fileTree.core.ts` | 770 | 拆 ARIA/键盘导航、DOM 助手、树变更（upsert/remove/persist）、拖拽共享状态 |
| `lib/exportTheme.ts` | 624 | 拆 类型 / 构建(`buildExportTheme`) / CSS 生成 / DOCX 样式 / 通用 `blobToBase64` |
| `components/settings.ts` | 537 | 拆 面板分区（general/editor/export/plantuml/mermaid/hotkeys）、DOM 绑定助手、storage 水合 |
| `lib/imageUtils.ts` | 536 | 拆 网络下载路径(`downloadImageToStorage`,`fetchRemoteImageAsBase64`) → `image.network.ts` |
| `lib/docxExport.ts` | 480 | 拆 块级 walker 族（heading/paragraph/list/code/table/image） |
| `lib/editor.extensions.ts` | 460 | 一篇一个扩展：`CustomLink` / `BlockImage` / `mermaidCodeBlockExtension` |
| `components/toolbar.ts` | 405 | 拆 工具栏构建/热键 / 图片插入弹窗 / 导出菜单 |

### B3. 代码重复（最大去重收益）

| 重复 | 位置 | 建议 |
|------|------|------|
| **`blobToBase64` ×4** | `plantumlContextMenu.ts:110`、`imageContextMenu.ts:127`、`mermaidContextMenu.ts:110`、`exportTheme.ts:608` | 抽 `lib/base64.ts` |
| **SVG→PNG ×3** | `mermaidContextMenu.ts:84`、`plantumlContextMenu.ts:84`、`exportSnapshot.ts:211` | 抽 `svgToPng` 模块（同时返 blob 与 dataURL） |
| **mermaid/plantuml 右键菜单 ≈95% 相同** | `mermaidContextMenu.ts`(169) vs `plantumlContextMenu.ts`(167) | 合并为参数化 `diagramContextMenu.ts` |
| **helper 文件逐字相同** | `mermaidContextMenu.helpers.ts` vs `plantumlContextMenu.helpers.ts`（已验证 IDENTICAL） | 删 plantuml 副本，重命名幸存者 `diagramContextMenu.helpers.ts` |
| **SVG 消毒逻辑近似** | `lib/mermaid.ts:5-36` vs `lib/plantuml-lazy.ts:103-129` | 抽公共 sanitize |
| **两套 modal 系统** | `ui/modal.ts` vs `ui/dialog.ts`（重复遮罩/ESC/滚动锁） | 统一用 `showDialog` |
| **两套 DOCX 生成** | `docxExport.ts` vs `exportTheme.ts:exportThemeToDocxStyles` | 验证能否共享核心 |

### B4. 循环依赖 / 分层问题

| 问题 | 位置 | 建议 |
|------|------|------|
| **真双向循环** `sidebar.fileops ↔ sidebar.conflict` | 两个文件互 import | 抽共享操作到 `sidebar.actions.ts` |
| 循环 `fileTree.core → sidebar → fileTree(barrel)` | 多处 | `fileTree.core` 改注入 `onOpenFile` 回调，不反向依赖 sidebar |
| 分层倒置 `lib/` → `components/` | `editor.ts`(toast)、`editor.image.bubble.ts`(imageContextMenu)、`editor.extensions.ts`(mermaid/plantuml menu)、`editor.complexity.ts`(toast) | 靠回调注入 UI 能力（`editor.init.ts` 已有先例） |
| `fileTree.core` 被 dragdrop/inline 绕过 barrel 直连 | `fileTree.dragdrop.ts:1`、`fileTree.inline.ts:1` | 从 barrel 再导出 `dragState` 等 |
| `sidebar.ts` 再导出整个 `activeDocument` store，main 绕过 store 直连 sidebar | `main.ts` | 消费方直接 import store |
| 两套 active-path accessor | `getActiveFilePath`(activeDocument) vs `getActiveDocPath`(editor.state) | 统一单真相 |
| `editor.ts` 是大 hub barrel（引入整条 init 链） | `editor.ts` | 拆 `editor.api.ts`(稳定) vs `editor.bootstrap.ts`(副作用) |

---

## C. 后端代码（`src-tauri/src/`）：清理 + 重构

### C1. 过期/无用代码

| 项 | 位置 | 建议 |
|----|------|------|
| `consume_close_permission` / `cleanup_close_permission`（`#[allow(dead_code)]`，仅测试用，生产内联重复逻辑） | `state.rs:67-79` + `lib.rs:193-212` | 让生产调用它们，删 allow |
| `AppError::lock_poisoned` / `watcher_start_failed` + 对应 code 变体（从不发出） | `error.rs:44-51` | 删除，或接入真实调用点 |
| `AppError::internal` 上过期的 `#[allow(dead_code)]`（实际被调用） | `error.rs:65-68` | 删 allow |
| `FileEntry.children` 从不填充（分页取代递归） | `commands/files.rs:21-22` | 确认前端不用则删字段 |
| `authorized_storage_root` 未用的 `_state` 参数 | `files_image.rs:132-143` | 删参数（或真用上） |
| `resolve_path` 未用 `_state` + 吞掉所有 canonicalize 错误 | `files.rs:112-119` | 删参数、返回 `io::Result` |
| 7 个后端从不读的 settings 字段（含 `live_preview` 自述"No longer controls"） | `config/settings.rs:16-65` | 归并 `#[serde(default)]` 遗留块；`live_preview` 下个版本移除 |
| `let _ = file_name;` 死语句 | `logger.rs:102` | 删 |
| 陈旧注释（讲述已删代码） | `files.rs:713-714, 874-878` | 删 |
| **`write_file_binary` 零校验任意写盘**（安全风险） | `commands/export.rs:616-618` | **最高优先**：接入 workspace + 大小校验 |
| `download_image` 与 `download_image_to_storage` 安全预算不一致 | `files_image.rs:898-942` vs `855-895` | 统一到原子写 + 同校验 |

### C2. 需重构的超行文件（> 600 行）

| 文件 | 行数 | 拆分建议 |
|------|------|---------|
| `commands/files_image.rs` | 1152 | 拆 `mod.rs`(命令入口) / `storage.rs` / `pending.rs`(草稿生命周期) / `remote.rs`(网络) |
| `commands/files.rs` | 879 | 拆 `path.rs` / `io.rs` / `tree.rs` / `crud.rs` / `export_dialog.rs` |
| `commands/export.rs` | 785 | 拆 `mod.rs`(通用 print/save) / `pdf_macos.rs`(全 `cfg(macos)`) |
| `http.rs` | 672 | 拆 `mod.rs` / `url.rs` / `dns.rs` / `redirect.rs` / `magic.rs` / `redact.rs`（测试随模块走） |

### C3. 后端重复（去重收益）

| 重复 | 位置 | 建议 |
|------|------|------|
| **原子 temp+rename 写 ×5** | `files.rs:131-165`、`files_image.rs:233-261/364-380/916-941`、`export.rs:571-576` | 抽 `fs/atomic.rs` 一个助手 |
| **`normalize_lexical` 逐字 ×2** | `files.rs:441-453`、`files_image.rs:72-84` | 并入 `paths.rs` |
| 目录枚举 ×2 | `files.rs:617-650` vs `files_pagination.rs:42-91` | 复用分页版或删非分页版 |
| symlink 跳转防护 ×2 | `files.rs:479-502` vs `files_image.rs:180-203` | 抽 `fs/path_safety.rs` |
| base64+20MB 校验 ×8 | `files.rs:315/356/381/700`、`files_image.rs:472/696/786/280` | 抽 `decode_bounded_base64` |
| 远程抓取 `fetch_remote_image_bytes` vs `fetch_page_title_inner` | `files_image.rs:730-798` vs `files_meta.rs:13-56` | 抽 `http::fetch_body_with_limit` |
| 4 个 save-as 导出命令 ≈90% 相同 | `files.rs:292-421` | 参数化合并 |

### C4. 后端隐患（规范约束建议）

- **panic 路径**：`ignore.rs:42`、`watcher.rs:209/264` 用 `.lock().unwrap()`，与项目自身"poisoned mutex 恢复"约定冲突，会杀后台线程 → 改用 `lock_mutex` 恢复。
- **两套错误约定并存**：约 30 个命令返回 `Result<_, String>`，settings/workspace 用 `AppError` → 统一。
- **`AppState` 神对象**：HTTP client + 2 semaphore + 配置 + watcher 全塞一个结构 → 抽 `HttpResources`，magic number 命名常量。
- **`Settings` 41 字段扁平 blob** → `#[serde(flatten)]` 分组。
- **`open_file_in_new_window` 110 行**（`lib.rs:26-137`）复杂 if/else → 抽 `new_window_geometry`。
- **async 命令阻塞 UI 线程**：`blocking_save_file` 在 async 里 → 删 async 或 `spawn_blocking`。
- **`is_pid_alive` unsafe kill**（`files.rs:234-236`）缺 `// SAFETY`。

---

## D. 产物 / 依赖

| 项 | 现状 | 建议 |
|----|------|------|
| `dist/` | 未跟踪（gitignore），9.2 MB | 正常构建产物，无需入库；注意 stale |
| `src-tauri/target/` | gitignore，**14 GB** 本地 | 本地磁盘占用，非 git 问题；可提示清理 |
| `docs/bundle-report.html` | 已入库 git（963 KB 一次性产物） | 移出 git |
| `/patches/`（patch-package） | 存在 | 保留（`postinstall` 引用），但需确认 patch 仍有效 |
| devDeps `rollup-plugin-visualizer`、`@wdio/native-utils` | 配置用 | 保留（vite/e2e 依赖） |
| devDep `@types/pako` | 为 `pako` 提供类型 | 保留（`plantuml-lazy.ts` 用 pako） |
| `openspec/changes/fix-trailing-newlines-lost/` | 重复未归档 | 删除（见 A6） |

> 依赖侧无"装而未用"的大问题：`@codemirror/lang-*`、`legacy-modes` 均被 `codemirror-languages.ts` 引用。`highlight.js`/`lowlight` 由 tiptap code-block 走。

---

## 落地原则

1. 每条清理/重构**开独立 issue → 拉分支 → 实现 → PR**（遵守 `AGENTS.md`）。
2. 单人时按 `priority.md` 顺序推进；改动公共 API（DOCX 共享、active-path 统一、barrel 拆分）先 `/opsx:explore` 讨论再动。
3. 每一处落定后跑 `npm test` + `npx tsc --noEmit`（+ Rust `cargo check`）。
4. 代码规范见 [`code-standards.md`](./code-standards.md)，新代码自落之后起遵守。
