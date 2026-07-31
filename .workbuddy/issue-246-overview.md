# Issue #246 — WYSIWYG 打开 Markdown 不渲染（修复总结）

## 根本原因（确认）
提交 **M8C「收敛 M8C legacy fallback 删除 (#245)」** 删除了 `tiptap-markdown` 扩展与 legacy ProseMirror 的 markdown 序列化/反序列化路径。此后：

- legacy ProseMirror **不再具备 markdown 解析器**。
- 默认打开链路（`store.mode='wysiwyg'` + `wysiwygEngine='legacy-prosemirror'`，且 `shouldUseCoreBackedHydration()` 旧逻辑返回 false）走 legacy `setMarkdown(原始markdown)` → ProseMirror `setContent` → **纯文本团块**（markdown 语法裸露、换行丢失）。
- 同时未建立 Core 会话，导致「切换到 WYSIWYG」路径也无法启用 Core-backed 渲染（即用户看到的「当前文档暂不能切换」）。

> 另一 agent 的 `docs/superpowers/plans/2026-07-31-issue-246-summary.md` 只改 `trailingNewlines` 记账，未触及根因，因此「没有任何改善」。

## 修复方案
引入单一入口 `mountCoreBackedDocument(opened)`，让**打开/重载链路在任意模式下都建立 Core 会话并挂载 Core-backed 编辑器**：

- WYSIWYG 模式：CodeMirror + Core Render IR 投影扩展（真正渲染 markdown）。
- 源码模式：纯 CodeMirror。
- legacy ProseMirror 仅保留空壳并隐藏，不再喂入原始 markdown。

关键改动文件：
- `src/lib/editor.ts` — `mountCoreBackedDocument` / `unmountCoreBackedDocument` / 幂等守卫 / dirty 比较对称化。
- `src/components/sidebar.fileops.ts` — `shouldUseCoreBackedHydration()` 仅依赖 feature flag；`hydrateCoreBackedMarkdown(opened)` 调 `mountCoreBackedDocument` 并重置 `trailingNewlines=0`。
- `src/components/activeDocument.ts` — 关闭文档时 `unmountCoreBackedDocument()`。
- `src/lib/editor.stats.ts` / `src/components/outline.ts` — 从 CodeMirror `getSourceView()` 读取字数/大纲，避免回归为 0/空。

## 验证结果
- `npx tsc --noEmit`：**0 错误**。
- `npm test`：**490/490 通过**（新增默认 WYSIWYG 打开挂载 Core-backed 的回归测试）。
- `npm run build`：成功。
- 独立 sub-agent 复核：确认根因命中，验收标准 **① 打开即渲染**、**② 源码模式正常**在代码路径上成立。
- 分支：`fix/issue-246-markdown-newline-loss`（2 个提交：渲染修复 + 源码编辑器设置迁移）。

## 附注（非本人所写、会话中出现的 4 个文件）
`editor.source.ts` / `settings.ts` 及其测试将源码编辑器设置（soft-wrap、代码高亮）从已废弃的 `<textarea id="source-editor">`（仅存于 openspec mockup，不在真实 app）迁移到 CodeMirror。已单独提交。注意：源码编辑器 `fontSize`/`lineHeight`/`spellcheck` 从未迁移到 CodeMirror，属既有缺口，非本次引入。

## 后续（用户决定）
- 可选：`git push` 并在 `fix/issue-246-markdown-newline-loss` 上开 PR（关联 #246）。
- 可选：按 AGENTS.md 走 OpenSpec 归档（本修复无新增 delta spec，归档步骤可省略）。
- 建议实测：`npm run tauri dev` 打开一个 markdown 文件，确认 WYSIWYG 正常渲染、源码模式正常显示。
