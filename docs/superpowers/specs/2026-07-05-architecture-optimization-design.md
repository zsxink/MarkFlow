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

## 6. 消除重复代码

### 6.1 getImageSettings / getActiveDocPath 重复

**现状**：`getImageSettings()` 和 `getActiveDocPath()` 在 `src/lib/editor.ts` 和 `src/components/toolbar.ts` 中完全重复实现。

**方案**：
- `getImageSettings()` 提取到 `src/lib/imageUtils.ts`
- `getActiveDocPath()` 提取到 `src/lib/editor.ts`（它依赖 editor 模块的 DOM 查询逻辑，不宜放 pathUtils）
- 删除两处重复代码，改为 import 共享版本

对应 Issue: [#51](https://github.com/zsxink/MarkFlow/issues/51)

### 6.2 Rust HTTP 客户端逻辑重复

**现状**：`src-tauri/src/commands/files.rs` 中 `fetch_remote_image_bytes` 和 `fetch_page_title` 各自完整实现了 Client 创建、URL 校验、重定向跟踪（~80 行重复）。

**方案**：提取 `src-tauri/src/http.rs`，含三个共享函数：
- `create_http_client() -> Result<Client, String>`
- `validate_url(url: &str) -> Result<Url, String>`
- `fetch_with_redirects(client, url, max_redirects) -> Result<Response, String>`

`fetch_remote_image_bytes` 和 `fetch_page_title` 改为调用共享函数。

对应 Issue: [#52](https://github.com/zsxink/MarkFlow/issues/52)

## 7. 类型安全：Settings 类型对齐

**现状**：前端用 `Record<string, unknown>` 传递 settings，Rust 端有严格 `Settings` struct。新增字段需在 Rust struct + TS 两处加，少一端就静默丢失。`DEFAULT_SETTINGS` 在前端 `settings.ts` 中也重复定义。

**方案**：
1. `src/types/settings.ts` — 定义带完整字段的类型化 `Settings` interface（camelCase，与 Rust serde 对齐）
2. `storage.ts` 中 `loadSettings`/`saveSettings` 改为 `Settings` 类型而非 `Record<string, unknown>`
3. `settings.ts` 组件中 `DEFAULT_SETTINGS` 引用 types 定义
4. 逐模块移除 `as Record<string, unknown>` 类型断言

注意：这是纯前端类型增强，Rust 侧通过 serde camelCase 已正确反序列化，无需修改。

对应 Issue: [#53](https://github.com/zsxink/MarkFlow/issues/53)

## 8. 测试覆盖率

**现状**：仅 265 行测试文件，覆盖率 < 5%。核心路径（序列化、文件操作、图片处理、冲突处理、状态管理）无测试。

**方案**：

| 优先级 | 模块 | 测试内容 |
|--------|------|----------|
| P0 | `editor.serializer.ts` | `normalizeImageMarkdown`、`fixImageNewlines`、`fixCorruptedImageNewlines`、`replaceAssetUrlsWithOriginal` |
| P0 | `editor.state.ts` | `getMarkdown`、`setMarkdown`、dirty 检查 |
| P1 | `imageUtils.ts` | `generateImageName`、`getStoragePath`、`imagePathToSrc` |
| P1 | `pathUtils.ts` | `resolveImagePath`、`computeRelativePath`、`getFileName` |
| P2 | `store.ts` | 发布订阅行为 |
| P2 | `settings.ts` | `buildSettingsFromUI`、`applyRuntimeSettings` |

不追求覆盖率数字指标，优先覆盖核心序列化/状态路径。

对应 Issue: [#54](https://github.com/zsxink/MarkFlow/issues/54)

## 9. 代码清理

### 9.1 移除无用的 dom.ts

**现状**：`src/utils/dom.ts`（8 行）导出 `$()` 和 `safe()`，其中 `safe()` 无人调用，`$()` 仅 2-3 处使用且直接写 `document.getElementById()` 更清晰。

**方案**：删除文件，现有调用处改为直接使用 `document.getElementById()`。

对应 Issue: [#55](https://github.com/zsxink/MarkFlow/issues/55)

## 不变原则

- 不改运行时行为
- 不改函数签名（公共 API 保持兼容）
- 不做重构以外的"顺带改动"
- `npm test` 全部通过作为基本验证门槛

## 优先级

### 第一批（#42-#49）

1. [#42](https://github.com/zsxink/MarkFlow/issues/42) — editor.ts 拆分（最核心、最痛）
2. [#43](https://github.com/zsxink/MarkFlow/issues/43) — fileTree.ts 拆分
3. [#44](https://github.com/zsxink/MarkFlow/issues/44) — sidebar.ts 拆分
4. [#45](https://github.com/zsxink/MarkFlow/issues/45) — CSS 拆分
5. [#46](https://github.com/zsxink/MarkFlow/issues/46) — Store + 事件系统（依赖拆分完成）
6. [#47](https://github.com/zsxink/MarkFlow/issues/47) — 类型系统（可并行）
7. [#49](https://github.com/zsxink/MarkFlow/issues/49) — UI 模式统一（可独立）
8. [#48](https://github.com/zsxink/MarkFlow/issues/48) — CodeMirror（可独立）

### 第二批（#51-#55）

9. [#51](https://github.com/zsxink/MarkFlow/issues/51) — 消除重复代码（简单直接）
10. [#54](https://github.com/zsxink/MarkFlow/issues/54) — 测试覆盖率（可逐步推进）
11. [#53](https://github.com/zsxink/MarkFlow/issues/53) — Settings 类型对齐（依赖 #47 类型系统）
12. [#52](https://github.com/zsxink/MarkFlow/issues/52) — Rust HTTP 共享函数（独立）
13. [#55](https://github.com/zsxink/MarkFlow/issues/55) — 清理 dom.ts（独立，1 分钟）
