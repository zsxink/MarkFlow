# 1.1 基线刻画（feat-v0.1.0@6bfba453）

> P0 现状基线记录。后续所有 Slice 的对照锚点。P0 只建立证据，不改变产品行为。

## 1.1.1 基线身份

| 字段 | 值 |
| --- | --- |
| 基线标识 | `feat-v0.1.0@6bfba453` |
| commit SHA | `6bfba45307c1dd509dd7864de4e4f0ed495c57d7` |
| 上游 | `main` = `feat-v0.1.0` = `feat-v0.0.7` 同指 `6bfba45`（Merge PR #194） |
| P0 child branch | `test/issue-255-lossless-byte-contract`（基于 `eeacb6d`，即 umbrella commit） |
| P0 child Issue | #255 |
| parent Issue | #254 |

## 1.1.2 支持平台

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| macOS | AVAILABLE | 本次 P0 实测设备：macOS 26.5.2 (25F84)，arm64 |
| Windows | BLOCKED | 未登记设备/runner |
| Linux | BLOCKED | 未登记设备/runner |

WebView：macOS 使用 WKWebView（系统 WebKit）。

## 1.1.3 环境版本（实测）

| 工具 | 版本 |
| --- | --- |
| Node | v24.17.0 |
| npm | 11.13.0 |
| rustc | 1.96.0 (ac68faa20 2026-05-25) |
| cargo | 1.96.0 (30a34c682 2026-05-25) |
| @tauri-apps/cli | ^2.11.3（本地 devDependency） |
| @tauri-apps/api | ^2.0.0 |
| vite | ^5.4.0 |
| vitest | ^2.1.9 |
| @codemirror/* | state ^6.6.0 / view ^6.43.0 / lang-markdown ^6.5.0 |
| @tiptap/* | ^2.6.0；tiptap-markdown ^0.8.10 |

## 1.1.4 Feature flags / 默认路径

- P0 基线无任何 `losslessCoreSession` / `codemirrorLivePreview` / `coreRenderIr` flag（尚未引入）。
- 默认编辑链路 = **ProseMirror (Tiptap) WYSIWYG**；Source 模式临时创建 CodeMirror 6，切换时通过 PM serializer 与 `setContent()` 全文同步。
- 产品运行时默认/人工实测：`autosave: true`、`autosaveInterval: 10000`；P0 人工设备的实际 settings 同样为 autosave 开启。
- E2E settings 模板单独使用 `autosave: false`。因此现有 smoke PASS 不能证明真实产品的零编辑 autosave 生命周期安全，后续 lifecycle characterization 必须显式开启 autosave并等待至少两个 tick。

## 1.1.5 配置与日志目录

`src-tauri/src/paths.rs`：

- 非 e2e：`app_config_dir() = dirs::config_dir().join("MarkFlow")`
  - macOS 实测：`~/Library/Application Support/MarkFlow/`
  - settings：`<config>/settings.json`
  - **logs**：`<config>/logs`（`logger.rs::log_dir()`，启动时打印 `log_dir=`）
- e2e feature：使用 `MARKFLOW_E2E_DATA_DIR` 环境变量指定隔离目录。

## 1.1.6 当前编辑链路调用图

**打开：**
```text
invoke('read_file', { path })            src-tauri/commands/files.rs::read_file
  → read_to_string(path)                 （>100MB 拒绝；String 读入，非 bytes）
  → setMarkdown(content)                 src/lib/editor.ts
      → trailingNewlines = content.match(/\n+$/)[0].length   （#189 补偿捕获）
      → stripTrailingNewlines + normalizeImageMarkdown
      → ed.commands.setContent(normalized)   （Tiptap/ProseMirror doc）
      → markDocumentPersisted(normalized)
```

**保存：**
```text
saveActiveDocument()                     src/components/sidebar.fileops.ts
  → getMarkdown()                        src/lib/editor.ts
      WYSIWYG: storage.markdown.getMarkdown()  → normalizeImageMarkdown
               + trailingNewlines>0 ? '\n'.repeat(tn)   （#189 补偿补回）
      Source:  CM content 若以 \n 结尾直接用；否则回退 trailingNewlines
  → preparePendingImagesForSave(content) （图片路径迁移）
  → writeFile(path, prepared.markdown)   src/lib/storage.ts → invoke('write_file')
      → files.rs::write_file → atomic_write(&path, &content)   （String 原子写）
  → markDocumentPersisted(prepared.markdown, revision)
  → invoke('get_file_stats')             记录 mtime/size 供外部修改检测
```

**#189 补偿位置（L1 失败点）：**
- 捕获：`src/lib/editor.ts::setMarkdown`（`content.match(/\n+$/)`）。
- 补回：`src/lib/editor.ts::getMarkdown`（WYSIWYG 分支末尾 `'\n'.repeat(tn)`；Source 分支 `/\n$/` 检测）。
- 元数据：`DocumentState.trailingNewlines`（`src/lib/editor.state.ts`）。

该方案把「打开时捕获的尾部换行数」当作常量补偿，存在三类不满足 L1 的场景（详见 `docs/pm-tail-newline-characterization.md`）：CRLF/CR 尾部边界被补成 LF、用户显式增删尾换行被陈旧元数据覆盖、Mixed EOL 无法区分边界类型。

## 1.1.7 人工发现的零编辑生命周期（P0 corrective input）

2026-08-12 人工在真实 Tauri dev build 中打开四个隔离 LF/CRLF tail2/tail3 副本，未产生任何用户编辑；全部文件约每 10 秒被 autosave 改写，关闭时出现未保存提示。LF 尾部计数虽被 #189 补回，但段落内 soft break `\n` 被 serializer 改为空格；CRLF 全文被 `normalizeImageMarkdown()` 归一化为 LF，且 tail2/tail3 都因 `/\n+$/` 低估而坍缩为一个 LF。

直接调用链：

```text
setMarkdown(original)
  → strip tail + normalizeImageMarkdown(CRLF→LF)
  → ProseMirror hydration
  → markDocumentPersisted(pre-PM markdown)
      → getMarkdown(PM serializer; soft break→space)
      → content mismatch → dirty=true
openFileInEditor
  → setReadOnly(false)
      → setEditable(true; emitUpdate default true)
      → delayed onUpdate 再次维持 dirty
autosave tick (~10s)
  → saveActiveDocument
  → serializer output 写盘
```

原 P0 serializer characterization 没有运行 `openFileInEditor`、read-only/editable 同步、产品 `onUpdate`、autosave timer 或实际 write；L0 harness 只验证 oracle，不驱动产品。该覆盖缺口必须通过新的 corrective run 修正，历史 evidence 保持不可变。
