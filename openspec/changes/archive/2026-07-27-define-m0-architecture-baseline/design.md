## Context

MarkFlow 当前是 Tauri v2 + TypeScript + Vite 桌面 Markdown 编辑器。当前主路径以 Tiptap/ProseMirror 承担 WYSIWYG 文档树和 Markdown serializer，CodeMirror 承担 Source Mode，Rust/Tauri commands 承担文件、图片、设置、监听、导出等平台能力。

`docs/markflow-core-stages/` 已经定义长期方向：Markdown 原文是唯一文档真相，文档能力沉淀到 `markflow-core`，应用工作流沉淀到 `markflow-runtime`，Tauri 成为第一个 Host Adapter。M0 的职责是把这些方向转成可验证的设计基线、ADR、fixture、spike 和 benchmark，而不是提前实施产品路径迁移。

当前必须同时满足两类约束：

- 项目流程约束：先创建真实 issue，再从 `main` 拉分支，再创建 OpenSpec proposal；归档前必须先同步 spec，并派独立 sub-agent 复核。
- 架构阶段约束：M0 不创建生产 `markflow-core` API，不接入 Source Mode，不替换保存链路，不迁移 SolidJS UI，不实现 Core-backed WYSIWYG，不承诺第三方插件 ABI。

## Goals / Non-Goals

**Goals:**

- 冻结 M0 架构边界：UI、Editor Adapter、Core Bridge、`markflow-runtime`、`markflow-core`、Host Adapter、Platform。
- 产出可引用 ADR：依赖方向、文档真相和保存 owner、坐标/EOL、History owner、parser/buffer 选型、`bekoedit-markdown` 采用策略、性能预算。
- 建立共享 fixture 和 spike harness，让五类 spike 使用同一输入、同一机器记录、同一报告格式。
- 用 p95、峰值内存、fixture 差异和失败样例作为 M1/M3 设计输入。
- 补齐 OpenSpec delta，使后续 M1-M8 proposal 可以直接引用 M0 baseline。

**Non-Goals:**

- 不创建正式生产 `markflow-core` crate 或稳定 public API。
- 不将 CodeMirror Source Mode 接入 Core session。
- 不替换 `getMarkdown()` 保存链路。
- 不迁移 SolidJS UI 外壳。
- 不实现 Core-backed Live Preview/WYSIWYG。
- 不迁移 History、格式命令、表格、FrontMatter、图片、搜索、诊断或导出产品路径。
- 不引入或承诺第三方插件 ABI。
- 不把 `bekoedit-markdown` 预设为生产依赖或 fork。

## Decisions

### Decision 1: M0 is an evidence gate, not a product migration

M0 implementation work will be isolated to `docs/`, `openspec/`, spike, benchmark, fixture, and test/report locations. Product commands, editor paths, save paths, export paths, and UI shell behavior remain unchanged.

Rationale: M0 exists to reduce architectural uncertainty before M1/M3. If product paths move during M0, benchmark evidence and architectural decisions become entangled with migration bugs.

Alternatives considered:

- Implement Core Foundation immediately in M0: rejected because M1 already owns this and needs M0 decisions first.
- Wire Source Mode to Core during M0: rejected because M3 owns Core-backed Source Mode and depends on M1/M2.

### Decision 2: ADRs must cite repeatable spike evidence

Each ADR that chooses architecture boundaries, parser/buffer, coordinate model, FrontMatter safe subset, IPC patch protocol, or `bekoedit-markdown` strategy must cite fixture or benchmark output. Preference-only decisions are not accepted.

Rationale: The core risks are lossless editing, position mapping, large file performance, and revision correctness. These cannot be settled by diagrams alone.

Alternatives considered:

- Write ADRs before spike results: acceptable only as drafts, not as M0 exit artifacts.
- Keep benchmark notes informal: rejected because M1/M3 need stable p95 budgets and reproduction commands.

### Decision 3: Shared fixture corpus comes before individual spikes

The first implementation task after planning is to create a shared M0 fixture corpus and harness contract. Parser, position/EOL, IPC, FrontMatter, and reference implementation spikes all consume that corpus.

Rationale: M0 compares approaches. Comparison is only meaningful when each spike sees the same Markdown shapes, sizes, and failure cases.

Fixture groups:

- Lossless small fixtures: LF, CRLF, Mixed EOL, UTF-8 BOM, Unicode offsets, trailing newlines.
- Markdown structure fixtures: FrontMatter, HTML Comment, mixed list markers, ordered marker styles, code fence backtick/tilde, GFM table alignment.
- Size fixtures: generated or committed metadata-controlled 1MB, 10MB, and 50MB Markdown files.

### Decision 4: Parser selection stays behind MarkFlow-owned contracts

M0 may compare `markdown-rs`, another reference parser, and `bekoedit-markdown`, but no third-party AST or parser-specific type becomes MarkFlow's public Core contract.

Rationale: MarkFlow's primary product contract is lossless editing and source mapping, while parser libraries usually optimize for AST or HTML output. A MarkFlow-owned facade keeps M1 replaceable.

Adoption decision gate for `bekoedit-markdown`:

- Default: reference design only.
- Upgrade to dependency only if compatibility, performance, maintenance activity, API stability, license, and NOTICE evidence all pass.
- Fork only if dependency adoption fails but a small stable subset is valuable and maintainable.

### Decision 5: Coordinates are typed, revision-bound, and benchmarked

M0 will validate a model where Rust internals use UTF-8 byte offsets, IPC/editor DTOs use UTF-16 offsets, save payloads preserve source bytes/EOL, and all ranges bind to revision.

Rationale: CodeMirror and JavaScript expose UTF-16 offsets, Rust and Markdown parser positions typically use bytes, and lossless save requires source-byte/EOL preservation. Untyped `usize` ranges would make subtle corruption likely.

### Decision 6: Large Document strategy references existing tiers but freezes future byte-based direction

Existing `document-size-tier` currently combines byte and line-count thresholds. M0 does not rewrite that product behavior directly. M0 records the Core architecture baseline that future Core stages classify Markdown document tiers by UTF-8 byte size, with line count, max line length, nesting depth, and node count treated as budget inputs.

Rationale: M0 should not unexpectedly change current UI behavior, but M1-M8 need a clear target model for Large/Huge documents.

### Decision 7: Validation must be offline and independently reviewed

M0 validation records must include OpenSpec validation and baseline Rust/TS commands. DNS or HTTP behavior used in tests must be mocked or local. Before implementation completion and archive, an independent sub-agent must review the artifacts and validation results.

Rationale: The repo already requires deterministic offline regression coverage and independent review before merge/archive. M0 should exercise the same discipline because it becomes the base for later migrations.

## Risks / Trade-offs

- [Risk] M0 tasks drift into M1/M3 implementation. → Mitigation: Tasks explicitly label spike-only work and place production crate/session/source-mode work out of scope.
- [Risk] Parser benchmark results are not comparable. → Mitigation: All parser experiments consume the shared fixture corpus and report the same metrics.
- [Risk] `bekoedit-markdown` becomes a hidden production dependency. → Mitigation: M0 requires a three-way adoption ADR and MarkFlow-owned facade criteria before any production use.
- [Risk] Large document strategy conflicts with current `document-size-tier`. → Mitigation: M0 records target architecture direction and creates a follow-up synchronization point instead of changing current behavior immediately.
- [Risk] IPC patch benchmark is too artificial. → Mitigation: Include CodeMirror-shaped transactions, batching, revision mismatch, resync, and 10MB/50MB transport cases.
- [Risk] FrontMatter structured editing corrupts complex YAML. → Mitigation: Define a safe edit subset and explicit fallback-to-source cases.
- [Risk] Tests depend on public network. → Mitigation: Use mock/local resolver and record offline validation commands.

## Migration Plan

1. Complete this OpenSpec proposal with design, specs, and tasks.
2. During `/opsx:apply`, add M0-only ADR drafts, fixture corpus, spike harness, benchmarks, and reports.
3. Validate with `openspec validate define-m0-architecture-baseline --strict`, `npm test`, `npx tsc --noEmit`, and relevant Rust/spike commands.
4. Dispatch an independent sub-agent review before marking implementation complete.
5. Before archive, sync delta specs into main specs, then run `npx openspec validate --all` and `bash scripts/check-archive-synced.sh`.

Rollback is straightforward because M0 does not change product paths. If a spike proves unusable, remove or revise the spike artifact and update the corresponding ADR before proceeding to M1.

## Open Questions

- Which exact second parser will be compared against `markdown-rs`: `pulldown-cmark`, `comrak`, or another candidate?
- Should large 10MB/50MB fixtures be generated on demand to avoid repository bloat, or committed under Git LFS/excluded benchmark data?
- Which benchmark runner should become canonical for M0 reports: Criterion, a Rust binary with JSON output, Vitest benchmark, or a mixed harness?
- Where should ADRs live permanently: `docs/markflow-core-stages/adr/` or `openspec/changes/define-m0-architecture-baseline/adr/` with archive sync?
