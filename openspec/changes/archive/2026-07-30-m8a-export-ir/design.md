## Context

MarkFlow 已有三种导出格式（PDF、DOCX、HTML），之前均通过前端 ProseMirror DOM 快照或 WYSIWYG 渲染块生成 HTML 后再转换为目标格式。随着 Core 后端逐步接管文档状态管理，导出流程需要一个中间层来：

1. 消除各导出格式对 DOM 结构的重复解析
2. 传递 Core 后端的结构化信息（源范围、FrontMatter、诊断等）
3. 支持向前兼容的 schema versioning
4. 为未来的导出格式（如 EPUB、LaTeX）提供统一的入口

导出 IR 是这个中间层的标准化数据结构，在 Rust Core 层构建，经 Tauri 桥接到前端后渲染为 HTML。

## Goals / Non-Goals

**Goals:**
- 定义 Export IR 数据结构（Rust `export_ir.rs`），覆盖 Markdown 文档的所有块类型
- 实现从 Core 文档状态 → Export IR 的转换方法
- 提供 Tauri 命令供前端获取 Export IR 快照
- 在前端层将 IR 渲染为 HTML
- 前端导出流程优先使用 IR 路径，DOM 快照降级为 fallback
- 包含诊断信息机制，导出时可报告问题
- Schema version 机制支持协议演进

**Non-Goals:**
- 不改变 PDF/DOCX/HTML 最终输出的渲染结果（内容一致，结构更规范）
- 不引入新的导出格式
- 不改变现有 WYSIWYG 渲染路径（Render IR）
- 不走 IR 序列化到磁盘再读取的路径（IR 仅在内存中传递）

## Decisions

### 1. Rust Core 构建 IR，前端消费
- **决策：** IR 构建在 `markflow-core` 的 `CoreSession::build_export_document()` 中完成，序列化为 JSON 通过 Tauri IPC 传给前端
- **理由：** 文档的核心数据（块结构、范围、FrontMatter）已由 Core 管理，在 Core 层构建避免了前端重新解析原始文本
- **替代方案：** 前端从 Render IR 转换 → 但 Render IR 的块类型是 WYSIWYG 导向的（区分大文档/小文档、viewport 分页），不适合导出

### 2. Scheme version 策略
- **决策：** `ExportDocument.schema_version = 1`，前端可指定 `max_schema_version` 以声明自己能处理的最高版本；若过高则返回 `UnsupportedExportIrVersion` 错误
- **理由：** 向前兼容：新版本增加字段时通过 `#[serde(default)]` 处理；前端逐步升级；失败时走 fallback
- **替代方案：** 无版本号、直接使用 protobuf → JSON 更简单且与 Tauri/Serde 生态集成良好

### 3. 诊断信息嵌入 IR
- **决策：** Export IR 包含 `diagnostics` 向量，记录导出时的警告和错误（如不支持块类型、不安全的 FrontMatter）
- **理由：** 用户需知道导出时丢失了哪些内容，诊断在 IR 构建时即可检测，无需传到渲染后才发现
- **替代方案：** 渲染时检测 → 丢失结构化上下文（无法精确定位源码位置）

### 4. 前端路径：Export IR → HTML renderer
- **决策：** `exportIrRenderer.ts` 将 IR 块按顺序渲染为 HTML 字符串，`documentExport.ts` 嵌入到完整 HTML 文档中
- **理由：** 保持各导出格式共享同一个 HTML 中间产物，PDF/DOCX 格式只需再次消费该 HTML
- **替代方案：** 各格式各自消费 IR → 重复 HTML 渲染逻辑

### 5. Fallback 策略
- **决策：** 当 Core 会话不可用（如旧版文档或 WYSIWYG 回退模式）时，仍然使用 DOM 快照路径
- **理由：** 向后兼容，用户不会因为迁移丢失导出功能
- **判断条件：** `documentExport.ts` 的 `buildConfirmedRevisionHtml` 检查 Core session 活跃状态

## Risks / Trade-offs

- **IR → HTML 渲染质量 vs DOM 快照**：IR 渲染可能在某些边缘 case 下与 ProseMirror 原生渲染有视觉差异。**缓解**：对比测试覆盖所有块类型，差异发现即修复
- **Schema version 管理成本**：随着 IR 演进需管理版本兼容性。**缓解**：版本号递增需伴随 `#[serde(default)]`，避免破坏性变更
- **诊断信息丢失**：若前端不显示诊断，用户无从知晓导出问题。**缓解**：`documentExport` 中 log diagnostic 信息，后续可在 UI 展示
- **额外 IPC 开销**：导出流程新增一次 Tauri IPC 调用（`getExportDocument`）。**缓解**：IR 数据体积与文档大小成正比，大文档需保证序列化效率
