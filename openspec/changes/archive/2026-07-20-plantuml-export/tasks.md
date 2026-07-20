## 1. Helpers & 工具函数

- [x] 1.1 在 `editor.state.ts` 中新增 `getPlantUmlExportBaseName()` 函数（参考 `getMermaidExportBaseName()`）
- [x] 1.2 创建 `plantumlContextMenu.helpers.ts` 及对应测试文件
- [x] 1.3 在 `storage.ts` 中导出 PlantUML 保存函数 `savePlantUmlSvgExport` / `savePlantUmlPngExport`

## 2. Context Menu 组件

- [x] 2.1 创建 `plantumlContextMenu.ts`，实现右键菜单 4 项功能（另存为 SVG、另存为 PNG、复制 SVG、复制 PNG）
- [x] 2.2 实现 SVG→PNG 转换函数（`svgToPngBlob`、`blobToBase64`）
- [x] 2.3 实现 SVG/PNG 复制函数（`copySvg`、`copyPng`）
- [x] 2.4 实现保存回调（`saveSvg`、`savePng`）

## 3. 编辑器集成

- [x] 3.1 修改 `editor.extensions.ts` 右键条件，允许 PlantUML 触发菜单
- [x] 3.2 在 PlantUML 右键路径下调用 `showPlantumlContextMenu()`

## 4. Rust 后端

- [x] 4.1 在 `files.rs` 中新增 `save_plantuml_svg_export` 和 `save_plantuml_png_export` Tauri command
- [x] 4.2 在 `lib.rs` 中注册这两个 command

## 5. 测试

- [x] 5.1 测试 `editor.state.ts` 中的 `getPlantUmlExportBaseName()`
- [x] 5.2 测试 `plantumlContextMenu.helpers.ts` 中的辅助函数
- [x] 5.3 运行 `npm test` 确保无回归

## 6. 验证

- [x] 6.1 `npx tsc --noEmit` 通过
- [x] 6.2 `npx vitest run` 全部通过（274 tests）
- [x] 6.3 `cargo check`（Rust 后端）通过
