# file-tree-architecture Specification

## Purpose
定义文件树的模块拆分架构、浅层按需目录加载、有界分页枚举和文件系统变更事件的增量更新机制。

## Agent Context
- **源码入口：** `src/components/fileTree.ts`、`src/components/fileTree.core.ts`、`src/components/fileTree.state.ts`、`src/components/fileTree.dragdrop.ts`、`src/components/fileTree.inline.ts`；后端目录与 watcher 命令位于 `src-tauri/src/commands/files.rs`。
- **关联规范：** `active-document-state`、`sidebar`、`background-task-lifecycle`、`expensive-task-scheduling`。
- **不变量：** 规范化 path 是节点和目录状态的稳定键；目录加载只处理直接子项并保留排序；单项事件不得重建整棵树，重命名必须迁移已加载后代及活动/展开状态。
- **验证：** `npm test -- src/components/fileTree.core.test.ts src/components/fileTree.lazy.test.ts src/components/fileTree.state.test.ts`；`npm run benchmark:file-tree`；`npx openspec validate file-tree-architecture --strict`。

## Requirements

**模块架构**

文件树模块架构 MUST 按以下要求拆分并暴露公共 API。

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


**运行时行为**

文件树运行时行为 MUST 满足以下按需加载、事件处理和性能要求。

### Requirement: 浅层按需目录加载
系统 SHALL 在打开工作区时只读取根目录的首批必要条目，并在用户展开尚未加载的目录时才请求该目录的直接子项。目录读取结果 MUST 使用规范化绝对路径作为稳定标识，不得递归附带全部后代。

#### Scenario: 打开大型工作区
- **WHEN** 用户打开包含任意深度子目录的工作区
- **THEN** 后端只枚举根目录的直接子项和分页元数据
- **THEN** 首屏渲染不等待未展开目录的内容

#### Scenario: 首次展开目录
- **WHEN** 用户展开一个尚未加载子项的目录
- **THEN** 前端请求并插入该目录的直接子项
- **THEN** 已展开、选中和活动文件状态保持不变

### Requirement: 有界目录枚举
系统 MUST 对单次目录读取的条目数量和客户端自动加载深度设置明确上限，并在仍有条目时提供“继续加载”能力。

#### Scenario: 单目录超过条目上限
- **WHEN** 一个目录包含超过单次读取上限的条目
- **THEN** 系统只返回上限内的稳定排序条目及继续加载游标
- **THEN** 用户可继续加载下一批且不会产生重复节点

#### Scenario: 深层目录结构
- **WHEN** 恢复的展开路径超过自动加载深度上限
- **THEN** 系统停止自动递进并允许用户显式继续展开

### Requirement: 增量文件事件应用
系统 SHALL 将 watcher 的创建、修改、删除和重命名事件映射为基于稳定 path key 的局部文件树变更；单文件事件 MUST NOT 触发整个工作区树重建。

#### Scenario: 已加载目录中的单文件变更
- **WHEN** watcher 报告已加载目录内的单个文件被创建、修改或删除
- **THEN** 前端仅插入、更新或移除对应节点并保持排序
- **THEN** 无关节点的 DOM、展开状态和选中状态保持不变

#### Scenario: 文件或目录重命名
- **WHEN** watcher 提供可关联的 rename from/to 事件
- **THEN** 系统原子更新节点及其已加载后代的 path key
- **THEN** 活动文件、选中项和展开路径随之迁移

#### Scenario: 未加载目录中的事件
- **WHEN** watcher 报告的变更位于尚未加载的目录内
- **THEN** 系统标记该目录为待刷新而不加载其内容

### Requirement: 有界 watcher 事件管线
watcher 事件管线 MUST 使用有界队列和 backpressure，并 SHALL 在合并窗口内按 `path + kind` 合并可安全折叠的重复事件。

#### Scenario: 高频重复写入
- **WHEN** 同一路径在合并窗口内产生多次可合并的修改事件
- **THEN** 消费端最多收到一个等效增量更新

#### Scenario: 队列达到容量上限
- **WHEN** 生产事件速度超过消费者且队列容量耗尽
- **THEN** 系统记录溢出并丢弃可由重扫恢复的增量事件
- **THEN** 系统安排一次去重的受控重扫而非无界积压

### Requirement: 一致性恢复
系统 SHALL 处理 notify 批量事件和不完整重命名事件，并且只有在队列溢出、事件无法可靠解释或增量状态与磁盘不一致时重扫最小受影响子树。

#### Scenario: 批量 Git 操作
- **WHEN** Git checkout 或切换分支产生一批可解释事件
- **THEN** 系统合并并增量应用该批事件
- **THEN** 不执行工作区级全量重扫

#### Scenario: 增量状态不一致
- **WHEN** 事件引用不存在的已加载父节点或重命名配对无法恢复
- **THEN** 系统将最小共同已加载祖先标记为失效并重新读取
- **THEN** 同一失效范围内并发恢复请求被去重

### Requirement: 可配置忽略规则
系统 SHALL 默认忽略 `.git`、`node_modules`、`target` 和 `dist` 目录的扫描与监听事件，并允许用户通过设置调整忽略模式。

#### Scenario: 默认忽略目录高频写入
- **WHEN** 默认忽略目录内持续产生文件事件
- **THEN** watcher 管线不向前端发送这些事件
- **THEN** 文件树不因这些事件刷新

#### Scenario: 用户调整忽略规则
- **WHEN** 用户保存新的忽略模式
- **THEN** 后续目录读取和 watcher 过滤使用同一组规则
- **THEN** 已加载树对受影响范围执行一次受控同步

### Requirement: 文件树性能可观测性与基准
系统 MUST 记录目录扫描耗时、已加载节点数量、事件队列长度、队列溢出次数和刷新次数，并 SHALL 提供可重复的大目录性能基准。

#### Scenario: 收集运行指标
- **WHEN** 系统执行目录读取、事件合并或恢复重扫
- **THEN** 结构化日志包含操作范围、耗时、节点或事件数量及恢复原因

#### Scenario: 运行性能基准
- **WHEN** 开发者运行文件树性能基准
- **THEN** 基准覆盖 10k/100k 文件、`node_modules` 或 `target` 高频写入、批量 Git 操作、深层目录和单目录大量文件
- **THEN** 输出首屏扫描、事件处理和刷新计数等可比较结果

### Requirement: 大节点集合渲染门槛
系统 MUST 通过基准定义启用虚拟列表的客观阈值，并 MUST 记录支持的常规加载流程是否达到该阈值。当基准表明常规加载流程达到该阈值时，文件树 SHALL 在同一变更中引入窗口化；当懒加载和分页使基准保持低于阈值时，系统 MAY 不引入虚拟化，但 MUST 记录测量结论和后续触发条件。

#### Scenario: 可见节点超过虚拟化阈值
- **WHEN** 性能基准表明支持的常规加载流程会使可见节点数量超过经基准确定的阈值
- **THEN** 系统仅挂载视口及缓冲区所需节点
- **THEN** 键盘导航、选中、展开和滚动定位行为保持正确

#### Scenario: 懒加载保持低于虚拟化阈值
- **WHEN** 性能基准表明懒加载和分页后的常规加载流程保持低于阈值
- **THEN** 系统记录无需在本次变更引入虚拟化的测量结论
- **THEN** 文档保留达到阈值时引入窗口化的后续触发条件
