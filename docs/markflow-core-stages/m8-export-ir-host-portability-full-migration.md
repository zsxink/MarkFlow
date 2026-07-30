# M8: Export IR, Host Portability and Full Migration

> 状态：方案完成，实施待启动。拆分 M8A-M8C，依赖功能迁移矩阵 P0/P1 全绿和至少一个稳定发布观察周期。
> 最后复核：2026-07-30。

## 阶段目标

完成导出统一、Host Adapter 边界稳定和现有功能全量迁移，移除旧 ProseMirror serializer 保存真相链路。

注意：本阶段移除的是旧编辑内核的文档真相职责，不是移除所见即所得编辑模式。MarkFlow 必须继续支持所见即所得编辑。

M8 拆为三个可独立 review、独立回退的子里程碑：

- M8A：Export IR 与格式适配器迁移。
- M8B：Host/Bridge contract 稳定与非 Tauri harness。
- M8C：稳定观察期、功能矩阵清零和 Legacy Removal。

旧 serializer 只能在 M8C 删除。

M8 不改变产品承诺：

- Markdown source 仍是唯一持久化真相。
- WYSIWYG 仍是受支持编辑模式，但保存、导出和模式切换不再依赖 ProseMirror serializer 作为文档真相。
- Source Mode 与 WYSIWYG 的导出输入必须来自同一份 Core confirmed snapshot。
- 所有导出、Host 请求、资源事务和后台任务必须绑定 `sessionId + revision + requestId`，窗口相关请求还必须绑定 `clientId + windowLabel`。

## 进入条件

启动 M8A 前必须满足：

- M3/M3.1 Core-backed Source Mode 保存路径已验收。
- M4 Solid/App Shell 与 Editor Adapter 边界已经默认关闭、可回退地落地。
- M5/M6/M7 的 P0/P1 迁移项至少进入可跟踪状态，未完成项在 `feature-migration-matrix.md` 中有明确 owner、目标阶段和阻塞说明。
- 导出、保存、资源、搜索、诊断等现有异步入口均能携带或推导出目标 `sessionId`。

启动 M8B 前必须满足：

- M8A 的 Export IR DTO 已有版本号、golden fixture 和向后兼容测试。
- HTML export 主路径可基于 Core confirmed snapshot 生成输出。
- PDF/DOCX 保留适配器时，其输入已经不再读取当前编辑 DOM。

启动 M8C 前必须满足：

- `feature-migration-matrix.md` 中 P0/P1 均为 `已验收`。
- 新路径经过至少一个稳定发布观察周期，且无 revision divergence、silent rewrite、fallback save 或错误 session 回填记录。
- macOS、Windows、Linux release smoke 全部通过。
- removal audit 已覆盖旧 serializer、DOM-based export 和 legacy save allowlist。

## 技术方案

### 1. Export IR

Core 输出导出中间层。Export IR 是版本化、可序列化、可测试的语义快照，不是实时编辑 DOM 的包装：

```rust
pub struct ExportDocument {
    pub schema_version: u32,
    pub session_id: SessionId,
    pub base_revision: Revision,
    pub export_request_id: String,
    pub metadata: ExportMetadata,
    pub blocks: Vec<ExportBlock>,
    pub assets: Vec<ExportAsset>,
    pub diagnostics: Vec<ExportDiagnostic>,
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

Export IR 必须保留：

- block id、source range、语义类型和原始 source slice 的映射。
- heading level、list kind、task list checked state、table alignment、code fence language、image alt/title/reference。
- frontmatter 的安全结构化字段，以及 unsafe frontmatter 的源码回退 range。
- diagram 的 render target、语言、source range 和 sandbox/timeout 需求。
- asset reference 的 logical id、原始引用、解析后 identity、MIME/type hint 和是否需要 Host 读取。
- export diagnostics，不允许因为单个 unsupported block 静默丢内容。

Export IR 不保存：

- selection、cursor、viewport、scroll、hover、toolbar state。
- ProseMirror node、CodeMirror view state、DOM node、CSS computed style。
- 只能从当前 active editor 推导的 path/window 状态。

`export_request_id` 是 Core-neutral opaque id。Runtime/Bridge 可以把外部 request id 映射成该字符串，但 Core Export IR 不依赖 Runtime-only 类型。

M8A 退出条件：

- Core 提供 `build_export_document(session_id, revision, request_id, options)` 或等价 API。
- Export IR 覆盖 heading、paragraph、list、blockquote、code block、table、image、diagram、frontmatter metadata。
- 每类 block 都有 snapshot fixture，覆盖 LF/CRLF、中文、emoji、inline code、链接、嵌套 list 和非法/未知语法回退。
- 旧客户端或旧适配器读取新 DTO 时要么通过兼容层工作，要么返回稳定 `UNSUPPORTED_EXPORT_IR_VERSION`。

### 2. 导出适配器

统一输入为 confirmed revision 的 Export IR，但最终格式可以由不同适配器完成：

- HTML：Core 或共享 renderer，使用 golden test。
- PDF：允许 Host/WebView native print，输入不再读取实时编辑 DOM。
- DOCX：允许保留 TypeScript `docx` 适配器，输入改为 Export IR。

PDF 仍可通过 Host/WebView 打印能力完成，但输入应来自 Export IR，而不是当前编辑 DOM。

Export workflow 必须显式指定 `sessionId + revision + exportRequestId`。如果用户在导出期间切换文档或继续编辑，导出仍使用发起时的 confirmed snapshot；除非用户取消，否则不得改为导出当前 active editor。

窗口关闭必须取消仍绑定该窗口/session 的导出任务。唯一例外是已经明确交给 OS 级后台 job、且不再需要 UI/session 回填的操作；这种例外必须在 Host capability matrix 中记录取消语义、结果归属和清理责任。

导出流程：

1. UI 从 focused editor 或 workspace projection 取得 `sessionId`，生成 `exportRequestId`。
2. Runtime flush 该 session 的 pending patch，取得 confirmed revision。
3. Core 以 `sessionId + revision + exportRequestId` 构建 Export IR snapshot。
4. Runtime 选择 format adapter，创建可取消 export job。
5. Host 只执行文件选择、平台打印、临时文件、字体/媒体读取等副作用。
6. Adapter 返回 `ExportResult { request_id, session_id, revision, output_identity, bytes_written, warnings }`。
7. UI 只在 request 仍匹配发起 session/window 时展示成功、失败或取消状态。

格式适配器边界：

- HTML adapter 可以在 Rust 或 TypeScript 中实现，但输入只能是 Export IR，输出必须有 golden test。
- PDF adapter 可以继续使用 WebView/native print，但打印 HTML 必须由 Export IR renderer 生成。
- DOCX adapter 可以继续使用 TypeScript `docx`，但不得从编辑 DOM 或 HTML snapshot 抽取内容。
- Mermaid/PlantUML 导出只读取 Export IR 中的 diagram render target；Host renderer 失败时返回 diagnostic，不得改写文档。
- 主题、字体和媒体等待作为 export options 传入，不读取当前 DOM computed style 作为隐藏真相。

导出错误码至少包含：

| 错误码 | 含义 | UI 行为 |
| --- | --- | --- |
| `EXPORT_CANCELLED` | 用户或 Runtime 取消 | 显示取消，不重试 |
| `EXPORT_STALE_REVISION` | 请求 revision 已不可用 | 刷新后允许用户重试 |
| `EXPORT_UNSUPPORTED_FORMAT` | 当前平台或构建不支持格式 | 展示明确禁用原因 |
| `EXPORT_IR_UNSUPPORTED_BLOCK` | IR 中存在当前适配器不支持的 block | 展示 warning 或失败，不能静默丢内容 |
| `EXPORT_HOST_PERMISSION_DENIED` | Host 权限不足或用户拒绝 | 展示权限错误 |
| `EXPORT_TIMEOUT` | 渲染、媒体等待或平台输出超时 | 允许重试，清理 job |
| `EXPORT_WRITE_FAILED` | 输出写入失败 | 保留原文件，展示可恢复错误 |

M8A 验收重点：

- Source Mode 与 WYSIWYG 对同一 confirmed revision 的 HTML 输出一致。
- A 文档发起 PDF/DOCX 导出后切换到 B，导出结果仍绑定 A 的 session/revision。
- 导出期间继续编辑 A，导出内容仍是发起时 confirmed snapshot，不混入后续 patch。
- 未渲染完的图表或缺失图片以 warning/diagnostic 呈现，不发生内容静默丢失。

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

Capability / Security matrix：

- Host capability 必须映射到 Tauri v2 capability / permission 配置；窗口或 WebView 没有权限时必须拒绝调用并返回稳定错误码。
- 每个 Host Port 要列出 `capability`、允许的 window/webview、参数范围、资源范围、超时、取消语义和错误码。
- 文件系统、shell、network、render、export 能力默认最小权限；新增命令必须先更新 capability matrix 和协议测试，再暴露给 UI。
- M8B 的非 Tauri harness 必须覆盖 missing capability、denied permission、window mismatch、stale session 和 cancellation。
- Host Adapter 不得把权限失败降级为静默 fallback；UI 必须展示可恢复错误或明确禁止操作。

Bridge DTO 必须包含：

- protocol version。
- stable error code。
- request/transaction id。
- client id、window label 和 session id。
- capability negotiation。
- serialization compatibility test。

Host Port 形态：

```rust
pub trait HostPort {
    fn capabilities(&self, context: &HostRequestContext) -> HostCapabilities;
    fn open_dialog(&self, context: HostRequestContext, request: OpenDialogRequest) -> HostResult<OpenDialogResponse>;
    fn save_dialog(&self, context: HostRequestContext, request: SaveDialogRequest) -> HostResult<SaveDialogResponse>;
    fn read_file(&self, context: HostRequestContext, request: ReadFileRequest) -> HostResult<ReadFileResponse>;
    fn write_file_atomic(&self, context: HostRequestContext, request: AtomicWriteRequest) -> HostResult<AtomicWriteResponse>;
    fn prepare_asset(&self, context: HostRequestContext, request: AssetPrepareRequest) -> HostResult<AssetPrepareResponse>;
    fn commit_asset(&self, context: HostRequestContext, request: AssetCommitRequest) -> HostResult<AssetCommitResponse>;
    fn rollback_asset(&self, context: HostRequestContext, request: AssetRollbackRequest) -> HostResult<AssetRollbackResponse>;
    fn render_diagram(&self, context: HostRequestContext, request: DiagramRenderRequest) -> HostResult<DiagramRenderResponse>;
    fn export_file(&self, context: HostRequestContext, request: HostExportRequest) -> HostResult<HostExportResponse>;
}
```

实际实现可以按能力拆分 trait 或模块，但协议语义必须一致。

Host 不拥有：

- `DocumentSession` lifecycle。
- dirty/clean revision 判定。
- Markdown patch 生成。
- history stack。
- active editor、active file path 或 selection。
- 功能降级决策。

Runtime 拥有：

- session registry 与 document identity。
- save/export/asset task 生命周期。
- request cancellation、timeout 和 stale result 丢弃。
- Host error 到用户可见错误的映射。
- legacy allowlist 与 removal audit。

Tauri command 收敛策略：

| 当前入口类型 | M8B 目标 | 迁移要求 |
| --- | --- | --- |
| 文件打开/保存/另存 | Runtime + Host file/dialog port | 保留 FileIdentity、SaveLease、atomic write 和 conflict gate |
| 剪贴板 | Host clipboard port | 文本、Markdown、图片分别声明 capability |
| 窗口与菜单 | Host window port + App Service | window label 必填，禁止按 active window 隐式回填 |
| 通知/toast | App Service + Host notification port | 错误码必须可追踪 |
| shell/open path | Host shell port | 最小权限和路径范围 |
| network/image fetch | Host network port | SSRF、大小、MIME 和 timeout gate |
| diagram render | Host render port | sandbox、timeout、cancellation、diagnostic |
| PDF/print/export | Host export port | 输入来自 Export IR renderer |

M8B 退出条件：

- 所有现有 Tauri command 要么迁入 Host/Core Bridge，要么有明确 legacy allowlist 和删除计划。
- Host mock 能覆盖文件系统、剪贴板、对话框、窗口、通知、网络、图表渲染和导出。
- 非 Tauri harness 可用 mock Host 跑打开、保存、搜索、导出和资源事务测试。
- 协议测试覆盖 missing capability、cancelled request、stale session、stale revision、window mismatch、same-path multi-session conflict。
- Tauri v2 capability / permission 配置与 Host capability matrix 一一对应。
- 每个 Host Port 都记录参数范围、资源范围、超时、取消语义、错误码和跨平台支持状态。
- Host mock 和 Tauri Host 对相同协议 fixture 的序列化结果一致。

### 4. CLI / 非 Tauri 入口

建立最小 CLI 或 test harness：

```text
markflow-core inspect file.md
markflow-core search file.md query
markflow-core export file.md --format html
```

用于证明 Core 可以脱离 Tauri 运行。

非 Tauri harness 不要求首期具备完整产品 UI，但必须证明：

- Core 解析、搜索、诊断和 HTML export 可以脱离 Tauri 运行。
- 打开、保存、资源事务和导出可以用 mock Host 验证副作用协议。
- 同路径多 session、stale session、stale revision、window mismatch 和 cancellation 有可重复测试。
- CLI 不绕过 Runtime 的 session lifecycle、FileIdentity、SaveLease 和 export job 管理。

CLI/test harness 命令可以分阶段落地：

```text
markflow-core inspect file.md --json
markflow-core search file.md query --json
markflow-core diagnostics file.md --json
markflow-core export file.md --format html --output out.html
markflow-core host-fixture fixtures/host/*.json
```

M8B 不要求 CLI 替代桌面产品，只要求 Core/Runtime/Host 边界可在非 Tauri 环境测试。

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

迁移原则：

- 每项能力必须先进入 `feature-migration-matrix.md`，再进入实现 PR。
- 每项能力必须记录当前 owner、目标 owner、迁移状态、自动化测试或人工验收证据。
- P0/P1 能力不可用临时文档说明代替验收。
- WYSIWYG fallback 可以在 M8A/M8B 保留，但必须在矩阵中标明触发条件、风险和删除计划。
- legacy allowlist 必须是收敛列表，只能减少，不能在 M8C 前新增无 issue 的豁免。

移除：

- `tiptap-markdown` 保存路径。
- ProseMirror serializer 主路径。
- WYSIWYG -> Source 通过整篇 serializer 同步的路径。
- DOM-based HTML/PDF/DOCX export 主路径。
- 通过 `activeFilePath`、当前 active editor 或当前 window 隐式决定文档副作用目标的路径。

删除条件：

- `feature-migration-matrix.md` 的 P0/P1 全部已验收。
- 新路径经过至少一个稳定发布观察周期。
- 本地诊断中无 revision divergence、silent rewrite 或 fallback save。
- macOS、Windows、Linux release gate 全部通过。
- CI 中有 removal audit：`tiptap-markdown`、`getMarkdown()` save path、ProseMirror serializer save path 和 DOM-based export 只能出现在 legacy allowlist、测试 fixture 或迁移说明中；M8C 删除 PR 必须同步清空 allowlist。

M8C 分两段执行：

1. 观察期 PR：默认启用 Core-backed export/Host path，保留 legacy fallback，但所有 fallback 都记录 telemetry/log marker、issue 链接和用户可见错误。
2. Removal PR：在观察期无阻塞问题后删除 legacy serializer 保存链路、DOM-based export 主路径和 allowlist。

M8C 不允许一次性混入新功能。若发现 P0/P1 缺口，应先回到对应阶段补齐，再恢复 removal。

### 6. 证据与发布记录

每个 M8 子里程碑必须新增或更新证据记录：

- `feature-migration-matrix.md` 的状态变更。
- 对应 issue、OpenSpec change 或实施 PR 链接。
- 自动化测试命令和结果摘要。
- 人工验收范围，至少包含 macOS；release gate 需要 Windows、Linux。
- 已知 fallback、legacy allowlist 和删除计划。
- session isolation 验证：A/B 文档快速切换、同路径多 session、导出期间编辑、窗口关闭、取消任务。

建议证据文件：

```text
docs/markflow-core-stages/m8a-export-ir-evidence.md
docs/markflow-core-stages/m8b-host-portability-evidence.md
docs/markflow-core-stages/m8c-legacy-removal-evidence.md
```

证据文件只记录事实，不替代验收标准；未验证的平台或路径必须明确写 `未验证`。

### 7. 推荐实施顺序

1. M8A-1：冻结 Export IR schema v1，补 snapshot fixtures 和 version compatibility tests。
2. M8A-2：迁移 HTML export 到 Export IR golden renderer。
3. M8A-3：迁移 PDF/DOCX 输入到 Export IR，保留现有平台输出适配器。
4. M8B-1：建立 Host capability matrix 和 stable error code registry。
5. M8B-2：收敛文件、dialog、clipboard、window、notification、shell port。
6. M8B-3：收敛 network、render、export port，并建立 mock Host harness。
7. M8B-4：补非 Tauri inspect/search/diagnostics/html export harness。
8. M8C-1：矩阵 P0/P1 清零，默认启用新路径并运行观察期。
9. M8C-2：独立复核、跨平台 release gate、removal audit。
10. M8C-3：删除 legacy serializer 保存路径和 DOM-based export 主路径。

## 交付物

- Export IR。
- HTML/PDF/DOCX 导出迁移。
- Host Adapter 模块化。
- Core CLI/test harness。
- 完整功能迁移清单。
- versioned Bridge contract 和 capability matrix。
- 稳定发布观察报告。
- ProseMirror serializer 保存链路移除。
- DOM-based export 主路径移除。
- legacy allowlist 清空记录。
- M8A/M8B/M8C evidence 文档。

## 验收标准

共同 gate：

- M8A、M8B、M8C 均有独立 issue/PR，且每个 PR 可独立回退。
- 每个子里程碑合入或归档前必须由独立 agent 复核，至少覆盖静态走查和可运行测试。
- 所有新增协议和 DTO 都有 version/compatibility test。
- 所有异步结果都必须校验 `sessionId + revision + requestId`，窗口相关结果额外校验 `clientId + windowLabel`。

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
- `tiptap-markdown`、`getMarkdown()` save path、ProseMirror serializer save path、DOM-based export 主路径不再出现在产品主路径。
- legacy fallback 只允许出现在测试 fixture、迁移说明或已关闭的历史记录中。
- 非 Tauri harness 可以在 CI 中跑解析、搜索、诊断和 HTML export。
- Host permission/capability 失败不会静默 fallback。

## 测试要求

- Core tests：Export IR snapshot、search、diagnostics。
- Export tests：HTML golden output、PDF/DOCX smoke。
- Host tests：file system、clipboard、dialogs、windows、notifications、network/render、atomic write、asset rollback、export cancellation。
- Protocol tests：version、error code、capability、request id、window/session mismatch、旧客户端兼容行为。
- E2E：全主路径。
- Cross-platform smoke：Windows/macOS/Linux。
- Regression：导出、图片、图表、文件树、冲突处理、表格、FrontMatter。
- Removal audit：禁止旧 serializer 保存链路和 DOM-based export 主路径回归。
- Session isolation：A/B 文档快速切换、同路径多 session、导出期间继续编辑、窗口关闭、取消任务。

最低命令集：

```bash
npm test
npx tsc --noEmit
cargo test --manifest-path markflow-core/Cargo.toml
cargo clippy --manifest-path markflow-core/Cargo.toml --tests -- -D warnings
git diff --check
```

涉及 Tauri Host 或 release gate 的 PR 还必须补充：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

若测试因平台、CI 权限或外部依赖无法运行，证据文档必须记录未运行原因和替代验证，不能写作已通过。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| PDF/DOCX 完全脱 DOM 成本高 | Export IR 作为输入，Host 可以继续承担最终平台输出 |
| Host Adapter 抽象过度 | 先抽实际需要的文件、剪贴板、窗口、对话框能力 |
| 移除旧 serializer 出现数据风险 | 只有 Core-backed WYSIWYG 和 Source 完成功能覆盖后再移除 |
| 为 Rust 化重写成熟导出链路 | 统一 Export IR 输入，允许 PDF/DOCX 保留适合的平台适配器 |
| 协议升级破坏 UI | versioned DTO、capabilities、兼容测试和稳定错误码 |
| Host 结果回填到错误窗口或文档 | 所有 Host 请求和结果绑定 `requestId + windowLabel + sessionId + revision` |
| capability 配置与 Host matrix 漂移 | M8B 增加 matrix fixture 和 Tauri permission 对照测试 |
| legacy allowlist 变成永久豁免 | M8C 要求 allowlist 清空，新增豁免必须有 issue、owner 和删除日期 |
| 非 Tauri harness 绕过真实 Runtime | harness 必须复用 Runtime session lifecycle、FileIdentity、SaveLease 和 export job |
| 导出视觉差异难发现 | HTML golden、PDF/DOCX smoke、主题/字体/媒体 fixture 和人工 release smoke 组合验证 |

## 非目标

- 不在 M8 引入公开插件系统。
- 不要求 PDF/DOCX 适配器必须全部 Rust 化。
- 不移除 WYSIWYG 编辑模式。
- 不用 Export IR 取代 Markdown source truth。
- 不在 removal PR 中新增无关编辑功能。
