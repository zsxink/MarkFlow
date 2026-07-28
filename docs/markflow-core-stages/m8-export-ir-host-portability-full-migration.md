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

Export workflow 必须显式指定 `sessionId + revision + exportRequestId`。如果用户在导出期间切换文档、关闭窗口或继续编辑，导出仍使用发起时的 confirmed snapshot；除非用户取消，否则不得改为导出当前 active editor。

### 3. Host Adapter 稳定

Tauri command 统一收敛为 Core Bridge 和 Host Adapter Port。Host 是平台副作用执行者，不是业务状态 owner。

```text
host/
  file_system
  clipboard
  dialogs
  windows
  notifications
  shell
  export
  network
  render
```

Core 不知道自己运行在 Tauri、Electron、Web 还是 CLI。

Runtime 负责 session、save、asset、task 和 export workflow；Host 只实现副作用。所有 Host 调用必须携带上下文：

```rust
pub struct HostRequestContext {
    pub protocol_version: u32,
    pub request_id: RequestId,
    pub client_id: ClientId,
    pub window_label: Option<WindowLabel>,
    pub session_id: Option<SessionId>,
    pub document_id: Option<DocumentId>,
    pub base_revision: Option<Revision>,
    pub capability: HostCapability,
}
```

Host Port 约束：

- 文档相关副作用必须带 `session_id`；窗口、对话框和通知必须带 `window_label`。
- Host 不读取 Editor Adapter、Solid store 或 ProseMirror DOM，不生成 Markdown，也不更新 Core revision。
- 文件写入、资源迁移、导出、图表渲染、网络 fetch 都必须支持 request id、取消、超时和稳定错误码。
- 同一路径多 session 的保存、资源、导出结果必须按 session 隔离，不能按 path 或当前 active window 回填。
- Host capability negotiation 必须区分平台支持、权限缺失、用户拒绝、临时失败和不可恢复失败。

Bridge DTO 必须包含：

- protocol version。
- stable error code。
- request/transaction id。
- client id、window label 和 session id。
- capability negotiation。
- serialization compatibility test。

M8B 退出条件：

- 所有现有 Tauri command 要么迁入 Host/Core Bridge，要么有明确 legacy allowlist 和删除计划。
- Host mock 能覆盖文件系统、剪贴板、对话框、窗口、通知、网络、图表渲染和导出。
- 非 Tauri harness 可用 mock Host 跑打开、保存、搜索、导出和资源事务测试。
- 协议测试覆盖 missing capability、cancelled request、stale session、stale revision、window mismatch、same-path multi-session conflict。

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
- A 文档发起导出或资源事务后切换到 B，结果仍绑定 A 的 session，不会读取 B 的 DOM、path 或 selection。
- 导出不要求切回 ProseMirror WYSIWYG。
- 项目主路径中不存在从 ProseMirror serializer 保存 Markdown。
- Host Adapter 边界清晰，未来 Electron/Web/CLI 不需要重写 Core。
- Core 可通过非 Tauri 入口完成解析、搜索、检查和 HTML export 测试。
- PDF/DOCX 适配器读取 Export IR snapshot，不读取当前编辑 DOM。
- Bridge DTO 的前后兼容、错误码、request id、window/session 绑定和 capability negotiation 测试通过。
- Windows、macOS、Linux smoke 覆盖打开、编辑、保存、快捷键、输入法、表格、FrontMatter、导出。
- 所见即所得编辑模式继续可用，并通过 Core-backed 路径保存。
- 功能迁移矩阵 P0/P1 全绿，且旧 serializer 已经过观察期后移除。

## 测试要求

- Core tests：Export IR snapshot、search、diagnostics。
- Export tests：HTML golden output、PDF/DOCX smoke。
- Host tests：file system、clipboard、dialogs、windows、notifications、network/render、atomic write、asset rollback、export cancellation。
- Protocol tests：version、error code、capability、request id、window/session mismatch、旧客户端兼容行为。
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
| Host 结果回填到错误窗口或文档 | 所有 Host 请求和结果绑定 `requestId + windowLabel + sessionId + revision` |
