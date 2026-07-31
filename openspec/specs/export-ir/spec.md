# export-ir Specification

## Purpose
定义 Export IR（导出中间表示）的数据结构、构建协议和版本兼容性策略。Export IR 是 Core 文档模型与导出格式之间的标准化中间层，将文档内容转换为结构化 JSON 后经 Tauri 桥接传输到前端，供各导出格式消费。

## Requirements

### Requirement: ExportDocument 顶层结构
Export IR SHALL 以 `ExportDocument` 为顶层容器，包含 schema_version、session_id、document_id、base_revision、export_request_id、metadata、blocks、assets 和 diagnostics 字段。所有字段 SHALL 直接序列化为 JSON。

#### Scenario: ExportDocument 结构完整
- **WHEN** 系统构建 Export IR
- **THEN** ExportDocument SHALL 包含 `schema_version`、`session_id`、`document_id`、`base_revision`、`export_request_id` 场
- **AND** SHALL 包含 `metadata`、`blocks`、`assets`、`diagnostics` 列表

#### Scenario: ExportDocument 序列化
- **WHEN** ExportDocument 通过 Tauri IPC 传输到前端
- **THEN** 所有字段 SHALL 被正确定义为 Rust `Serialize`/`Deserialize`
- **AND** 前端 TypeScript 接口 SHALL 与 Rust 结构体一一对应

### Requirement: Schema 版本兼容
Export IR SHALL 包含 `schema_version`（当前版本为 1）。前端调用 `get_export_document` 时 SHALL 声明 `max_schema_version`，当后端版本高于前端声明的最大版本时 SHALL 返回 `UnsupportedExportIrVersion` 错误。Schema 演进须保持向后兼容，新增字段须加 `#[serde(default)]`。

#### Scenario: 版本匹配
- **WHEN** 前端声明 `max_schema_version=1`，后端当前版本为 1
- **THEN** 系统 SHALL 返回 schema_version=1 的 ExportDocument
- **AND** 不报错

#### Scenario: 前端版本过低
- **WHEN** 前端声明 `max_schema_version=0`，后端当前版本为 1
- **THEN** 系统 SHALL 返回 `UnsupportedExportIrVersion` 错误
- **AND** 不生成 ExportDocument

#### Scenario: 前端版本高于后端
- **WHEN** 前端声明 `max_schema_version=3`，后端当前版本为 1
- **THEN** 系统 SHALL 正常返回 schema_version=1 的 ExportDocument
- **AND** 不报错

### Requirement: ExportBlock 块类型覆盖
Export IR SHALL 以 `ExportBlock` 表示文档中的每个内容块，通过 `ExportBlockKind` 的 tagged enum 区分块类型。支持的块类型 SHALL 包括：heading、paragraph、list、blockquote、code_block、table、image、diagram、front_matter、unknown。每个块 SHALL 包含 `id`、`kind`、`source_range`、`content_range`、`line_range` 和 `source`（原始文本）。

#### Scenario: 标题块
- **WHEN** 文档包含 H1-H6 标题
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "heading", level, title }`
- **AND** source_range SHALL 对应标题行在文档中的位置

#### Scenario: 段落块
- **WHEN** 文档包含普通段落
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "paragraph" }`

#### Scenario: 列表块
- **WHEN** 文档包含有序/无序/任务列表
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "list", ordered, task, checked }`

#### Scenario: 引用块
- **WHEN** 文档包含块引用
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "blockquote" }`

#### Scenario: 代码块
- **WHEN** 文档包含代码围栏
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "code_block", language }`

#### Scenario: 表格块
- **WHEN** 文档包含 GFM 表格
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "table", alignments }`

#### Scenario: 图片块
- **WHEN** 文档包含图片
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "image", alt, target, title, asset_id }`

#### Scenario: 图表块
- **WHEN** 文档包含 Mermaid 或 PlantUML 图表
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "diagram", language, render_target, sandbox_required, timeout_ms }`

#### Scenario: FrontMatter 块
- **WHEN** 文档包含 YAML FrontMatter
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "front_matter" }`

#### Scenario: 不支持块类型
- **WHEN** 文档包含系统无法识别的块类型
- **THEN** ExportBlock SHALL 的 kind 为 `{ type: "unknown", reason }`
- **AND** 诊断信息中 SHALL 包含 `EXPORT_IR_UNSUPPORTED_BLOCK`

### Requirement: ExportRange 位置表示
Export IR SHALL 使用 `ExportRange`（start: usize, end: usize）表示文档中的 UTF-8 字节范围。每个块 SHALL 携带 `source_range`、`content_range` 和 `line_range`，分别表示原始文本范围、内容文本范围和行号范围。

#### Scenario: 范围正确定义
- **WHEN** ExportRange 被反序列化
- **THEN** start SHALL ≤ end
- **AND** 范围 SHALL 以 UTF-8 字节偏移（非 UTF-16 码元）计算

### Requirement: ExportAsset 资源引用
Export IR SHALL 以 `ExportAsset` 描述文档中的外部资源引用（如图片）。每个 Asset SHALL 包含 `logical_id`、`original_reference`、`resolved_identity`、`mime_type_hint`、`requires_host_read` 和 `source_range`。

#### Scenario: 图片资源
- **WHEN** 文档包含图片
- **THEN** Export IR SHALL 在 assets 中包含对应的 ExportAsset
- **AND** logical_id SHALL 与 ExportBlock 中的 asset_id 对应
- **AND** original_reference SHALL 为图片的原始引用文本

#### Scenario: 本地资源标记
- **WHEN** 图片引用为 `asset://` 协议
- **THEN** ExportAsset SHALL 设置 `requires_host_read = true`

### Requirement: ExportDiagnostic 诊断系统
Export IR SHALL 包含 `diagnostics` 列表，记录构建过程中的警告和错误。每条诊断 SHALL 包含 `code`、`severity`、`block_id`、`source_range` 和 `message`。诊断代码 SHALL 包括：`EXPORT_IR_UNSUPPORTED_BLOCK`、`EXPORT_IR_UNSUPPORTED_DIAGRAM`、`EXPORT_IR_UNSAFE_FRONTMATTER`。

#### Scenario: 不支持块的诊断
- **WHEN** 文档包含无法映射到 ExportBlockKind 的块
- **THEN** diagnostics SHALL 追加 `EXPORT_IR_UNSUPPORTED_BLOCK` 诊断
- **AND** severity SHALL 为 `warning`

#### Scenario: 不支持的图表
- **WHEN** 文档包含 render_target 不支持的图表
- **THEN** diagnostics SHALL 追加 `EXPORT_IR_UNSUPPORTED_DIAGRAM` 诊断
- **AND** severity SHALL 为 `warning`

#### Scenario: 不安全的 FrontMatter
- **WHEN** 文档的 FrontMatter 包含结构不安全的字段（如二进制内容）
- **THEN** diagnostics SHALL 追加 `EXPORT_IR_UNSAFE_FRONTMATTER` 诊断
- **AND** severity SHALL 为 `warning`

### Requirement: ExportFrontMatter 元数据
Export IR SHALL 通过 `ExportMetadata.frontmatter` 携带文档的 FrontMatter 信息。`ExportFrontMatter` SHALL 包含 `format`、`fields` 和 `unsafe_source_range`。支持的 FrontMatter 格式 SHALL 包括 YAML，未知格式标记为 `Unknown`。

#### Scenario: 含 FrontMatter 文档
- **WHEN** 文档包含有效的 YAML FrontMatter
- **THEN** metadata.frontmatter.format SHALL 为 `Yaml`
- **AND** fields SHALL 包含所有解析出的键值对
- **AND** 每个 field SHALL 有 `key`、`value` 和 `source_range`

#### Scenario: 无 FrontMatter 文档
- **WHEN** 文档不包含 FrontMatter
- **THEN** metadata.frontmatter SHALL 为 `None`/`null`

### Requirement: CoreSession.build_export_document API
CoreSession SHALL 提供 `build_export_document(request: ExportRequest)` 方法，输入 `ExportRequest`（session_id、revision、export_request_id、options），输出 `ExportDocument`。该方法 SHALL 在确认 revision 可访问后构建 IR，不得修改会话状态。

#### Scenario: 构建成功
- **WHEN** CoreSession 收到 `build_export_document` 调用
- **AND** 指定的 revision 已确认并可访问
- **THEN** 系统 SHALL 返回 ExportDocument
- **AND** base_revision SHALL 等于请求中的 revision
- **AND** blocks SHALL 反映该 revision 下的文档内容

#### Scenario: Revision 不可用
- **WHEN** CoreSession 收到 `build_export_document` 调用
- **AND** 指定的 revision 尚未确认或不存在
- **THEN** 系统 SHALL 返回 `RevisionMismatch` 错误

#### Scenario: 不修改会话状态
- **WHEN** `build_export_document` 执行完成
- **THEN** 会话的当前 revision SHALL 不变
- **AND** 文档内容 SHALL 不变

### Requirement: get_export_document Tauri 命令
系统 SHALL 提供 Tauri 命令 `get_export_document`，接收 `session_id`、`revision`、`export_request_id`、`options`（可选），返回 `ExportDocument`。该命令 SHALL 校验 max_schema_version，通过 SESSION_REGISTRY 获取 CoreSession 后调用 `build_export_document`。

#### Scenario: 前端调用
- **WHEN** 前端调用 `getExportDocument`
- **THEN** Tauri 命令 SHALL 解析请求参数
- **AND** 校验 max_schema_version
- **AND** 通过 SESSION_REGISTRY 获取 CoreSession
- **AND** 调用 `build_export_document`
- **AND** 将 ExportDocument 序列化为 JSON 返回

#### Scenario: Schema 版本校验失败
- **WHEN** 前端 `max_schema_version` 低于当前 `EXPORT_IR_SCHEMA_VERSION`
- **THEN** Tauri 命令 SHALL 返回 `UnsupportedExportIrVersion` 错误
- **AND** 不调用 `build_export_document`

#### Scenario: Session 不存在
- **WHEN** 指定 `session_id` 对应的 CoreSession 不存在
- **THEN** Tauri 命令 SHALL 返回 `SessionNotFound` 错误

### Requirement: 前端 Export IR 渲染
前端 SHALL 通过 `exportIrRenderer.ts` 将 ExportDocument 中的 blocks 渲染为 HTML 字符串。渲染器 SHALL 按顺序处理每个块，根据 `ExportBlockKind` 类型生成对应的 HTML 标记。前端 `documentExport.ts` SHALL 将 IR 渲染的 HTML 嵌入完整导出文档（含样式和字体声明）。M8C removal 后，产品主路径 MUST NOT 因 Core 会话不可用、sessionId 缺失或 revision 不可确认而回退到当前编辑器 DOM；系统 SHALL 返回稳定导出错误并保持文档状态不变。

#### Scenario: IR 渲染优先
- **WHEN** Core 会话活跃且导出触发
- **THEN** 前端 SHALL 先 flush CoreSession
- **AND** 调用 `getExportDocument` 获取 Export IR
- **AND** 通过 `renderExportIrToHtmlContent` 渲染为 HTML
- **AND** 导出此 HTML

#### Scenario: 诊断信息记录
- **WHEN** ExportDocument 包含 diagnostics
- **THEN** 系统 SHALL 在日志中输出诊断信息（代码、消息、block_id）
- **AND** 不阻塞导出流程，除非目标 adapter 声明该 diagnostic 为失败级别

#### Scenario: Core 会话缺失不回退 DOM
- **WHEN** 导出触发但 Core 会话不可用、没有 sessionId 或 revision 不可确认
- **THEN** 前端 SHALL 返回稳定导出错误
- **AND** 不得克隆或读取当前编辑器 DOM 作为导出内容
- **AND** 不得报告导出成功

#### Scenario: IR 响应校验
- **WHEN** 前端收到 ExportDocument
- **THEN** SHALL 验证 `session_id`、`base_revision`、`export_request_id` 与请求一致
- **AND** 不一致时抛出 `EXPORT_SESSION_MISMATCH` 错误

### Requirement: DOM 快照 fallback removed
The DOM snapshot fallback MUST NOT be used as document truth after M8C removal.

#### Scenario: Missing Core identity fails export
- **WHEN** Core session or revision identity cannot be confirmed
- **THEN** export SHALL fail with a stable error
- **AND** export MUST NOT read the current editor DOM, active selection, active path, or active window content
