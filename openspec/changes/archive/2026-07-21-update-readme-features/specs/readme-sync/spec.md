## ADDED Requirements

### Requirement: README 功能特性覆盖产品 P0 功能
README「功能特性」列表 SHALL 覆盖 product-spec.md 中标记为 P0 的所有功能。
README SHALL 补充以下已实现但未文档化的功能：

- PlantUML 图表渲染（支持右键导出 SVG/PNG/复制图片）
- 无障碍支持（ARIA 属性）
- 文件右键菜单操作
- 文件拖拽排序
- URL 自动检测与链接渲染
- 编辑器字体配置

#### Scenario: 用户查阅 README 了解 PlantUML 功能
- **WHEN** 用户阅读 README 的功能特性部分
- **THEN** README 中列出 PlantUML 图表渲染支持

#### Scenario: 用户查阅 README 了解快捷键
- **WHEN** 用户阅读 README 的快捷键表格
- **THEN** 表格包含 `Ctrl+Shift+S`（另存为）

#### Scenario: 用户查阅项目文档索引
- **WHEN** 用户阅读 README 的项目文档表格
- **THEN** 表格中没有重复行

### Requirement: README 内容准确性
README 中的功能描述 SHALL 与当前产品行为一致。

#### Scenario: 功能特性验证
- **WHEN** 对比 README 功能列表与 openspec/specs/product-spec.md 的 P0 功能清单
- **THEN** 所有 P0 功能在 README 中均有对应条目
