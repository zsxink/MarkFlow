# document-size-tier Specification

## Purpose
定义按文档大小分级、降级提示及可配置阈值的处理策略。

## Agent Context
- **源码入口：** `src/utils/file-size-tier.ts`、`src/ui/sidebar/fileops.ts` 与 `src/ui/status-bar.ts`。
- **关联规范：** `codemirror-source-editor`、`active-document-state`、`statusbar`。
- **不变量：** 分级必须发生在打开前；降级不应丢失原始内容；只读预览不得允许持久化编辑。
- **验证：** `npm test -- src/utils/__tests__/file-size-tier.test.ts`；`npx openspec validate document-size-tier --strict`。

## Requirements

### Requirement: 文档尺寸等级分类

系统 MUST 在打开前根据文件大小和行数将文档分为大小级别。阈值取自用户设置（见 `document-limits-settings`）并按以下方式派生，未配置时使用默认值（所见即所得文档大小 1MB、源码文档大小 10MB、最大行数 100 万）：

- Normal: file size ≤ 所见即所得文档大小 AND line count ≤ 最大行数
- Large: file size 超过所见即所得文档大小 且 ≤ 源码文档大小（行数不参与 Large 判定）
- Huge: file size > 源码文档大小 OR line count > 最大行数

#### Scenario: 文档正常打开，无降级

- **WHEN** 用户打开一个大小为 500KB、2000 行的文件
- **THEN** 编辑器以完全所见即所得模式打开，没有任何降级通知
- **THEN** 所有编辑器功能均可无限制使用

#### Scenario: 大文档显示建议

- **WHEN** 用户打开一个大小为 5MB、10000 行的文件（默认阈值下）
- **THEN** 编辑器打开时顶部显示非阻塞降级条，建议切换到源码模式
- **THEN** 因体积超过所见即所得文档大小（默认 1MB），文档以源码模式打开并提示准入上限
- **THEN** 用户可以关闭降级条

#### Scenario: 巨量文件需要确认

- **WHEN** 用户打开一个大小为 50MB、200000 行的文件
- **THEN** 显示确认对话框，其中包含文件大小、行数和两个选项：只读预览和强制打开
- **THEN** 如果用户选择只读预览，内容将显示为纯文本，无法编辑
- **THEN** 如果用户选择强制打开，编辑器将尝试在所有降级措施均处于活动状态的情况下打开
- **THEN** 持续可见的警告栏显示退化状态

#### Scenario: 手动超驰降级

- **WHEN** 文档处于降级模式（大或巨大）
- **THEN** 用户可以点击状态栏中的覆盖按钮来切换模式
- **THEN** 覆盖选项包括：强制所见即所得、强制源模式、重置为自动检测

### Requirement: 文件打开前预读取元数据
系统 MUST 在将完整文件内容加载到编辑器之前读取文件元数据（大小、行数）。

#### Scenario: 元数据读取成功
- **WHEN** 用户触发文件打开
- **THEN** 系统调用`file_metadata`命令获取文件大小和行数
- **THEN** 系统根据元数据确定大小等级
- **THEN** 系统根据层级决策继续加载内容

#### Scenario: 元数据读取失败
- **WHEN** `file_metadata` 命令返回错误
- **THEN** 系统应将该文件视为普通层
- **THEN** 系统应记录错误
- **THEN** 系统应显示有关元数据错误的非阻塞通知

### Requirement: 可配置阈值

尺寸等级分类的阈值 MUST 可在设置中配置，全部档位由三项设置派生：所见即所得文档大小（决定 Normal/Large 体积边界）、源码文档大小（决定 Large/Huge 体积边界）、最大行数（决定 Huge 行数边界）。输入校验规则见 `document-limits-settings`。

#### Scenario: 用户更改阈值

- **WHEN** 用户在设置中修改所见即所得文档大小或源码文档大小
- **THEN** 新阈值适用于下一次文件打开操作
- **THEN** 之前打开的文件不受影响

#### Scenario: 用户更改行数阈值

- **WHEN** 用户在设置中修改最大行数
- **THEN** 新行数阈值适用于下一次文件打开操作
- **THEN** 之前打开的文件不受影响

### Requirement: UI降级
系统 MUST 为降级模式提供清晰的 UI 指示器。

`src/ui/degradation-bar.ts` MUST 通过 `showDegradationBar` 在编辑器区域顶部显示大文件或只读提示，并通过 `hideDegradationBar` 移除该提示。可编辑的大文件提示 MUST 提供切换到源码模式的操作；只读提示不得提供该操作。

#### Scenario: 降级模式指示器可见
- **WHEN** 文档以 Large 或 Huge 层打开
- **THEN** 编辑器区域顶部有一个持续栏显示当前等级和原因
- **THEN** 该栏包含一个手动覆盖层级的按钮
- **THEN** 状态栏显示降级模式图标

#### Scenario: 大型等级的降级栏可取消
- **WHEN** 文档为大层
- **THEN** 用户可以关闭降级栏
- **THEN** 关闭后状态栏仍保留图标，可重新打开状态栏

#### Scenario: 根据只读状态显示降级栏操作
- **WHEN** `showDegradationBar` 以 `readOnly: true` 调用
- **THEN** 降级栏显示只读原因且不显示“切换到源码模式”按钮
- **WHEN** `showDegradationBar` 以可编辑大文件调用
- **THEN** 降级栏显示“切换到源码模式”按钮，点击后切换编辑器模式
