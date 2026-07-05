## Context

`src/lib/editor.ts` 当前 1228 行，包含以下职责（按行号范围）：

- 1-28: Imports
- 24-77: `CustomLink` 扩展（继承 `@tiptap/extension-link`）
- 79-149: `BlockImage` 扩展（继承 `@tiptap/extension-image`）
- 151-420: `mermaidCodeBlockExtension` + 内部函数
- 421-465: `assetToOriginalMap`, `imageSrcResolverPlugin`
- 467-696: `imageBubblePlugin` 全部 UI 逻辑（~230 行）
- 698-860: 状态追踪、脏检查、Markdown 序列化、统计
- 864-1228: `initEditor()`, 模式切换、源编辑器行号、粘贴/拖放事件

所有内部状态（`editor`, `mode`, `documentState`, `assetToOriginalMap`）是模块级变量，跨函数共享。

已有 `editor.helpers.ts` 承载了 `syncCodeLineNumberGutters`、`countTextWords`、`checkSerializationIntegrity` 等辅助函数，该文件保持不变。

**约束条件**：
- 不改变任何导出函数签名（外部已调用的 17 个导出）
- 不改变运行时行为
- 拆分后对外仍从 `./editor` 导入

## Goals / Non-Goals

**Goals:**
- 将 editor.ts 按职责拆分为 6 个子模块 + 1 个精简后的入口 (`editor.ts` ~200 行)
- 每个子模块约 100-250 行，单一职责
- 入口文件 `editor.ts` 作为 barrel export 重新导出子模块的公开 API
- 所有现有 import 语句无需修改（从 `'./editor'` 导入仍能获取所有导出）

**Non-Goals:**
- 优化或重构现有逻辑（纯拆分，不改变行为）
- 添加新功能或新导出
- 修改测试文件（但须验证拆分后测试仍通过）
- 修改 `editor.helpers.ts`（该文件已经拆分，保持不动）

## Decisions

### 方案 A（选定的）：增量拆分，模块内部重导出

**原理**：在旧文件 `editor.ts` 中 inline 声明所有新模块内容，用 `export * from` 重新导出，最终逐步原子化。

逐步实施步骤：

1. **创建子模块文件**，将对应函数从 `editor.ts` 剪切到新文件
2. **新文件独立导出**其函数（`export function xxx` / `export const xxx`）
3. **`editor.ts` 尾部添加 `export * from './editor.X'`**，同时删除原内联定义
4. 由于 JS 运行时 `import` 在 `export` 之前解析，`export * from` 在新文件中引用 `editor.ts` 的变量（如 `editor`、`mode`）会形成**循环引用**。解决方案：
   - **方案 A1**：在 `editor.ts` 中用 `export * from` 时，确保被引用变量（如 `editor`、`mode`、`documentState`）不改位置——先在 `editor.ts` 中声明这些共享状态，再 `export * from` 到子模块，子模块引用 `editor.ts` 的变量。⚠️ 循环引用下子模块可能拿到 `undefined` 而非实际值。
   - **方案 A2**（选定）：将共享状态提取到 `editor.state.ts`，该文件不引用 `editor.ts`。所有需要这些状态的模块从 `editor.state.ts` 导入。`editor.ts` 也从 `editor.state.ts` 导入并用 `export * from` 重新导出以保持 API 兼容。
   - **方案 A3**：子模块使用 getter 函数延迟访问（`getEditor()` 已经如此），运行时总能拿到最新值，但 ESLint/TypeScript 可能报未初始化引用。

**选择方案 A2** 的理由：
- 规避循环引用问题
- 状态集中管理，职责划分更清晰
- 纯重构，不改行为
- 方案 A1 的循环引用在 Tiptap 扩展中可能产生难以追踪的运行时错误

### 模块 vs 文件粒度

子模块划分按照 issue #42 原始方案：

| 文件 | 内容 | 行数预估 | 相互依赖 |
|------|------|---------|---------|
| `editor.state.ts` | `documentState`, `editor`, `mode`, `dirtyCheckTimer`, `updateEventTimer`, `activeDocPathOverride`, `cachedSourceGutterStyles` + 导出 getter/setter | ~80 | 无（基础模块） |
| `editor.extensions.ts` | `CustomLink`, `BlockImage`, `mermaidCodeBlockExtension`, `lowlight` | ~180 | 引用 `editor.state.ts`(getActiveDocPath) + `./mermaid` + `./imageUtils` + `./editor.state`(assetToOriginalMap) + `./pathUtils`(resolveImagePath) |
| `editor.serializer.ts` | `normalizeImageMarkdown`, `checkSerializationIntegrity`(引用), `extractDocAsFallback` | ~80 | 引用 `editor.state.ts`(activeDocPathOverride) + `editor.helpers.ts`(checkSerializationIntegrity) |
| `editor.stats.ts` | `getWordCount`, `getLineCount`, `getCursorPos`, `getSourceTextarea` | ~80 | 引用 `editor.state.ts`(editor) |
| `editor.image.store.ts` | `assetToOriginalMap`, `imageSrcResolverPlugin`, `getOriginalSrc` | ~80 | 引用 `editor.state.ts`(getActiveDocPath) + `./pathUtils` + `./imageUtils` |
| `editor.image.bubble.ts` | `imageBubblePlugin` + 辅助函数 | ~230 | 引用 `editor.state.ts`(editor) + `editor.image.store.ts`(assetToOriginalMap, getOriginalSrc) + `./imageUtils` + `./pathUtils` + `../components` + `./storage`(getImageSettings) |

### `editor.state.ts` 共享状态设计

在 `editor.state.ts` 中声明和导出所有模块级状态变量：

```typescript
// editor.state.ts — shared state for editor modules
import type { Editor } from '@tiptap/core';
import type { ImageSettings } from './imageUtils';

export let editor: Editor | null = null;
export let mode: 'wysiwyg' | 'source' = 'wysiwyg';
export let dirtyCheckTimer: ReturnType<typeof setTimeout> | null = null;
export let updateEventTimer: ReturnType<typeof setTimeout> | null = null;
export let activeDocPathOverride: string | null = null;
export let cachedSourceGutterStyles: Record<string, string> | null = null;
export const assetToOriginalMap = new Map<string, string>();

export const documentState = {
  dirty: false,
  lastPersistedMarkdown: '',
  programmaticUpdate: false,
  externalDocChanged: false,
};

export function setEditor(e: Editor | null) { editor = e; }
export function setMode(m: 'wysiwyg' | 'source') { mode = m; }
export function setDirtyCheckTimer(t: ReturnType<typeof setTimeout> | null) { dirtyCheckTimer = t; }
export function setUpdateEventTimer(t: ReturnType<typeof setTimeout> | null) { updateEventTimer = t; }
export function setActiveDocPathOverride(p: string | null) { activeDocPathOverride = p; }
export function setCachedSourceGutterStyles(s: Record<string, string> | null) { cachedSourceGutterStyles = s; }
```

### 入口文件 `editor.ts`

拆分后的 `editor.ts` 职责：
- `initEditor()` — 组装编辑器实例
- paste/drop 事件绑定
- `switchToSource()` / `switchToWysiwyg()` — 模式切换
- `syncSourceEditorLineNumbers()` — 行号同步
- barrel export: `export * from './editor.state'` + 各个子模块包含的导出

⚠️ `switchToSource` 和 `switchToWysiwyg` 涉及多个模块的协作（序列化、模式切换、行号刷新），保留在入口文件中。

### 扩展导出注意事项

`CustomLink`、`BlockImage`、`mermaidCodeBlockExtension` 是 Tiptap 扩展对象，未导出到 editor.ts 外部（仅在 `initEditor` 的 extensions 数组中使用），因此拆分到 `editor.extensions.ts` 后不需要在 `editor.ts` 中重新导出——`initEditor` 直接从 `editor.extensions.ts` import 即可。

同理 `imageSrcResolverPlugin` 和 `imageBubblePlugin` 也仅在 `initEditor` 内部使用，不需要在入口重新导出。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 循环引用导致子模块获取到 `undefined` 变量 | 采用方案 A2 提取共享状态到 `editor.state.ts`，避免跨文件循环引用 |
| 某导出被遗漏导致外部模块编译失败 | 拆分后执行 `npm run build` 确保编译通过 |
| `switchToSource` 中的序列化引用路径错误 | 逐步创建文件，每完成一个执行 `tsc` 验证 |
| 运行时 `editor` 为 null 的边界情况 | `getEditor()` 已有 null 检查，`editor.state.ts` 也保持同样检查 |
| 内容被中断时回滚困难 | 所有变更在分支上完成，每提交一个子模块可独立回滚 |

## Migration Plan

1. 分支：`refactor/issue-42-split-editor-ts`（从 `main` 创建）
2. 按以下顺序创建子模块文件，每个完成后运行 `npm run build` 验证：
   - `editor.state.ts`（共享状态，无外部依赖）→ `editor.ts` 改用导入
   - `editor.extensions.ts`（Tiptap 扩展）→ `editor.ts` 改用导入
   - `editor.image.store.ts`（图片映射 + 插件）→ `editor.ts` 改用导入
   - `editor.serializer.ts`（序列化函数）→ `editor.ts` 改用导入
   - `editor.stats.ts`（统计函数）→ `editor.ts` 改用导入
   - `editor.image.bubble.ts`（气泡 UI）→ `editor.ts` 改用导入
3. 精简 `editor.ts`，删除已移出的代码，确认 ~200 行
4. `npm test` 全部通过
5. 手动在 Tauri 环境下测试 WYSIWYG↔Source 切换、图像编辑、Mermaid 渲染
6. 提交 PR，合入 main

## Open Questions

- 无 — issue #42 的拆分方案已被充分讨论，模块划分和接口已明确
