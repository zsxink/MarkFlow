# dialog-system Specification (Delta)

## Purpose
This delta spec documents the DOM structure changes in the settings panel: tab reorganization, removal of the livePreview toggle, image panel form element changes, and PlantUML layout adjustments.

## Agent Context
Same as `openspec/specs/dialog-system/spec.md`.

## ADDED Requirements

### Requirement: 设置面板标签页调整

设置面板 SHALL 使用调整后的标签页结构，反映编辑器设置与通用设置分离的布局。

#### Scenario: 编辑器标签页包含拼写检查和自动换行
- **WHEN** 设置面板打开
- **AND** 用户点击「编辑器」标签页
- **THEN** 该标签页包含以下设置组：Markdown（代码高亮）、代码块（行号、自动换行）、PlantUML（服务器地址）、界面（默认展开侧边栏、工具栏提示）
- **AND** 拼写检查和自动换行不再出现在「通用」标签页中

#### Scenario: 通用标签页精简
- **WHEN** 设置面板打开
- **AND** 用户点击「通用」标签页
- **THEN** 该标签页仅包含：文件（自动保存、自动保存间隔）、文件树性能（忽略目录、单次加载条目、自动恢复展开深度）
- **AND** 拼写检查和自动换行已移出

### Requirement: LivePreview 开关移除

设置面板的编辑器标签页 SHALL 不再包含「实时预览」开关。

#### Scenario: 没有实时预览开关
- **WHEN** 设置面板打开
- **AND** 用户查看「编辑器」标签页
- **THEN** Markdown 设置组中只有「代码高亮」开关
- **AND** 没有「实时预览」开关或相关文字

### Requirement: 图片面板新的表单元素

图片设置面板 SHALL 使用新的枚举选项替代旧的布尔值和松散字符串控件。

#### Scenario: 图片面板本地文件行为
- **WHEN** 设置面板打开
- **AND** 用户点击「图片」标签页
- **THEN** 存在以下设置组：存储（存放位置、自定义路径）、本地图片行为（「复制到存储位置」/「保留原始路径」）、网络图片行为（「保留 URL」/「下载到存储位置」）、引用路径（「相对路径」/「绝对路径」）、命名策略
- **AND** 不再有「对本地图片应用」和「对网络图片应用」开关
- **AND** 不再有「优先使用相对路径」开关
- **AND** 不再有「无特殊操作」选项

#### Scenario: 自定义路径支持更多格式
- **WHEN** 图片面板显示「自定义路径」输入框
- **THEN** 占位文本为 `./images, ../assets, /absolute/path, D:\Pictures`
- **AND** 描述文字更新为：「支持相对路径（相对于文档）、绝对路径、Windows 盘符路径和 UNC 路径」

### Requirement: PlantUML 服务器地址布局调整

PlantUML 服务器地址设置 SHALL 使用改进的布局：风险提示独立一行，默认服务器地址以可选择文本显示，输入框放在所有说明下方。

#### Scenario: PlantUML 设置布局
- **WHEN** 设置面板打开
- **AND** 用户查看 PlantUML 设置
- **THEN** 风险提示文字在单独一行显示
- **AND** 默认服务器地址（`https://www.plantuml.com/plantuml`）以可选择文本形式呈现
- **AND** 输入框在所有说明文字下方排列

### Requirement: 设置面板垂直布局样式

系统 SHALL 为带有较长描述文字的设置项提供可复用的垂直布局样式。

#### Scenario: 垂直布局样式应用
- **WHEN** 设置项描述文字超过一行
- **THEN** 文字标签和控件垂直排列（非水平排列）
- **AND** 描述文字间距和字体大小与其他设置项一致
