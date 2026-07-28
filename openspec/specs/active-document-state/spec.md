# active-document-state Specification

## Purpose
定义活动文档/会话的共享状态管理边界，使旧的 active path API 能在 M4 以后平滑迁移到 session-indexed workspace model，并为侧边栏、文件树、编辑器、大纲和关闭流程提供无循环依赖的路径投影操作。

## Agent Context
- **源码入口：** `src/components/activeDocument.ts`；调用方包括 `src/components/sidebar.fileops.ts`、`src/components/fileTree.dragdrop.ts` 和 `src/components/fileTree.inline.ts`。
- **关联规范：** `sidebar`、`file-tree-architecture`、`document-size-tier`。
- **不变量：** M3 以前活动路径是 store 的兼容事实来源；M4 起活动 session 是事实来源，路径是从 active session 的 `DocumentSource` 派生的文件树投影。路径改写必须同时覆盖匹配 session 的 source；清除活动文档时必须同步编辑器、文件树选中状态和大纲。
- **验证：** `npm test -- src/lib/store.test.ts src/components/fileTree.core.test.ts`；`npx openspec validate active-document-state --strict`。

## Requirements

### Requirement: 活动文档路径管理独立模块
系统 SHALL 提供 `activeDocument.ts` 模块管理当前活动文档路径，并在 Core-backed 重构阶段迁移为活动 session 管理。兼容 API 包含 `getActiveFilePath`、`setActiveFilePath`、`rewriteActiveDocumentPath`、`clearActiveDocument`、`clearActiveDocumentIfMatches` 函数，仅依赖 `store`、`editor`、`outline`，不依赖 sidebar 或 fileTree 模块。

#### Scenario: getActiveFilePath 从 store 读取路径
- **WHEN** 调用 `getActiveFilePath()`
- **THEN** SHALL 返回 `store.getState().activeFilePath` 的当前值

#### Scenario: M4 后 getActiveFilePath 从 active session 派生路径
- **WHEN** App Workspace 已启用 session-indexed state
- **AND** 当前 active session 的 `DocumentSource.path` 非空
- **THEN** `getActiveFilePath()` SHALL 返回该 path
- **AND** 不得把 path 当作 session identity

#### Scenario: active session 是文档运行态事实来源
- **WHEN** 一个文档通过 Runtime 打开并获得 `sessionId`
- **THEN** store SHALL 记录 `activeSessionId`
- **THEN** dirty、revision、selection、viewport 和 pending 状态 SHALL 按该 `sessionId` 存储
- **THEN** 文件树 active path SHALL 从该 session 的 source 派生

#### Scenario: setActiveFilePath 更新 store 并同步 DOM
- **WHEN** 调用 `setActiveFilePath(path)`
- **THEN** `store` 中的 `activeFilePath` SHALL 被设置为 `path`
- **THEN** 文件树中路径匹配的节点 SHALL 被高亮为 active
- **THEN** 文件树中其他节点 SHALL 移除 active 高亮

#### Scenario: 文档切换时滚动位置重置
- **WHEN** 调用 `openFileInEditor` 打开一个与当前不同的文档
- **THEN** editor-area 滚动容器的 scrollTop SHALL 被重置为 0

#### Scenario: 重新加载文档时保持滚动位置
- **WHEN** 调用 `reloadActiveDocumentFromDisk` 重新加载当前文档
- **THEN** editor-area 滚动容器的 scrollTop SHALL 保持不变

#### Scenario: rewriteActiveDocumentPath 替换路径前缀
- **WHEN** 调用 `rewriteActiveDocumentPath(from, to)`
- **AND** 当前活动路径以 `from` 开头
- **THEN** 活动路径 SHALL 被替换为 `to` + 原路径的 `from` 之后部分
- **AND** M4 后匹配 session 的 `DocumentSource.path` SHALL 同步改写

#### Scenario: rewriteActiveDocumentPath 无匹配时无操作
- **WHEN** 调用 `rewriteActiveDocumentPath(from, to)`
- **AND** 当前活动路径不以 `from` 开头
- **THEN** 活动路径 SHALL 保持不变

#### Scenario: clearActiveDocument 重置状态
- **WHEN** 调用 `clearActiveDocument()`
- **THEN** 编辑器内容 SHALL 被清空
- **THEN** 活动文件路径 SHALL 设为 null
- **THEN** M4 后活动 session SHALL 被关闭或从 active state 中移除
- **THEN** 文件树选中状态 SHALL 被清除
- **THEN** 大纲 SHALL 被刷新

#### Scenario: clearActiveDocumentIfMatches 按路径匹配清除
- **WHEN** 调用 `clearActiveDocumentIfMatches(path)`
- **AND** 当前活动路径等于 `path` 或以 `path/` 开头
- **THEN** SHALL 调用 `clearActiveDocument()` 清除活动文档

#### Scenario: sidebar 通过 re-export 保持向后兼容
- **WHEN** 外部代码 `import { getActiveFilePath, setActiveFilePath, rewriteActiveDocumentPath } from './sidebar'`
- **THEN** SHALL 正常导入，签名和行为与重构前一致
