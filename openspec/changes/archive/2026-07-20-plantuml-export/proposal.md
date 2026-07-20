## Why

PlantUML 图表在编辑器中已经具备完整的渲染能力（通过 HTTP 请求 PlantUML 服务器获取 SVG），但完全没有导出能力。而 Mermaid 图表已有完整的右键导出菜单（另存为 SVG/PNG、复制 SVG/PNG）。用户编辑 PlantUML 图表后无法保存或复制渲染结果，体验不一致。

## What Changes

- 新增 `plantumlContextMenu.ts`：PlantUML 图表的右键菜单模块，支持另存为 SVG、另存为 PNG、复制 SVG、复制 PNG
- 新增 `plantumlContextMenu.helpers.ts`：导出所需的辅助函数（SVG 尺寸解析、SVG→PNG 转换等）
- 修改 `editor.extensions.ts`：移除 PlantUML 右键菜单的拦截条件，允许 PlantUML 触发右键菜单
- 新增 `getPlantUmlExportBaseName()` 在 `editor.state.ts` 中
- 新增 `savePlantUmlSvgExport` / `savePlantUmlPngExport` 存储函数在 `storage.ts` 中

## Capabilities

### New Capabilities
- `plantuml-export`: PlantUML 图表右键导出为 SVG/PNG 或复制到剪贴板

### Modified Capabilities

无 spec 级别行为变更。`plantuml-render` 的渲染逻辑不变，只在已有渲染结果之上增加导出交互。

## Impact

- **新增文件**: `src/components/plantumlContextMenu.ts`、`src/components/plantumlContextMenu.helpers.ts`（及对应测试）
- **修改文件**: `src/lib/editor.extensions.ts`（第 351 行条件修改）、`src/lib/editor.state.ts`（新增辅助函数）、`src/lib/storage.ts`（新增存储函数）
- **无外部依赖变更**: 导出功能复用已有的 Tauri 保存对话框 API（`saveMermaidSvgExport` 同一套）
