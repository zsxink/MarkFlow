## 1. scanner.rs 拆分

- [x] 1.1 从 scanner.rs 中提取 LineInfo、collect_lines、count_leading_spaces、is_space、ListMarker 到 line_scanner.rs
- [x] 1.2 重命名 scanner.rs 为 block_parser.rs（BlockScanner + 所有检测方法）
- [x] 1.3 更新 mod.rs 导入，保持 scanner 模块对外可见

## 2. 导出命令统一

- [x] 2.1 在 files.rs 中添加 `ExportKind` enum（Svg, Png, Markdown, Html, Image, Binary）
- [x] 2.2 添加统一 `save_export` 命令接收 kind + data + file_name + extension
- [x] 2.3 更新前端调用方（搜索 `invoke.*save_mermaid\|invoke.*save_plantuml\|invoke.*save_image\|invoke.*save_document_export`）
- [x] 2.4 旧命令保留为包装器，添加 `#[deprecated]` 注解

## 3. TypeScript 大文件拆分

- [x] 3.1 exportTheme.ts 拆分：将 BuiltInTheme 和 default theme 保留在 exportTheme.ts，custom theme 部分移到 exportThemeCustom.ts
- [x] 3.2 fileTree.core.ts 拆分：sort / filter / state 逻辑移到 fileTree.sort.ts

## 4. docxExport.ts 类型安全

- [x] 4.1 将所有 `any` 替换为具体类型（IPropertiesOptions、INumberingOptions、IImageRunOptions 等 docx 库类型）

## 5. Core 相关 spec 合并

- [x] 5.1 创建 `source-mode-core` spec，合并 source-lifecycle-guard + source-patch-adapter + source-sync-controller 的 requirements
- [x] 5.2 追加 runtime-document-service + save-integrity 合并到 markflow-runtime spec
- [x] 5.3 标记旧 spec 为 Deprecated

## 6. 验证

- [x] 6.1 所有 Rust 测试通过（cargo test --all-targets）
- [x] 6.2 所有 TypeScript 测试通过（npm test）
- [x] 6.3 构建通过（npm run build + cargo clippy --all-targets -- -D warnings）
