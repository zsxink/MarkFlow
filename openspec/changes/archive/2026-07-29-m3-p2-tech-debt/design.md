## Context

M3 完成度复核（core-m3-review）识别出 6 项 P2 技术债务。这些不属于 M3 的验收标准，但长期积累会增加维护成本。同时滞留的 review-core-docs-and-specs 变更已先行归档。

## Goals / Non-Goals

**Goals:**
- scanner.rs（655 行）拆分为 line_scanner + block_parser 两个模块
- 6 个图片/文档导出命令统一为 `save_export` + `ExportKind` enum
- exportTheme.ts（624 行）、fileTree.core.ts（770 行）合理拆分
- docxExport.ts 中 10 处 `any` 替换为具体类型
- source-lifecycle-guard / source-patch-adapter / source-sync-controller 合并为 source-mode-core spec
- runtime-document-service / save-integrity 合并到 markflow-runtime spec

**Non-Goals:**
- 不改动功能性行为
- 不进行大规模重构（如 scanner.rs 整体重写）
- 不涉及 M4-M8 产品功能变更

## Decisions

### scanner.rs 拆分方案

将 655 行 scanner.rs 拆为两个模块：

- **line_scanner.rs**：底层行级工具（LineInfo、collect_lines、count_leading_spaces、is_space、ListMarker）——约 70 行
- **block_parser.rs**：BlockScanner 结构体 + 所有扫描/检测方法——剩余约 585 行

保留 `scanner.rs` 作为 re-exports 的 facade 模块以最小化导入变更，或者直接创建两个新文件并更新 mod.rs。选择后者以减少间接层。

### 导出命令统一方案

当前 6 个命令（save_mermaid_svg_export、save_mermaid_png_export、save_plantuml_svg_export、save_plantuml_png_export、save_image_export、save_document_export）模式高度重复。统一为单一命令：

```rust
#[tauri::command]
pub async fn save_export(
    data: String,
    file_name: String,
    extension: String,
    is_binary: bool,
    app: AppHandle,
) -> Result<bool, String>
```

前端传入 type 区分，后端统一处理 base64/text 分派。保留 `select_export_path` 工具函数。

### 前端文件拆分

- **exportTheme.ts**（624 行）→ 按 theme group 拆为 `exportTheme.ts`（types/defaults）+ `exportThemeCustom.ts`（custom theme）
- **fileTree.core.ts**（770 行）→ 按功能拆为 `fileTree.core.ts`（core logic）+ `fileTree.sort.ts`（sort/filter）

### Spec 合并

两个合并目标：

1. **source-mode-core spec**（合并现有 3 份 spec）
   - source-lifecycle-guard
   - source-patch-adapter
   - source-sync-controller
   - 保留其 requirements 不变，组织为三个 section

2. **markflow-runtime spec**（合并现有 2 份 spec）
   - runtime-document-service
   - save-integrity
   - 追加到已有 markflow-runtime spec 中

合并后旧 spec 标注 Deprecated 指向新的主 spec。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| scanner.rs 拆分导致外部导入路径变更 | 在 mod.rs 中统一 re-export，保持 `parse_index::scanner::` 路径可用 |
| 导出命令统一需要更新前端调用方 | 保留旧命令名作为透传包装，标记 #[deprecated] |
| 前端文件拆分影响 tree-shaking | 拆分前确认导入关系，避免循环依赖 |
| Spec 合并后 archive 可能报 header 不匹配 | 直接在主 spec 上操作并删除旧 spec，而非使用 MODIFIED delta |
