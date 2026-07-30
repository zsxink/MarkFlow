## Why

现有导出流程（PDF/DOCX/HTML）直接从 ProseMirror DOM 或 WYSIWYG 渲染快照生成输出，缺乏统一的中间表示层。这导致：各导出格式各自解析文档结构、重复相同的块类型判断逻辑、FrontMatter/Range 等信息无法统一传递。新增 Export IR（导出中间表示）作为文档模型与导出格式之间的标准化桥梁，解耦核心与导出层，使未来新增格式无需重复解析逻辑。

## What Changes

- **新增 Export IR 核心数据结构**（Rust `markflow-core/src/document/export_ir.rs`）
  - `ExportDocument`：顶层容器，包含 schema version、元数据、块列表、资源列表、诊断信息
  - `ExportBlock` 及 `ExportBlockKind`：覆盖全部文档块类型（heading、paragraph、list、blockquote、code_block、table、image、diagram、front_matter）
  - `ExportAsset`：图片等外部资源引用描述
  - `ExportDiagnostic`：导出时发现的问题（不支持块类型、不安全 FrontMatter 等）
  - `ExportRange` / `LineRangeDto`：文档位置的统一表示
  - `ExportFrontMatter`：FrontMatter 导出格式
- **新增 `build_export_document` 方法**（Rust `CoreSession` API）从 Core 文档状态构建 Export IR 快照
- **新增 Tauri 命令 `get_export_document`**，前端通过 `coreBridge.ts` 调用
- **新增 `exportIrRenderer.ts`**：将 Export IR 渲染为 HTML 内容（前端层）
- **前端 `documentExport.ts` 接入**：优先使用 Export IR 而非 DOM 快照进行导出
- **诊断系统**：Export IR 可携带警告/错误诊断，前端可据此显示导出问题
- **Schema versioning**：Export IR 带 schema_version 字段，支持向前兼容

## Capabilities

### New Capabilities

- `export-ir`: Export IR（导出中间表示）核心数据结构和序列化协议，作为文档模型与导出格式之间的标准化中间层

### Modified Capabilities

- `rendered-document-export`: 导出流程改为优先通过 Core Export IR 获取结构化文档数据，再渲染为 HTML；增加了 IR-based 路径，DOM 快照路径保留为 fallback（当 Core 会话不可用时）
- `docx-export`: 导出数据源改为 Export IR 渲染的 HTML（而非 DOM 快照）
- `pdf-export`: 同上，数据源改为 Export IR 渲染的 HTML
- `html-export`: 同上，数据源改为 Export IR 渲染的 HTML

## Impact

- `markflow-core/src/document/export_ir.rs`：新增 542 行核心模块
- `markflow-core/src/document/types.rs`：新增 18 行类型扩展
- `markflow-core/src/document/mod.rs`：集成导出模块
- `markflow-core/src/lib.rs`：公共 API 导出
- `markflow-core/tests/export_ir.rs`：195 行集成测试
- `src-tauri/src/commands/core_bridge.rs`：新增 `get_export_document` 命令（155 行）
- `src-tauri/src/error.rs`：新增 `AppErrorCode::UnsupportedExportIrVersion`
- `src/lib/coreBridge.ts`：新增 Export IR 相关 DTO 和 `getExportDocument` 调用（133 行）
- `src/lib/coreSession.ts`：集成 flush + export（18 行）
- `src/lib/documentExport.ts`：新增 IR-based 导出路径（69 行）
- `src/lib/exportIrRenderer.ts`：新增 78 行 IR → HTML 渲染器
- `src/components/toolbar.ts`：工具栏适配（16 行）
- 配套测试文件 4 个（~263 行）
