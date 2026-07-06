## ADDED Requirements

### Requirement: 文件树模块拆分架构
文件树模块 SHALL 拆分为四个文件：`fileTree.ts`（公共入口）、`fileTree.core.ts`（核心渲染/状态/排序）、`fileTree.dragdrop.ts`（拖拽）、`fileTree.inline.ts`（内联编辑）。

#### Scenario: 公共 API 全部从入口导出
- **WHEN** 外部代码 `import { initFileTree, startInlineRename } from '../components/fileTree'`
- **THEN** 所有公共 API 符号均可通过 `fileTree.ts` 访问，且签名与拆分前一致

#### Scenario: core 模块包含渲染和排序功能
- **WHEN** 查看 `fileTree.core.ts`
- **THEN** 它 SHALL 包含 `createTreeNode`、`insertEntryIntoTree`、`removeEntryFromTree`、`renameEntryInTree`、`insertSorted`、`escapePathSelector`、`escapeHtml` 以及 `workspacePath`/`expandedPaths` 状态管理

#### Scenario: dragdrop 模块包含拖拽功能
- **WHEN** 查看 `fileTree.dragdrop.ts`
- **THEN** 它 SHALL 包含 `initMouseDrag` 函数及其内部所有局部变量和事件监听器（mousemove/mouseup）、`dragSrcPath`/`dragSrcEl`/`isDragging` 拖拽状态

#### Scenario: inline 模块包含内联编辑功能
- **WHEN** 查看 `fileTree.inline.ts`
- **THEN** 它 SHALL 包含 `startInlineRename`、`startInlineCreate`、`createInlineInput`、`setupInlineInput`

#### Scenario: 拖拽操作正常触发
- **WHEN** 用户在文件树上按住鼠标左键拖动文件到另一个文件夹
- **THEN** 文件 Tree SHALL 正确移动到目标文件夹，`showToast('已移动')` 显示提示

#### Scenario: 内联重命名正常触发
- **WHEN** 用户在文件树中触发重命名（输入新名称后按 Enter）
- **THEN** 文件 SHALL 被重命名，DOM 中的路径和显示名称同步更新

#### Scenario: 内联新建文件正常触发
- **WHEN** 用户在文件夹中新建文件并输入文件名后按 Enter
- **THEN** 新文件 SHALL 被创建，在文件树中插入新节点并按排序规则定位，自动在编辑器中打开
