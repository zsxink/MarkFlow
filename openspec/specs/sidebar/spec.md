# sidebar Specification

## Purpose
定义 MarkFlow 侧边栏的完整行为，包括 UI 初始化、文件操作（保存/另存为）、外部变更检测与冲突解决。

## Agent Context
- **源码入口：** `src/components/sidebar.ts`、`src/components/sidebar.fileops.ts`、`src/components/fileTree.ts`。
- **关联规范：** `active-document-state`、`file-tree-architecture`、`atomic-save`、`dialog-system`。
- **不变量：** 文件切换前必须处理未保存修改；外部冲突不得静默覆盖本地内容；折叠侧边栏不得保留布局空白。
- **验证：** `npm test -- src/components/sidebar.test.ts src/components/fileTree.core.test.ts`；`npx openspec validate sidebar --strict`。

## Requirements

### Requirement: 侧边栏UI初始化
系统 MUST 通过安装用于文件树和大纲交互、选项卡切换和侧边栏调整大小的事件侦听器来初始化侧边栏 UI。

#### Scenario: Init侧边栏挂载事件监听器
- **WHEN** `initSidebar()` 被调用
- **THEN** 文件树和大纲组件应初始化
- **THEN** 侧边栏应监听右键单击上下文菜单事件
- **THEN** "open folder" 按钮应触发文件夹选择对话框
- **THEN** "new folder" 按钮应触发内联文件夹创建
- **THEN** 选项卡单击应在文件和大纲视图之间切换

#### Scenario: 调整手柄大小可调整宽度
- **WHEN** 用户拖动侧边栏大小调整手柄
- **THEN** 侧边栏宽度应在 200px 和 400px 之间变化
- **WHEN** 侧边栏已折叠
- **THEN** 拖动调整大小手柄将被忽略

### Requirement: 侧边栏布局、折叠与宽度

侧边栏 MUST 使用由内容宽度决定的 Grid 列，以便折叠后不保留空白列。展开时侧边栏默认宽度为 250px、最小宽度为 200px；用户调整后的宽度 MUST 限制在 200px 至 400px。折叠时侧边栏宽度和最小宽度均为 0，且移除右边框。

#### Scenario: 折叠侧边栏不保留空白
- **WHEN** 用户通过工具栏切换侧边栏为折叠状态
- **THEN** 侧边栏不占据可见宽度，编辑区域填充释放出的空间
- **THEN** 工具栏按钮图标更新为展开侧边栏的状态

#### Scenario: 展开后的选项卡不改变侧边栏宽度
- **WHEN** 侧边栏在展开状态下从文件选项卡切换到大纲选项卡，或反向切换
- **THEN** 侧边栏保持当前宽度，且不小于 200px

### Requirement: 侧边栏底部操作栏布局

文件选项卡中的底部操作栏 MUST 将“打开文件夹”和“新建文件夹”按钮等宽排列，按钮文字不得换行。

#### Scenario: 底部操作按钮均分宽度
- **WHEN** 文件选项卡显示侧边栏底部操作栏
- **THEN** 两个操作按钮各占可用宽度的一半，文字保持单行并居中

### Requirement: 文件转换确认
当用户尝试切换到另一个文件而当前文档有未保存的更改或外部冲突时，系统 MUST 显示确认模式。

#### Scenario: 切换前确认未保存的更改
- **WHEN** 用户尝试切换文件
- **AND** 当前文档已脏
- **THEN** 模态将与 "Save"、"Discard" 和 "Cancel" 选项一起出现
- **WHEN** 用户点击"Save"
- **THEN** 继续之前应保存文档

#### Scenario: 与外部冲突确认
- **WHEN** 用户尝试切换文件
- **AND** 当前文档有外部修改
- **THEN** the modal title SHALL be "外部修改冲突"
- **THEN** 模式应显示保存/放弃/取消选项

#### Scenario: 清洁时跳过确认
- **WHEN** 用户尝试切换文件
- **AND** 当前文档没有脏，没有外部修改
- **THEN** 过渡将在不显示模式的情况下进行

### Requirement: 活动文件路径状态管理
系统 MUST 管理活动文件路径状态并将其与文件树 UI 同步。

#### Scenario: 设置活动文件路径更新树选择
- **WHEN** `setActiveFilePath(path)` 被调用
- **THEN** 文件树应突出显示匹配的文件节点
- **THEN** `getActiveFilePath()` 应返回新路径

#### Scenario: 清除活动文档重置状态
- **WHEN** `clearActiveDocument()` 被调用
- **THEN** 活动文件路径应设置为空
- **THEN** 编辑内容SHALL被清除
- **THEN** 大纲须刷新
- **THEN** 树选择应被清除

#### Scenario: 重写活动文档路径
- **WHEN** 目录被重命名
- **AND** `rewriteActiveDocumentPath(from, to)` 被调用
- **THEN** 活动文件路径应更新以反映新的路径前缀

#### Scenario: 如果路径匹配则清除活动文档
- **WHEN** 文件或目录被删除
- **AND** 匹配活动文档路径
- **THEN** `clearActiveDocumentIfMatches(path)` 应清除活动文档

### Requirement: 保存活动文档
The system SHALL save the currently active document to disk atomically, handling both existing files and new files without a path. Save operations SHALL be serialized — at most one save SHALL be in progress at any time.

#### Scenario: 保存现有文件
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 活动文件有已知路径
- **THEN** 内容应以原子方式写入该路径的磁盘
- **THEN** 仅当写入期间没有发生更新的编辑时，文档才应标记为持久
- **THEN** 祝酒成功

#### Scenario: 保存新文件提示路径
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 活动文件没有路径
- **AND** `interactive` 是真的
- **THEN** 将显示保存对话框以选择文件路径
- **THEN** 内容应自动写入所选路径
- **THEN** 活动文件路径应更新

#### Scenario: 保存文件时出现外部修改警告
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 文件有外部修改（通过 mtime + 大小检查检测到）
- **AND** `interactive` 是真的
- **THEN** 确认对话框将询问是否覆盖
- **WHEN** 用户取消
- **THEN** 保存将被中止

#### Scenario: 跳过并发保存
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 之前的保存已在进行中
- **THEN** 新的保存请求将被跳过（不排队）
- **THEN** 文档应保持脏状态，因此下一次自动保存勾选或手动保存将保留它

#### Scenario: 保存失败保留脏状态
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 原子写入失败
- **THEN** 文档应保持脏状态
- **THEN** 应显示错误消息（交互模式）或应写入日志条目（非交互模式）
- **THEN** 磁盘上的原始文件应保持不变

#### Scenario: 保存并跟踪修订
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 在开始保存之后但尚未完成之前对内容进行了编辑
- **THEN** 保存完成后文档将保持脏状态
- **THEN** 只有实际持久化的内容才应被标记为最后持久化版本

### Requirement: 从磁盘重新加载活动文档
系统 MUST 从磁盘重新加载活动文档内容，丢弃内存中的更改。

#### Scenario: 重新加载强制放弃更改
- **WHEN** `reloadActiveDocumentFromDisk({ force: true })` 被调用
- **THEN** 文件应从磁盘重新读取
- **THEN** 编辑器内容将替换为磁盘内容

#### Scenario: 文档脏时重新加载中止
- **WHEN** 在没有 `force` 的情况下调用 `reloadActiveDocumentFromDisk()`
- **AND** 文档脏了
- **THEN** 重新加载将被中止并返回 false

### Requirement: 通过mtime检测外部修改
The system SHALL detect external file modifications by comparing the file's `mtime` and `size` against the values recorded when the file was last read or saved.

#### Scenario: 保存前检测到外部修改
- **WHEN** `saveActiveDocument()` 被调用
- **AND** 文件当前的生成时间或大小与上次记录的值不同
- **THEN** 该文件应被视为外部修改

#### Scenario: 成功保存更新mtime快照
- **WHEN** `saveActiveDocument()` 顺利完成
- **THEN** 文件的生成时间和大小将被记录作为新的基线以供将来比较

### Requirement: 串口自动保存调度
自动保存机制 MUST 串行化以防止重叠写入。

#### Scenario: 保存时自动跳过
- **WHEN** 自动保存定时器启动
- **AND** 保存已在进行中
- **THEN** 自动保存勾选应被跳过
- **THEN** 文档将在下一个刻度保持脏状态

#### Scenario: 自动保存不会对多个写入进行排队
- **WHEN** 用户在自动保存期间编辑内容
- **THEN** 当前保存完成后最多触发一次额外保存

### Requirement: 在编辑器中打开文件
系统 MUST 在编辑器中打开文件，并在文件已打开时处理特殊情况。

#### Scenario: 打开新文件
- **WHEN** `openFileInEditor(path)` 被调用
- **AND** 文件尚未打开
- **THEN** 文件内容应从磁盘读取
- **THEN** 编辑器SHALL显示内容
- **THEN** 活动文件路径应更新

#### Scenario: 重新打开经过外部修改的活动文件
- **WHEN** `openFileInEditor(path)` 被调用
- **AND** 文件已激活
- **AND** 有外部修改但没有脏编辑
- **THEN** 文件应从磁盘重新加载

#### Scenario: 重新打开有冲突的活动文件
- **WHEN** `openFileInEditor(path)` 被调用
- **AND** 文件已激活
- **AND** 既有外部修改又有脏编辑
- **THEN** 应显示冲突对话框

### Requirement: 新建文件和文件夹

系统 MUST 通过 `src/components/newFileDialog.ts` 的 `showNewFileDialog` 创建文件或文件夹。有工作区时，系统 MUST 在工作区根目录创建条目、增量更新文件树并在创建文件后打开它；没有工作区时，系统 MUST 使用系统文件或目录选择对话框。

#### Scenario: 在工作区中新建文件
- **WHEN** 用户在已打开工作区中确认新建 Markdown 文件名
- **THEN** 系统创建带 `.md` 后缀的文件、将节点插入文件树并在编辑器中打开该文件

#### Scenario: 在工作区中新建文件夹
- **WHEN** 用户在已打开工作区中确认新建文件夹名
- **THEN** 系统创建文件夹并将其节点插入文件树

#### Scenario: 无工作区时新建条目
- **WHEN** 用户没有打开工作区而发起新建文件或文件夹
- **THEN** 系统显示相应的系统选择对话框，而不显示工作区内嵌创建对话框

### Requirement: 处理外部文件删除
The system SHALL detect and handle cases where the active document's file has been deleted externally.

#### Scenario: 清理外部删除的文档
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 活动文档没有脏，没有外部修改
- **THEN** 活动文档应被清除
- **THEN** 函数应返回`'cleared'`

#### Scenario: 外部删除的脏文档 — 丢弃
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 活动文档脏或有外部修改
- **AND** 用户选择"discard"
- **THEN** 活动文档应被清除
- **THEN** 函数应返回`'discarded'`

#### Scenario: 外部删除的脏文档 — 重新保存
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 活动文档脏或有外部修改
- **AND** 用户选择"resave"
- **THEN** 内容应写回磁盘
- **THEN** 函数应返回`'resaved'`

#### Scenario: 无关删除被忽略
- **WHEN** `handleExternalDeletion(path)` 被调用
- **AND** 路径与活动文档不匹配
- **THEN** 函数应返回`'ignored'`

### Requirement: 处理外部文件修改
The system SHALL detect and handle cases where the active document's file has been modified externally.

#### Scenario: 清理外部修改的文档——自动重新加载
- **WHEN** `handleActiveDocumentExternalModification()` 被调用
- **AND** 活动文档没有脏
- **THEN** 文件应自动从磁盘重新加载
- **THEN** 函数应返回`'reloaded'`

#### Scenario: 外部修改脏文档——冲突对话框
- **WHEN** `handleActiveDocumentExternalModification()` 被调用
- **AND** 活动文档脏了
- **THEN** 应显示一个冲突对话框，其中包含选项："keep current"、"load disk version"、"save as"

#### Scenario: 冲突对话框-加载磁盘版本
- **WHEN** 用户选择"load disk version"
- **THEN** 文件应从磁盘重新加载，丢弃内存中的更改

#### Scenario: 冲突对话框-另存为新文件
- **WHEN** 用户选择"save as"
- **THEN** 将显示保存对话框以选择新的文件路径
- **THEN** 当前内容应写入新路径

#### Scenario: 冲突对话——保持最新
- **WHEN** 用户选择"keep current"
- **THEN** 内存中的内容应按原样保留
- **THEN** 函数应返回`'kept'`
