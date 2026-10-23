# active-document-state Specification

## Purpose
定义活动文档路径的共享状态管理，并为侧边栏和文件树模块提供无循环依赖的路径操作。

## Agent Context
- **源码入口：** `src/ui/active-document.ts`；调用方包括 `src/ui/sidebar/fileops.ts`、`src/ui/file-tree/dragdrop.ts` 和 `src/ui/file-tree/inline.ts`。
- **关联规范：** `sidebar`、`file-tree-architecture`、`document-size-tier`。
- **不变量：** 活动路径是 store 的唯一事实来源；路径改写必须同时覆盖该路径下的活动文档；清除活动文档时必须同步编辑器、文件树选中状态和大纲。
- **验证：** `npm test -- src/infra/__tests__/store.test.ts src/ui/file-tree/__tests__/core.test.ts`；`npx openspec validate active-document-state --strict`。

## Requirements

### Requirement: 活动文档路径管理独立模块
系统 SHALL 提供 `activeDocument.ts` 模块管理当前活动文档路径，包含 `getActiveFilePath`、`setActiveFilePath`、`rewriteActiveDocumentPath`、`clearActiveDocument`、`clearActiveDocumentIfMatches` 函数，保持路径共享入口，不依赖 sidebar 或 fileTree 模块；活动路径 SHALL 是窗口内打开文档集合中活动标签的投影。

#### Scenario: getActiveFilePath 从 store 读取路径
- **WHEN** 调用 `getActiveFilePath()`
- **THEN** SHALL 返回 `store.getState().activeFilePath` 的当前值

#### Scenario: setActiveFilePath 更新 store 并同步 DOM
- **WHEN** 调用 `setActiveFilePath(path)`
- **THEN** `store` 中的 `activeFilePath` SHALL 被设置为 `path`
- **THEN** 文件树中路径匹配的节点 SHALL 被高亮为 active
- **THEN** 文件树中其他节点 SHALL 移除 active 高亮

#### Scenario: 文档切换时滚动位置恢复
- **WHEN** 首次打开文件
- **THEN** 编辑区滚动 SHALL 从 0 开始
- **WHEN** 激活已打开的标签
- **THEN** SHALL 恢复该标签此前的滚动位置

#### Scenario: 重新加载文档时保持滚动位置
- **WHEN** 调用 `reloadActiveDocumentFromDisk` 重新加载当前文档
- **THEN** editor-area 滚动容器的 scrollTop SHALL 保持不变

#### Scenario: rewriteActiveDocumentPath 替换所有打开路径前缀
- **WHEN** 调用 `rewriteActiveDocumentPath(from, to)`
- **AND** 当前活动路径以 `from` 开头
- **THEN** 所有已打开标签中匹配路径或目录前缀的路径 SHALL 被替换为 `to` + 原路径的 `from` 之后部分
- **THEN** 活动路径与标签标题 SHALL 同步更新

#### Scenario: rewriteActiveDocumentPath 无匹配时无操作
- **WHEN** 调用 `rewriteActiveDocumentPath(from, to)`
- **AND** 当前活动路径不以 `from` 开头
- **THEN** 活动路径 SHALL 保持不变

#### Scenario: clearActiveDocument 重置状态
- **WHEN** 调用 `clearActiveDocument()`
- **THEN** 编辑器内容 SHALL 被清空
- **THEN** 活动文件路径 SHALL 设为 null
- **THEN** 文件树选中状态 SHALL 被清除
- **THEN** 大纲 SHALL 被刷新

#### Scenario: clearActiveDocumentIfMatches 按路径匹配关闭文档
- **WHEN** 调用 `clearActiveDocumentIfMatches(path)`
- **AND** 当前活动路径等于 `path` 或以 `path/` 开头
- **THEN** SHALL 只处理匹配的打开标签并保留不匹配标签，脏内容须明确确认后方可丢弃

#### Scenario: sidebar 通过 re-export 保持向后兼容
- **WHEN** 外部代码 `import { getActiveFilePath, setActiveFilePath, rewriteActiveDocumentPath } from './sidebar'`
- **THEN** SHALL 正常导入，签名和行为与重构前一致
