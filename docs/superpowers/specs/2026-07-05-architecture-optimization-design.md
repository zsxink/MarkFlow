# 架构优化设计 — MarkFlow 增量重构 (方案 A)

## 概述

对 MarkFlow 前端代码进行增量式重构（方案 A），聚焦代码质量与可维护性提升，不改变运行时行为。总工作量约 8 个独立单元。

## 1. 核心文件拆分

### 1.1 editor.ts → 6 个子模块

**现状**：`src/lib/editor.ts` (1228 行)，包含编辑器初始化、序列化、图像处理、Mermaid、粘贴/拖放、脏检查、光标统计。

**目标结构**：

| 文件 | 职责 | 估算行数 |
|------|------|----------|
| `editor.ts` | `new Editor()` 配置组装、paste/drop 事件绑定、导出 `getEditor()`/`getMode()`/`setMode()` | ~200 |
| `editor.state.ts` | `documentState`、dirty/mode tracking、`getMarkdown()`/`setMarkdown()` | ~150 |
| `editor.extensions.ts` | CustomLink、BlockImage、mermaidCodeBlockExtension 等 TipTap 扩展 | ~250 |
| `editor.serializer.ts` | `normalizeImageMarkdown()`、`checkSerializationIntegrity()`、`extractDocAsFallback()` | ~100 |
| `editor.stats.ts` | `getWordCount()`、`getLineCount()`、`getCursorPos()` | ~80 |
| `editor.image.store.ts` | `assetToOriginalMap`、`imageSrcResolverPlugin` | ~50 |
| `editor.image.bubble.ts` | `imageBubblePlugin` 全部 UI 逻辑 | ~190 |

对应 Issue: [#42](https://github.com/zsxink/MarkFlow/issues/42)

### 1.2 fileTree.ts → 3 个子模块

**现状**：`src/components/fileTree.ts` (805 行)，树渲染、拖拽、重命名/创建、排序混合。

| 文件 | 职责 | 估算行数 |
|------|------|----------|
| `fileTree.core.ts` | 树渲染 `createTreeNode()`、展开/折叠、排序、`setWorkspacePath()` | ~350 |
| `fileTree.dragdrop.ts` | `initMouseDrag()` 全部逻辑 | ~130 |
| `fileTree.inline.ts` | `startInlineRename()`、`startInlineCreate()`、输入框 helper | ~200 |

对应 Issue: [#43](https://github.com/zsxink/MarkFlow/issues/43)

### 1.3 sidebar.ts → 3 个子模块

**现状**：`src/components/sidebar.ts` (499 行)，UI + 文件操作 + 冲突处理混合。

| 文件 | 职责 | 估算行数 |
|------|------|----------|
| `sidebar.ts` | 仅保留 `initSidebar()`（UI 挂载、tab 切换、resize handle） | ~100 |
| `sidebar.fileops.ts` | `saveActiveDocument()`、`reloadActiveDocumentFromDisk()`、`openFileInEditor()` | ~200 |
| `sidebar.conflict.ts` | `showExternalConflictDialog()`、`showExternalDeletionDialog()`、外部修改/删除处理 | ~150 |

对应 Issue: [#44](https://github.com/zsxink/MarkFlow/issues/44)

### 1.4 main.css → 5 个独立 CSS

**现状**：`src/styles/main.css` (1609 行)，全部组件样式集中在一个文件。

| 文件 | 内容 |
|------|------|
| `app.css` | 全局布局 #app grid、scrollbar、reset |
| `toolbar.css` | 工具栏 + 菜单样式 |
| `sidebar.css` | 侧边栏 + 文件树 + 大纲 |
| `editor.css` | ProseMirror 排版 + 代码块 + Mermaid |
| `components.css` | Modal、Toast、ContextMenu、Settings、Dialog |

`variables.css` 保持现状。

对应 Issue: [#45](https://github.com/zsxink/MarkFlow/issues/45)

## 2. 状态管理 Store + 类型化事件

**现状**：模块级 mutable 变量散布、自定义 DOM Event payload 为裸 `any`。

**方案**：`src/lib/store.ts` 轻量级发布订阅 Store：

```typescript
type StoreEvent = 
  | { type: 'editor:update' }
  | { type: 'editor:dirty'; dirty: boolean }
  | { type: 'editor:mode'; mode: 'wysiwyg' | 'source' }
  | { type: 'file:active'; path: string | null }
  | { type: 'settings:changed'; settings: Record<string, unknown> }
  | { type: 'workspace:set'; path: string | null }
```

API：`store.on(type, cb)`、`store.emit(event)`、`store.off(type, cb)`

各模块逐步从 `document.addEventListener` 迁移到 `store.on`。

对应 Issue: [#46](https://github.com/zsxink/MarkFlow/issues/46)

## 3. 类型系统补全

**现状**：`src/types/` 为空，类型定义内联在各模块中。

**方案**：创建 `src/types/events.ts`、`src/types/editor.ts`、`src/types/fileTree.ts`，将内联类型移入统一位置。

对应 Issue: [#47](https://github.com/zsxink/MarkFlow/issues/47)

## 4. 源码编辑器增强 — CodeMirror 6

**现状**：源码模式使用纯 `<textarea>`，无语法高亮。`@codemirror/view` 和 `@codemirror/state` 已在依赖中但未使用。

**方案**：`src/lib/editor.source.ts` 中用 CodeMirror 6 的 `EditorView` 替换 textarea，启用语法高亮，保留现有行号 gutter。通过 `updateListener` 实现双向同步。仅源码模式激活时创建视图，切换时销毁。

对应 Issue: [#48](https://github.com/zsxink/MarkFlow/issues/48)

## 5. 弹窗 UI 模式统一

**现状**：5 种 Modal + 3 种 ContextMenu + Toast 实现各异，重复实现 backdrop click 关闭、Escape 关闭、focus 管理、Promise 包装逻辑。

**方案**：抽出 `showDialog()`、`showModal()`、`showContextMenuStatic()` 三个核心函数，逐步将现有弹窗迁移。

对应 Issue: [#49](https://github.com/zsxink/MarkFlow/issues/49)

## 不变原则

- 不改运行时行为
- 不改函数签名（公共 API 保持兼容）
- 不做重构以外的"顺带改动"
- `npm test` 全部通过作为基本验证门槛

## 优先级

1. [#42](https://github.com/zsxink/MarkFlow/issues/42) — editor.ts 拆分（最核心、最痛）
2. [#43](https://github.com/zsxink/MarkFlow/issues/43) — fileTree.ts 拆分
3. [#44](https://github.com/zsxink/MarkFlow/issues/44) — sidebar.ts 拆分
4. [#45](https://github.com/zsxink/MarkFlow/issues/45) — CSS 拆分
5. [#46](https://github.com/zsxink/MarkFlow/issues/46) — Store + 事件系统（依赖拆分完成）
6. [#47](https://github.com/zsxink/MarkFlow/issues/47) — 类型系统（可并行）
7. [#49](https://github.com/zsxink/MarkFlow/issues/49) — UI 模式统一（可独立）
8. [#48](https://github.com/zsxink/MarkFlow/issues/48) — CodeMirror（可独立）
