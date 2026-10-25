## MODIFIED Requirements

### Requirement: 设置页快捷键标签按平台渲染
设置面板的快捷键分类 MUST 使用运行平台对应的修饰键格式展示快捷键，并与界面其他快捷键提示遵循相同的格式约定：macOS 使用符号形态（`⌘` `⇧` `⌥` `⌃`），其他平台使用名称形态（`Ctrl` `Shift` `Alt`）。

#### Scenario: 设置中的 macOS 快捷键
- **WHEN** 应用运行于 macOS 且用户查看设置面板的快捷键分类
- **THEN** 修饰键显示为 macOS 符号形态

#### Scenario: 设置中的非 macOS 快捷键
- **WHEN** 应用运行于非 macOS 桌面平台且用户查看设置面板的快捷键分类
- **THEN** 修饰键显示为 Ctrl、Shift、Alt 等名称形态
