# active-document-state Specification

## Purpose
管理当前活动文档路径的独立共享模块，为 sidebar 和 fileTree 子模块提供无循环依赖的路径状态管理。

## Requirements

### Requirement: 活动文档路径管理独立模块
系统 SHALL 提供 `activeDocument.ts` 模块管理当前活动文档路径，包含 `getActiveFilePath`、`setActiveFilePath`、`rewriteActiveDocumentPath`、`clearActiveDocument`、`clearActiveDocumentIfMatches` 函数，仅依赖 `store`、`editor`、`outline`，不依赖 sidebar 或 fileTree 模块。

#### Scenario: getActiveFilePath 从 store 读取路径
- **WHEN** 调用 `getActiveFilePath()`
- **THEN** SHALL 返回 `store.getState().activeFilePath` 的当前值

#### Scenario: setActiveFilePath 更新 store 并同步 DOM
- **WHEN** 调用 `setActiveFilePath(path)`
- **THEN** `store` 中的 `activeFilePath` SHALL 被设置为 `path`
- **THEN** 文件树中路径匹配的节点 SHALL 被高亮为 active
- **THEN** 文件树中其他节点 SHALL 移除 active 高亮

#### Scenario: rewriteActiveDocumentPath 替换路径前缀
- **WHEN** 调用 `rewriteActiveDocumentPath(from, to)`
- **AND** 当前活动路径以 `from` 开头
- **THEN** 活动路径 SHALL 被替换为 `to` + 原路径的 `from` 之后部分

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

#### Scenario: clearActiveDocumentIfMatches 按路径匹配清除
- **WHEN** 调用 `clearActiveDocumentIfMatches(path)`
- **AND** 当前活动路径等于 `path` 或以 `path/` 开头
- **THEN** SHALL 调用 `clearActiveDocument()` 清除活动文档

#### Scenario: sidebar 通过 re-export 保持向后兼容
- **WHEN** 外部代码 `import { getActiveFilePath, setActiveFilePath, rewriteActiveDocumentPath } from './sidebar'`
- **THEN** SHALL 正常导入，签名和行为与重构前一致
