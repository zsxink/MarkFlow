## 1. Rust Core: Export IR 数据结构

- [x] 1.1 定义 ExportDocument、ExportMetadata、ExportFrontMatter 等顶层结构（export_ir.rs）
- [x] 1.2 定义 ExportBlock 及 ExportBlockKind tagged enum（覆盖 heading/paragraph/list/blockquote/code_block/table/image/diagram/front_matter/unknown）
- [x] 1.3 定义 ExportAsset（资源引用描述）
- [x] 1.4 定义 ExportDiagnostic 及诊断代码枚举（EXPORT_IR_UNSUPPORTED_BLOCK / UNSUPPORTED_DIAGRAM / UNSAFE_FRONTMATTER）
- [x] 1.5 定义 ExportRange、LineRangeDto 位置表示类型
- [x] 1.6 实现 Serialize/Deserialize 为前端 JSON 传输做准备

## 2. Rust Core: build_export_document 方法

- [x] 2.1 实现 `CoreSession::build_export_document(request: ExportRequest)` 方法
- [x] 2.2 从 Core 文档状态解析块结构并映射为 ExportBlock
- [x] 2.3 提取 FrontMatter 元数据到 ExportFrontMatter
- [x] 2.4 提取资源引用到 ExportAsset 列表
- [x] 2.5 构建诊断信息列表
- [x] 2.6 Revision 可用性校验（不存在时返回 RevisionMismatch）

## 3. Tauri 桥接: get_export_document 命令

- [x] 3.1 新增 `get_export_document` Tauri 命令（core_bridge.rs）
- [x] 3.2 实现 max_schema_version 校验（过低时返回 UnsupportedExportIrVersion）
- [x] 3.3 前端 ExportOptionsDto 参数支持（max_schema_version、include_diagnostics）
- [x] 3.4 新增 AppErrorCode::UnsupportedExportIrVersion 错误类型

## 4. TypeScript 前端: DTO 定义与桥接

- [x] 4.1 定义 ExportDocumentDto、ExportBlockDto、ExportBlockKindDto 等 TypeScript 接口（coreBridge.ts）
- [x] 4.2 定义 ExportAssetDto、ExportDiagnosticDto、ExportRangeDto、ExportOptionsDto
- [x] 4.3 实现 `getExportDocument()` 桥接函数
- [x] 4.4 导出 EXPORT_IR_SCHEMA_VERSION 常量

## 5. TypeScript 前端: Export IR 渲染器

- [x] 5.1 实现 `exportIrRenderer.ts` 核心渲染函数
- [x] 5.2 按 ExportBlockKind 类型渲染对应 HTML 标记
- [x] 5.3 支持 heading/paragraph/list/blockquote/code_block/table/image/diagram/front_matter/unknown 等块类型

## 6. TypeScript 前端: 导出流程集成

- [x] 6.1 `documentExport.ts` 实现 IR 优先路径（buildConfirmedRevisionHtml）
- [x] 6.2 flush CoreSession 后获取 ExportDocument
- [x] 6.3 IR 响应校验（session_id / base_revision / export_request_id）
- [x] 6.4 带 diagnostic 信息记录
- [x] 6.5 DOM 快照 fallback 保留

## 7. 测试

- [x] 7.1 Rust 集成测试（tests/export_ir.rs：Export IR 构建与数据结构验证）
- [x] 7.2 前端 coreBridge.test.ts（getExportDocument 调用）
- [x] 7.3 前端 coreSession.test.ts（集成 flush + export）
- [x] 7.4 前端 documentExport.test.ts（IR 路径导出）
- [x] 7.5 前端 exportIrRenderer.test.ts（IR → HTML 渲染）
