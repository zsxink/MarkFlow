## MODIFIED Requirements

### Requirement: 文件树模块拆分架构

文件树模块架构 SHALL 按以下要求拆分并暴露公共 API。

#### 模块职责

- `fileTree.ts`：公共入口，纯 re-export 桶文件，不包含任何函数定义
- `fileTree.core.ts`：核心渲染、状态管理、排序、增量更新
- `fileTree.dragdrop.ts`：拖拽功能
- `fileTree.inline.ts`：内联编辑

#### 公共 API

`fileTree.ts` SHALL re-export 以下函数：
- `initFileTree()`：初始化文件树
- `refreshFileTree()`：全量刷新（首次加载、workspace 切换）
- `cleanup()`：清理事件监听器和 rAF 调度（新增）
- `applyFileTreeEvents()`：应用文件系统变更事件（增量更新）

#### 不变量

- 规范化 path 是节点和目录状态的稳定键
- 目录加载只处理直接子项并保留排序
- 单项事件不得重建整棵树，重命名必须迁移已加载后代及活动/展开状态
- **新增**：增量更新 SHALL 使用 rAF 批量提交，pendingMutations 队列积累 16ms 内变更

#### 验证

- `npm test -- src/components/fileTree.core.test.ts src/components/fileTree.lazy.test.ts src/components/fileTree.state.test.ts`
- `npm run benchmark:file-tree`
- `npx openspec validate file-tree-architecture --strict`
