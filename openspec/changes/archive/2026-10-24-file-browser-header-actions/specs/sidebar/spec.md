# Spec Delta

## MODIFIED Requirements

### Requirement: 侧边栏底部操作栏布局

文件选项卡中的底部操作栏 MUST 仅保留「打开文件夹」按钮，占满可用宽度，按钮文字不得换行。新建入口由文件浏览器头部工具行承载（见 `file-tree-architecture` 的「文件浏览器头部工具行」requirement）。

#### Scenario: 底部操作按钮均分宽度

- **WHEN** 文件选项卡显示侧边栏底部操作栏
- **THEN** 操作栏仅含「打开文件夹」按钮，占满可用宽度，文字保持单行并居中
