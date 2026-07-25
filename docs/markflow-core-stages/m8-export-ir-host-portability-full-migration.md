# M8: Export IR, Host Portability and Full Migration

## 阶段目标

完成导出统一、Host Adapter 边界稳定和现有功能全量迁移，移除旧 ProseMirror serializer 保存真相链路。

注意：本阶段移除的是旧编辑内核的文档真相职责，不是移除所见即所得编辑模式。MarkFlow 必须继续支持所见即所得编辑。

M8 拆为：

- M8A：Export IR 与格式适配器迁移。
- M8B：Host/Bridge contract 稳定与非 Tauri harness。
- M8C：稳定观察期、功能矩阵清零和 Legacy Removal。

旧 serializer 只能在 M8C 删除。

## 技术方案

### 1. Export IR

Core 输出导出中间层：

```rust
pub struct ExportDocument {
    pub metadata: ExportMetadata,
    pub blocks: Vec<ExportBlock>,
    pub assets: Vec<ExportAsset>,
}
```

Export IR 关注语义，不绑定实时编辑 DOM：

- heading
- paragraph
- list
- table
- blockquote
- code block
- image
- diagram
- frontmatter metadata

### 2. 导出适配器

统一输入为 confirmed revision 的 Export IR，但最终格式可以由不同适配器完成：

- HTML：Core 或共享 renderer，使用 golden test。
- PDF：允许 Host/WebView native print，输入不再读取实时编辑 DOM。
- DOCX：允许保留 TypeScript `docx` 适配器，输入改为 Export IR。

PDF 仍可通过 Host/WebView 打印能力完成，但输入应来自 Export IR，而不是当前编辑 DOM。

### 3. Host Adapter 稳定

Tauri command 统一收敛为 Core Bridge 和 Host Adapter 能力：

```text
host/
  file_system
  clipboard
  dialogs
  windows
  notifications
  shell
```

Core 不知道自己运行在 Tauri、Electron、Web 还是 CLI。

Runtime 负责 session、save、task 和 export workflow；Host 只实现副作用。Bridge DTO 必须包含：

- protocol version。
- stable error code。
- request/transaction id。
- capability negotiation。
- serialization compatibility test。

### 4. CLI / 非 Tauri 入口

建立最小 CLI 或 test harness：

```text
markflow-core inspect file.md
markflow-core search file.md query
markflow-core export file.md --format html
```

用于证明 Core 可以脱离 Tauri 运行。

### 5. Full Migration

完成迁移：

- Source Mode。
- WYSIWYG Mode。
- 表格。
- FrontMatter。
- 图片。
- 图表。
- 搜索。
- 诊断。
- 导出。
- 设置与主题适配。
- 文件监听与冲突处理。

移除：

- `tiptap-markdown` 保存路径。
- ProseMirror serializer 主路径。
- WYSIWYG -> Source 通过整篇 serializer 同步的路径。

删除条件：

- `feature-migration-matrix.md` 的 P0/P1 全部已验收。
- 新路径经过至少一个稳定发布观察周期。
- 本地诊断中无 revision divergence、silent rewrite 或 fallback save。
- macOS、Windows、Linux release gate 全部通过。

## 交付物

- Export IR。
- HTML/PDF/DOCX 导出迁移。
- Host Adapter 模块化。
- Core CLI/test harness。
- 完整功能迁移清单。
- versioned Bridge contract 和 capability matrix。
- 稳定发布观察报告。
- ProseMirror serializer 保存链路移除。

## 验收标准

- P0/P1 文档语义、编辑命令、历史、搜索、解析和 Export IR 由 Core 提供。
- session、同步、保存、资源和导出工作流由 Runtime 编排，文件、网络、剪贴板、对话框和平台导出副作用只经 Host Adapter。
- Editor Adapter/SolidJS 只维护输入草稿、selection、viewport、widget 和界面状态，不持有第二份权威 Markdown。
- Source Mode 和 WYSIWYG 下导出结果一致。
- 导出不要求切回 ProseMirror WYSIWYG。
- 项目主路径中不存在从 ProseMirror serializer 保存 Markdown。
- Host Adapter 边界清晰，未来 Electron/Web/CLI 不需要重写 Core。
- Core 可通过非 Tauri 入口完成解析、搜索、检查和 HTML export 测试。
- PDF/DOCX 适配器读取 Export IR snapshot，不读取当前编辑 DOM。
- Bridge DTO 的前后兼容、错误码和 capability negotiation 测试通过。
- Windows、macOS、Linux smoke 覆盖打开、编辑、保存、快捷键、输入法、表格、FrontMatter、导出。
- 所见即所得编辑模式继续可用，并通过 Core-backed 路径保存。
- 功能迁移矩阵 P0/P1 全绿，且旧 serializer 已经过观察期后移除。

## 测试要求

- Core tests：Export IR snapshot、search、diagnostics。
- Export tests：HTML golden output、PDF/DOCX smoke。
- Host tests：file system、clipboard、dialogs、atomic write。
- Protocol tests：version、error code、capability、旧客户端兼容行为。
- E2E：全主路径。
- Cross-platform smoke：Windows/macOS/Linux。
- Regression：导出、图片、图表、文件树、冲突处理、表格、FrontMatter。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| PDF/DOCX 完全脱 DOM 成本高 | Export IR 作为输入，Host 可以继续承担最终平台输出 |
| Host Adapter 抽象过度 | 先抽实际需要的文件、剪贴板、窗口、对话框能力 |
| 移除旧 serializer 出现数据风险 | 只有 Core-backed WYSIWYG 和 Source 完成功能覆盖后再移除 |
| 为 Rust 化重写成熟导出链路 | 统一 Export IR 输入，允许 PDF/DOCX 保留适合的平台适配器 |
| 协议升级破坏 UI | versioned DTO、capabilities、兼容测试和稳定错误码 |
