## Why

README 中的功能列表与快捷键文档已落后于实际产品能力。用户打开 README 时无法了解项目目前支持的全部功能，影响新用户的认知和信任。

## What Changes

- README「功能特性」列表追加以下缺失功能：
  - PlantUML 图表渲染（含右键导出 SVG/PNG/复制图片）
  - 无障碍支持（ARIA 属性）
  - 右键菜单（文件树中的新建/重命名/复制/删除/移动操作）
  - 文件拖拽排序（文件系统级别拖拽移动）
  - URL 自动检测与链接渲染
  - 字体配置（在设置面板中自定义编辑器字体）
- 快捷键表中添加缺失的 `Ctrl+Shift+S`（另存为）
- 项目文档表格中删除重复的「UI 修复记录」行
- 考虑在 GFM 支持说明中提及 PlantUML 图表

## Capabilities

### New Capabilities
None — 本次变更不涉及代码功能的新增或修改，仅更新 README 文档内容。

### Modified Capabilities
None — 产品需求本身没有变化，README 同步到当前实际能力。

## Impact

- `README.md` — 主要变更文件
- 无代码、API、依赖或架构层面的影响
