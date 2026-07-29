# MarkFlow 文档与 Spec 审查 — Codex 提示词

> 最近复核：2026-07-29，issue #213 / `review-core-docs-and-specs`  
> 使用方式：本提示词中的问题必须先按当前仓库事实复核，不能把历史断言直接当作必修缺陷。已处理项应通过 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh` 再确认是否复发。

## 2026-07-29 复核结论

- stage docs 状态已更新到 M3/M3.1 已完成、M4 规划中；`technical-plan.md` 的 Cargo workspace 结构已改为当前 `markflow-core` + `src-tauri` + `src-tauri/crates/runtime`。
- `2026-07-29-m31-source-integrity-hardening` 并非 16 行 delta 全量未同步；确认缺口是 `source-patch-adapter` 仍残留两个已迁移 requirement，已删除并通过 OpenSpec 验证。
- 3 个 `Purpose: TBD` 已补全；7 个 legacy ProseMirror/Tiptap spec 已添加 `Legacy notice`。
- `architecture.md` / `technical-design.md` 已保留 legacy 定位，并补充当前 Core/Runtime/Bridge 结构指针。
- `document-size-tier` 阈值单位已明确为 MiB (1024 * 1024 bytes)。
- Core 相关 spec 碎片化不应在状态修正 PR 中直接合并；后续应按 ADR 独立处理 `core-source-adapter`、`runtime-layer`、`core-bridge-protocol` 的边界。

## ⚠️ 工作流程要求

**所有代码改动必须遵循 OpenSpec 工作流：**

1. **先创建分支**：从 main 拉新分支，命名 `docs/issue-N-core-docs-review`
2. **先 propose 再 apply**：执行 `/opsx:propose` 创建变更提案，再执行 `/opsx:apply` 按 checklist 逐步实施
3. **禁止在 main 上修改代码**：所有改动必须在分支上完成
4. **完成后归档**：任务完成后执行 `/opsx:archive` 归档变更，更新 main specs
5. **提交并推送**：归档后 commit 所有变更，push 到远程分支
6. **创建 PR 合入**：标题格式 `docs: Core 重构文档审查 + spec 碎片化整理 (#N)`
7. **提交规范**：commit message 使用 `type: 简明中文描述` 格式，body 中写 `closes #N`

## 项目背景

MarkFlow 项目同时维护了两套文档体系：
- `docs/markflow-core-stages/` — 重构阶段方案文档（M0-M8 技术/产品方案）
- `openspec/specs/` — 可执行模块规范（OpenSpec 管理的行为约束）

此外，约 10 个 spec 文件涉及 Core 重构相关模块，存在与 stage docs 重叠/碎片化问题。

## 当前问题

### 2.1 stage docs 状态更新

**2.1.1: technical-plan.md 状态标注严重滞后**
- 文件: `docs/markflow-core-stages/technical-plan.md`（995行）
- 首页状态: "方案已校准，待 M0 spike 冻结关键选型" — M0 已于 7/27 归档并完成
- 第69-107行建议的 Cargo workspace 结构与实际不一致：实际 `markflow-runtime` 位于 `src-tauri/crates/runtime/` 内，不是独立顶层 crate
- 需要: 更新状态为 "M3 已交付，等待 M4 规划"，同步架构描述与当前实现

**2.1.2: product-plan.md 状态同样滞后**
- 文件: `docs/markflow-core-stages/product-plan.md`
- "状态：方案已校准，待 M0 技术基线冻结" — M0 已完成，应更新为 "M0-M3 已完成，M4 规划中"

**2.1.3: feature-migration-matrix.md M3 条目模糊 + 状态错误**
- 文件: `docs/markflow-core-stages/feature-migration-matrix.md:3-7`
- 顶部状态仍写 "M3 实施中"，但 M3 已于 7/28 归档为已完成变更
- 多处标注 "M3 测试与验证中" — 和 M3 归档状态冲突，M3 已通过验收
- 需要: 更新顶部状态为 "M3 已验收"，逐项确认并更新已完成项状态

**2.1.4: M3 文档需要区分设计时基线与 post-M3 当前状态**
- 文件: `docs/markflow-core-stages/m3-core-backed-source-mode.md`（34KB）
- 第32-34行"当前基线"描述在 M3 设计时有效，但 post-M3 已演变
- 注：文档末尾已有“验收标准/退出条件”；后续复核重点是这些标准是否与归档证据一致，而不是重复新增 checklist

### 2.2 openspec/specs 体系问题（严重级别）

**2.2.0 (复核优先): 2026-07-29-m31-source-integrity-hardening 归档 delta 是否仍有漂移**
- 2026-07-29 已验证：`core-bridge-protocol`、`core-backed-source-mode`、`markflow-runtime`、`document-size-tier` 的主要 delta 已在主规范中；`source-patch-adapter` 的两个已迁移 requirement 残留已修复。
- 后续复核不要假设“16 行全缺失”；应逐 requirement 比对归档 delta 与主规范，并用 archive sync gate 验证。
- 必跑: `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`

**2.2.1: 3 个 spec.md 的 Purpose 字段仍为 TBD**
- `openspec/specs/code-block-serialization/spec.md:4` — "TBD - created by archiving change fix-code-block-trailing-newline"
- `openspec/specs/core-restructure/spec.md:4` — "TBD - created by archiving change restructure-core-code"
- `openspec/specs/ci-openspec-validation/spec.md:4` — "TBD - created by archiving change fix-openspec-validate-deps"
- 修复: 根据归档变更描述补充 Purpose 字段

**2.2.2: 7 个遗留 ProseMirror 架构的规格缺少 Legacy notice**
这些 spec 描述的是将在 M5-M8 中被替换的 ProseMirror 遗留行为，但没有 legacy 免责声明：
- `block-continuation-paragraph/spec.md` — 引用 `src/lib/editor.ts`, ProseMirror 节点
- `code-block-serialization/spec.md` — 引用 tiptap-markdown 往返
- `empty-line-preservation/spec.md` — 引用 `editor.serializer.ts`
- `trailing-newlines-preservation/spec.md` — 引用 `getMarkdown()`
- `source-toolbar-cm6/spec.md` — 引用 `Tiptap editor.chain().focus()`
- `product-spec.md` — 术语表将 Tiptap 定义为核心 WYSIWYG 引擎
- `font-stack/spec.md` — "编辑器正文（ProseMirror 编辑器区域）"
- 修复: 为每个文件添加 `> Legacy notice:` 块（参考 `architecture.md` 的格式）

**2.2.3: Legacy 架构文档与当前结构严重不符**
- `openspec/specs/architecture.md` — 第82-101行 src-tauri/src/ 结构不完整，缺少 `crates/runtime/`、`runtime_host.rs`、`core_bridge.rs`、`export.rs`
- `openspec/specs/technical-design.md` — 第85-97行包含6个月前的过时 `src/commands/` 结构；第300+行仍引用 `editor.serializer.ts`、`tiptap-markdown`
- 修复: 更新不完整的文件列表，或强化 legacy 定位

**2.2.4: Core 重构相关 spec 碎片化（后续独立 ADR/change）**
以下 10+ 个 spec 涉及 Core 重构，可大幅合并：
- `source-patch-adapter` + `source-sync-controller` + `source-lifecycle-guard` → 合并为 `core-source-adapter/spec.md`
- `markflow-runtime` + `runtime-document-service` + `save-integrity` → 合并为 `runtime-layer/spec.md`
- `core-bridge-protocol` + `core-backed-source-mode` 之间有重叠
- 建议: 本项不要和状态/Purpose/legacy 修正混在一个 PR。先写 ADR，再用独立 OpenSpec change 迁移 requirement、更新 INDEX、保留 Migration 指向。

**2.2.5: document-size-tier 阈值单位存疑**
- `openspec/specs/document-size-tier/spec.md:19-22` 使用 "MB"（可被理解为 10^6）
- `core_bridge.rs:273-279` 实现使用 `1_048_576`（= 1 MiB = 1024*1024）
- 修复: 统一单位注明，在 spec 中明确为 "MiB (1024*1024)"

**2.2.6: 中英双语不一致**
- 部分 spec 为纯英文、部分为中文、部分混杂
- 建议: 统一为中文（因 INDEX.md 和组织文档都是中文）

### 2.3 文档一致性检查清单

- [ ] `technical-plan.md` 中的 Cargo workspace 结构是否与实际一致？
- [ ] `feature-migration-matrix.md` 中的 M3 已完成项目全部标注为"已验收"？
- [ ] `architecture.md` 的 legacy 状态是否维持，还是需要更新？
- [ ] `core-restructure/spec.md` 是否与 `docs/markflow-core-stages/` 文档重复？
- [ ] `openspec/specs/` 中是否有描述已废弃 API 的 spec？

## 提示词

```
你是一个技术文档专家，负责审查 MarkFlow Core 重构的文档体系。

## 背景
MarkFlow 正在从 ProseMirror 架构迁移到 Rust native core 引擎。当前 M3 阶段
（Core-backed Source Mode）已基本实现，但文档体系存在滞后和碎片化问题。

## 任务 1：更新 stage docs 状态

### 1.1 更新 technical-plan.md
- [ ] 将状态从 "方案已校准，待 M0 spike 冻结关键选型" 更新为 "实施中 — M3 已交付"
- [ ] 检查并更新架构分层描述以匹配当前实现
- [ ] 确认 Cargo workspace 结构描述与实际一致
- [ ] 检查日期更新

### 1.2 更新 product-plan.md
- [ ] 将状态从 "方案已校准" 更新为反映 M3 交付情况
- [ ] 检查产品目标描述与当前实现是否匹配

### 1.3 更新 feature-migration-matrix.md
- [ ] 逐行检查 M3 条目，将已完成的标记为 "已验收"
- [ ] 清除模糊的 "测试与验证中" 标注
- [ ] 标记 M4+ 的合理预期

### 1.4 复核 m3-core-backed-source-mode.md
- [ ] 确认“当前基线”明确标注为设计时历史基线
- [ ] 确认 post-M3 当前实现状态包含 Core session、SourceSyncController、Runtime crate、Bridge adapter、feature flag 回退
- [ ] 确认文档末尾已有“验收标准/退出条件”，且不重复新增同义 checklist

## 任务 2：openspec/specs 体系清理

### 2.0 (严重) 先复核归档 delta 是否仍有漂移
- [ ] [P0] 逐 requirement 对比 `openspec/changes/archive/2026-07-29-m31-source-integrity-hardening/specs/**/spec.md` 与 `openspec/specs/**/spec.md`
- [ ] [P0] 不把历史“16 行未同步”当成事实；只修正当前仍存在的主规范漂移
- [ ] [P0] 运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`

### 2.1 Legacy specs 处理
- [ ] 审查 `architecture.md` 和 `technical-design.md` 的内容
- [ ] 如果完全被 stage docs 覆盖，在 INDEX.md 中标注为 "仅用于历史追溯"
- [ ] 如果部分内容仍有用，更新并移除 legacy 标注

### 2.2 修复 3 个 TBD Purpose 字段
- [ ] `openspec/specs/code-block-serialization/spec.md:4` — 填写 Purpose
- [ ] `openspec/specs/core-restructure/spec.md:4` — 填写 Purpose
- [ ] `openspec/specs/ci-openspec-validation/spec.md:4` — 填写 Purpose

### 2.3 为 7 个遗留 ProseMirror spec 添加 Legacy notice
- [ ] `block-continuation-paragraph/spec.md` — 添加 `> Legacy notice:` 块
- [ ] `code-block-serialization/spec.md` — 添加 legacy 标注
- [ ] `empty-line-preservation/spec.md` — 添加 legacy 标注
- [ ] `trailing-newlines-preservation/spec.md` — 添加 legacy 标注
- [ ] `source-toolbar-cm6/spec.md` — 添加 legacy 标注
- [ ] `product-spec.md` — 评估是否更新术语表
- [ ] `font-stack/spec.md` — 添加 legacy 标注（仅编辑器引用部分）

### 2.4 更新 Legacy 架构文档结构描述
- [ ] `architecture.md` — 更新第82-101行的源文件列表以反映当前结构
- [ ] `technical-design.md` — 更新第85-97行的 commands 结构描述

### 2.5 评估 spec 碎片化合并方案
- [ ] 评估: `source-patch-adapter` + `source-sync-controller` + `source-lifecycle-guard` → 合并为一个
- [ ] 评估: `markflow-runtime` + `runtime-document-service` + `save-integrity` → 合并为一个
- [ ] 评估: `core-bridge-protocol` + `core-backed-source-mode` 重叠部分
- [ ] 给出合并建议（具体操作可在单独变更中执行）

### 2.6 修复 document-size-tier 单位不匹配
- [ ] 在 spec 中明确阈值为 MiB (1024*1024) 而非 MB
- [ ] 或者将代码中的计算改为匹配 MB 语义

### 2.7 中英双语一致性
- [ ] 评估是否需要统一为中文
- [ ] 如有需要，转化 `markflow-core-foundation`, `markflow-runtime`, `core-bridge-protocol`, `save-integrity` 等英文 spec

## 任务 3：跨文档一致性检查

### 3.1 代码与文档一致性
- [ ] check: technical-plan.md 中描述的 lib.rs 公共 API 与实际一致
- [ ] check: 所有文档中提到的文件路径确实存在
- [ ] check: 文档中提到的功能特性标志与 `coreSession.ts` 中的一致

### 3.2 文档间交叉引用
- [ ] 检查 INDEX.md 中的 Core 重构引用是否指向正确的文件
- [ ] 确认所有 `../../docs/` 引用在 spec 中是合理的

## 验收标准
- 所有 stage docs 状态已更新到当前阶段
- feature-migration-matrix.md 中 M3 条目全部清晰标注
- openspec/specs 中的 Core 相关 spec 有明确的状态（保留/合并/废弃）
- INDEX.md 正确反映文档结构
```
