## MODIFIED Requirements

### Requirement: 文件树模块拆分架构
文件树模块 SHALL 拆分为四个文件：`fileTree.ts`（公共入口，纯 re-export）、`fileTree.core.ts`（核心渲染/状态/排序）、`fileTree.dragdrop.ts`（拖拽）、`fileTree.inline.ts`（内联编辑）。`fileTree.ts` SHALL 为纯 re-export 桶文件，不包含任何函数定义。

#### Scenario: 公共 API 全部从入口导出
- **WHEN** 外部代码 `import { startInlineRename } from '../components/fileTree'`
- **THEN** 所有公共 API 符号均可通过 `fileTree.ts` 访问，且签名与拆分前一致

#### Scenario: 桶文件为纯 re-export
- **WHEN** 查看 `fileTree.ts`
- **THEN** 它 SHALL 仅包含 `export { ... } from '...'` 语句，不包含任何函数定义或逻辑代码

#### Scenario: 拖拽模块从 activeDocument 导入路径操作
- **WHEN** 查看 `fileTree.dragdrop.ts` 的 import
- **THEN** `rewriteActiveDocumentPath` SHALL 从 `./activeDocument` 导入，而非 `./sidebar`

#### Scenario: 内联编辑模块从 activeDocument 导入路径操作
- **WHEN** 查看 `fileTree.inline.ts` 的 import
- **THEN** `rewriteActiveDocumentPath` SHALL 从 `./activeDocument` 导入，而非 `./sidebar`

#### Scenario: sidebar 直接调用 initMouseDrag
- **WHEN** `initSidebar()` 初始化文件树
- **THEN** SHALL 从 `./fileTree.dragdrop` 导入 `initMouseDrag` 并直接调用，不再通过 `fileTree.ts` 的 `initFileTree` 包装

#### Scenario: 拖拽操作正常触发
- **WHEN** 用户在文件树上按住鼠标左键拖动文件到另一个文件夹
- **THEN** 文件 Tree SHALL 正确移动到目标文件夹，`showToast('已移动')` 显示提示

#### Scenario: 内联重命名正常触发
- **WHEN** 用户在文件树中触发重命名（输入新名称后按 Enter）
- **THEN** 文件 SHALL 被重命名，DOM 中的路径和显示名称同步更新

#### Scenario: 内联新建文件正常触发
- **WHEN** 用户在文件夹中新建文件并输入文件名后按 Enter
- **THEN** 新文件 SHALL 被创建，在文件树中插入新节点并按排序规则定位，自动在编辑器中打开
