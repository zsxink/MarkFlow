# context-menu Specification (delta)

## ADDED Requirements

### Requirement: 节点类型专用菜单

当用户右键的命中区域位于特定节点类型（如表格单元格、图片、Mermaid/PlantUML 渲染块）时，系统 SHALL 提供该节点类型的专用菜单，仍通过统一 `showContextMenuStatic` API 创建，遵循本规范的 DOM 结构、定位与关闭交互。专用菜单内容 MUST 与节点能力对应：表格单元格菜单含行列增删、对齐与表头操作；图片菜单含图片编辑；渲染块菜单含导出与复制。触发专用菜单的主要命中必须与统一菜单（通用文本编辑项）正确分流，不得同时弹出两套菜单。

#### Scenario: 单元格右键弹出表格专用菜单
- **WHEN** 用户在表格单元格内右键
- **THEN** 弹出由 `showContextMenuStatic` 创建的表格专用菜单，含行列增删、对齐、表头切换、删除表格项
- **THEN** 不额外叠加通用文本菜单

#### Scenario: 渲染块右键弹出导出菜单
- **WHEN** 用户在 Mermaid/PlantUML 渲染块内右键
- **THEN** 弹出导出 SVG/PNG、复制等渲染块专用菜单
- **THEN** 菜单定位与关闭行为与通用菜单一致

#### Scenario: 非特殊节点右键走通用菜单
- **WHEN** 用户在普通段落文本上右键
- **THEN** 弹出通用文本编辑菜单，不出现节点专用项