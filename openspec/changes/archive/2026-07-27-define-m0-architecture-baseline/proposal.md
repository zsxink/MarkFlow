## Why

MarkFlow 已经形成 `docs/markflow-core-stages/m0-architecture-baseline.md` 到 M8 的 Core 重构方向，但当前 OpenSpec 主规范尚未把 M0 的架构边界、spike、benchmark、ADR 与退出条件固化为可执行合同。现在需要先冻结 M0 基线，避免后续 M1/M3 实施时继续把 Markdown 真相、保存链路和平台副作用混在 Tauri command、ProseMirror serializer 或前端 store 中。

## What Changes

- 新增 M0 架构基线能力，定义 M0 必须交付的 ADR、spike、fixture、benchmark、性能预算和复核记录。
- 明确长期分层：UI、Editor Adapter、Core Bridge、`markflow-runtime`、`markflow-core`、Host Adapter、Platform。
- 明确 Markdown 原文是唯一文档真相，CodeMirror 只能持有乐观编辑镜像，保存必须来自 Core confirmed snapshot。
- 明确 Tauri 是第一个 Host Adapter，不是应用框架；`markflow-core` 不依赖 Tauri、DOM、CodeMirror、SolidJS 或 ProseMirror。
- 明确 M0 不实施产品路径迁移，不创建正式 `markflow-core` 产品 API；M0 只允许可重复 spike、benchmark、fixture 和 ADR。
- 明确 `bekoedit` / `bekoedit-markdown` 只作为参考实现进入 M0 评估，采用、封装或 fork 必须由 ADR 基于证据决定。
- 补充 OpenSpec 流程要求：M0 提案、实施、归档前均需可验证记录；归档前遵守 spec 同步和独立 sub-agent 复核规则。

## Capabilities

### New Capabilities

- `m0-architecture-baseline`: Defines the executable M0 architecture baseline for MarkFlow Core, including required boundaries, ADRs, spikes, benchmarks, fixtures, adoption decision gates, and validation records.

### Modified Capabilities

- None. Existing architecture, technical, product, and stage documents are updated as supporting documentation; the normative OpenSpec delta is captured in `m0-architecture-baseline`.

## Impact

- Affected documents: `docs/markflow-core-stages/*.md`, `openspec/specs/architecture.md`, `openspec/specs/technical-design.md`, `openspec/specs/product-spec.md`.
- New OpenSpec delta specs under `openspec/changes/define-m0-architecture-baseline/specs/`.
- Future implementation areas prepared by this change: Rust spike harness, parser comparison, Buffer/Position/EOL property tests, IPC patch benchmark, FrontMatter lossless experiments, `bekoedit-markdown` reference comparison, and performance baseline reporting.
- No user-facing product behavior changes are expected in M0; implementation changes are limited to spike/benchmark/test artifacts and documentation.
