## Why

M8A/M8B 已经建立 Export IR 与 Host portability 边界，M8C 需要把这些边界从“可回退的新路径”推进到产品主路径的唯一保存与导出真相。现在的 specs 仍允许 Core 会话不可用时走 ProseMirror serializer 或 DOM snapshot fallback，这会继续保留 revision divergence、silent rewrite 和 active editor/window 回填风险。

## What Changes

- 默认启用 Core-backed export/Host path，并要求观察期内所有 legacy fallback 都有 telemetry/log marker、issue 链接和用户可见错误。
- 要求 `feature-migration-matrix.md` 中 P0/P1 能力在 removal 前全部为已验收，并记录自动化测试或人工验收证据。
- **BREAKING**: 删除产品主路径中的 ProseMirror serializer 保存链路、`getMarkdown()` save path、WYSIWYG 整篇 serializer 同步路径和 DOM-based HTML/PDF/DOCX export 主路径。
- **BREAKING**: Export IR 路径不再允许因 Core session 缺失而静默退回当前编辑器 DOM；失败必须返回稳定错误并保持文档状态不变。
- 增加 M8C removal audit gate，禁止 `tiptap-markdown`、ProseMirror serializer save path、`getMarkdown()` save path 和 DOM-based export 主路径回归。
- 增加 `docs/markflow-core-stages/m8c-legacy-removal-evidence.md` 证据记录，覆盖观察期、跨平台 smoke、session isolation、fallback 清零和 removal audit。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `export-ir`: 移除 Core session 不可用时的 DOM snapshot fallback 合同，要求 Export IR 缺失时返回稳定错误。
- `rendered-document-export`: 三种导出格式的内容来源收敛为 confirmed revision 的 Export IR 渲染结果，DOM-based export 主路径只允许存在于历史迁移说明或测试 fixture。
- `html-export`: 自包含 HTML 导出必须由 Export IR 渲染输入驱动，不再从当前编辑器 DOM 克隆内容。
- `pdf-export`: 直接 PDF 导出的输入必须来自 Export IR rendered HTML，并绑定发起时的 session/revision/request/window。
- `docx-export`: DOCX 语义映射必须消费 Export IR 或由 Export IR 派生的结构，不再从 ProseMirror node tree、实时 DOM 或 HTML snapshot 抽取内容。
- `markflow-runtime`: Runtime 负责 removal 后的 fallback 策略、稳定错误映射、任务取消和 stale result 丢弃；产品主路径不得通过 active editor/path/window 决定保存或导出目标。
- `host-portability`: Host export/file/render 副作用在 removal 后必须拒绝缺少 scope、capability 或 permission 的请求，不允许静默 fallback。
- `core-backed-wysiwyg`: WYSIWYG 模式继续受支持，但保存和模式切换不得调用 ProseMirror serializer 或整篇 Markdown serializer。
- `regression-coverage`: 增加 M8C removal audit 和跨平台/session-isolation 证据要求。

## Impact

- Affected frontend export/save paths: `src/lib/documentExport.ts`, `src/lib/pdfExport.ts`, DOCX export adapter, HTML export renderer, editor mode switching and WYSIWYG bridge code.
- Affected Rust/runtime paths: `markflow-core` Export IR, `src-tauri/crates/runtime` Host/export workflow, Tauri export/file commands and Host capability tests.
- Affected docs/gates: `docs/markflow-core-stages/feature-migration-matrix.md`, `docs/markflow-core-stages/m8c-legacy-removal-evidence.md`, removal audit scripts/tests, OpenSpec delta specs.
- Issue: closes #244.
