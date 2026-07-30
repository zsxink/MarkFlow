# M8A Export IR Evidence

> 日期：2026-07-30
> Issue：#238
> 分支：`feat/issue-238-m8a-export-ir`
> 范围：M8A Export IR 与导出输入迁移

## 已完成

- Core 新增 Export IR schema v1：`ExportDocument`、`ExportMetadata`、`ExportBlock`、`ExportAsset`、`ExportDiagnostic`。
- Core 新增 `DocumentSession::build_export_document(ExportRequest)`，请求绑定 `sessionId + revision + exportRequestId`，并拒绝 stale revision 与 session mismatch。
- Export IR 覆盖 heading、paragraph、list、blockquote、code block、table、image、diagram、frontmatter metadata。
- Export IR 保留 block id、source byte range、content byte range、line range 和原始 source slice。
- image block 输出 logical asset id、原始引用、MIME hint、Host read 需求和 source range。
- diagram code fence 输出 render target、语言、sandbox 需求和 timeout。
- unsupported block 不静默丢弃，输出 `EXPORT_IR_UNSUPPORTED_BLOCK` diagnostic 并保留 raw source。
- Tauri bridge 新增 `get_export_document`，支持 `max_schema_version` 门禁；旧客户端不支持 schema v1 时返回 `UNSUPPORTED_EXPORT_IR_VERSION`。
- 前端新增 Export IR HTML renderer；HTML、PDF、DOCX、print 的输入优先来自 Core confirmed revision 的 Export IR HTML。
- Source Mode 导出不再先切换到 WYSIWYG。
- 导出前 `flushCoreSession()` 会先 drain SourceSyncController pending patch，再触发后端 `flushDocument()`，确保 Export IR 取自用户可见源码对应的 confirmed revision。
- Core Export IR HTML 输出重新包裹 `.ProseMirror` 容器，复用现有导出主题 CSS。
- stale export revision 在 bridge 边界返回 `EXPORT_STALE_REVISION`，区别于普通编辑 revision mismatch。
- 无 Core session 时保留 legacy DOM snapshot fallback；旧 ProseMirror serializer 保存链路未删除，留待 M8C。

## 自动化验证

- 已通过：`cargo test --manifest-path markflow-core/Cargo.toml export_ir`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml get_export_document`
- 已通过：`npx tsc --noEmit`
- 已通过：`npm test -- --run src/lib/coreSession.test.ts src/lib/coreBridge.test.ts src/lib/exportIrRenderer.test.ts src/lib/documentExport.test.ts`
- 已通过：`npm test`（45 files / 456 tests）
- 已通过：`cargo test --manifest-path markflow-core/Cargo.toml`
- 已通过：`cargo clippy --manifest-path markflow-core/Cargo.toml --tests -- -D warnings`
- 已通过：`cargo test --manifest-path src-tauri/Cargo.toml`（139 tests）
- 已通过：`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- 已通过：`git diff --check`
- 已通过：`npm run build`（Vite 报告既有 chunk/dynamic import warnings，无构建失败）

覆盖点：

- Export IR schema version、request id、session id、document id、base revision。
- LF/CRLF、中文、emoji、inline code、link、nested list、task list、table alignment、image title/MIME、Mermaid diagram、frontmatter safe field 与 unsafe source range。
- stale revision 和 session mismatch 拒绝。
- Tauri bridge 将 export stale revision 映射为 `EXPORT_STALE_REVISION`。
- unknown/link-reference/thematic-break fallback diagnostic。
- TypeScript renderer 对 schema version 的兼容错误码、unsupported raw source 保留。
- 前端导出 active Core session 时不读取 legacy DOM snapshot，且请求结果校验 `sessionId + revision + exportRequestId`。
- 前端导出 active Core session 时先 drain SourceSyncController，再请求 Export IR。
- Core Export IR HTML 包含 `.ProseMirror` root，保证导出 CSS selector 命中。

## 独立复核

- 复核 agent：`019fb34a-2110-7461-8481-2df5a6ed3285`
- 结论：首次复核发现 1 个 P1 与 2 个 P2，均已修复并补测试。
- P1：Source Mode 导出前未等待本地 pending patch drain；修复为 `flushCoreSession()` 先调用 SourceSyncController flush barrier。
- P2：Core Export IR HTML 缺 `.ProseMirror` wrapper；修复为导出入口包裹稳定 root。
- P2：stale export revision 返回普通 `REVISION_MISMATCH`；修复为 `EXPORT_STALE_REVISION`。

## 未验证

- macOS GUI 手工导出 smoke：未验证。
- Windows release smoke：未验证。
- Linux release smoke：未验证。
- native PDF 真实文件输出：未验证，本次只验证桥接与 TypeScript 调用路径。
- DOCX 二进制视觉回归：未验证，本次只验证输入从 Export IR HTML 进入现有 docx adapter。
- WYSIWYG 与 Source Mode 同一 confirmed revision 的端到端视觉一致性：未验证，需要后续 e2e/release gate 覆盖。

## Legacy/Fallback 状态

- legacy DOM snapshot fallback 仍保留，仅在没有 active Core session 时使用。
- PDF 仍使用现有 Tauri native WebView 输出 command，M8A 只迁移其输入 HTML 来源。
- DOCX 仍使用现有 TypeScript `docx` HTML adapter，M8A 只迁移其输入 HTML 来源。
- 旧 ProseMirror serializer 保存真相链路未删除，删除条件仍归 M8C。
