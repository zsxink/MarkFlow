# Core 文档与 OpenSpec 体系复核记录

> 日期：2026-07-29  
> Issue：#213  
> 分支：`docs/issue-213-core-docs-review`

## 总体评价

Core 重构文档体系的主要问题不是缺少方案，而是“阶段事实、legacy 边界、OpenSpec source-of-truth 与当前代码结构”之间有漂移。M3/M3.1 已把 Source Mode、Runtime save workflow、DocumentService、SaveLease、PathSaveCoordinator 和 true reload 推进到产品路径，但 stage docs 与部分 spec 仍保留 pre-M0/M3-in-progress 表述。

本次复核按“review findings are hypotheses”处理 `openspec/prompts/docs-review.md` 中的断言；经验证后修正确认问题，未确认或高风险结构调整仅记录后续建议。

## P0 / P1 / P2 结论

### P0（已修复）

- `2026-07-29-m31-source-integrity-hardening` 并非 16 行 delta 全量缺失；多数已同步到主规范。
- 确认的 P0 漂移是 `source-patch-adapter` 主规范仍保留已迁移到 `source-sync-controller` 的 `pending queue 上限` 与 `frame/composition batching` requirements。
- 已从 `openspec/specs/source-patch-adapter/spec.md` 移除上述旧 requirements，并保留 transaction 到 patch 的 adapter 边界。
- 验证：`npx openspec validate --all` 通过。

### P1（已修复）

- stage docs 顶部状态滞后：`README.md`、`technical-plan.md`、`product-plan.md`、`feature-migration-matrix.md` 已更新到 M3/M3.1 已完成、M4 规划中。
- `technical-plan.md` Cargo workspace 结构已改为当前实现：顶层 `markflow-core`、`src-tauri`、`src-tauri/crates/runtime`。
- `m3-core-backed-source-mode.md` 已保留设计时基线，并新增 post-M3 当前实现状态。
- 3 个 `Purpose: TBD` 已补全。
- 7 个 legacy ProseMirror/Tiptap spec 已增加 `Legacy notice`。
- `architecture.md` / `technical-design.md` 已强化 legacy 定位并补充当前 Core/Runtime/Bridge 结构指针。
- `document-size-tier` 已将阈值单位明确为 MiB (1024 * 1024 bytes)。

### P2（后续独立变更）

- Core 相关 spec 合并不应在本次直接执行；它会影响 capability 历史、archive 同步、索引和引用路径。
- 中英双语统一建议单独处理，优先范围是 Core/Runtime 相关 spec，不应和状态修正混在一个 PR。

## M4-M8 追加复核（2026-07-29）

### 总体评价

M4-M8 的总体方向是成立的：先稳定 App Shell / Editor Adapter，再推进 Core-backed WYSIWYG、EditCommand/History、专业 Markdown 能力和 Export/Host 边界。主要缺口是“未来规划”和“当前仓库事实”没有充分分离，且部分后续阶段缺少可验证的安全、性能和回退 gate。

### P0（未发现）

- 未发现会阻塞 M4-M8 文档继续作为后续重构路线图的问题。

### P1（已修复）

- M4-M8 已补充状态、依赖阶段和最后复核日期，避免把未来规划误读为当前实现。
- M4 已明确当前仓库没有 `solid-js` / `vite-plugin-solid` 依赖，引入 Solid 前必须有独立 ADR、vertical slice 和回退开关。
- M5 已补充 CodeMirror decoration/widget 约束：Render IR 只是 viewport projection，不是文档真相；影响布局或隐藏源码的 decoration 必须通过 selection/copy/IME/accessibility fixture。
- M6 已补充 Bridge / Editor Adapter 边界：UI/IPC 使用 revision-bound UTF-16 selection，`ByteOffset` 只作为 Core 内部表达；命令必须有 `commandId` 或 `transactionId`。
- M7 已统一大文档阈值为 1 MiB (1024 * 1024 bytes)，并补充 M7A-M7D 的独立 issue/OpenSpec、feature flag、回退和异步取消 gate。
- M8 已补充 Host capability/security matrix，与 Tauri v2 capability / permission 模型对齐，并增加 M8C legacy removal audit 条件。

### P2（后续建议）

- M4 真正引入 SolidJS 时，应单独新增 ADR，评估团队学习成本、bundle 影响、测试策略和旧入口回退期限。
- M5 Render IR 可以在实现前补一个 C4 L3 component view，明确 Core Render IR、Editor Adapter、CodeMirror Extension、Widget Host 的调用方向。
- M8 Host Adapter 可在实现前补一份 capability matrix 表格，将 file system、clipboard、dialogs、shell、network、render、export 的权限、错误码、超时和取消语义逐项列出。

## 独立 Sub-agent 统一复核（2026-07-29）

### 初始结论

Sub-agent 初始结论为“不建议通过”，原因是发现 1 个 P0、2 个 P1 和 1 个 P2。经主执行流复核，均为有效发现，已修复。

### P0（已修复）

- `core-bridge-protocol` 曾把“所有 Bridge 命令使用统一 `ProtocolEnvelope`”写成当前主规范要求，但当前实现只有 `apply_text_patch` 使用 `ProtocolEnvelope<Utf16TextPatchDto>`。
- 已将主规范修正为：`apply_text_patch` 当前使用 versioned Envelope；非 patch 命令保持稳定 DTO 兼容，后续全命令 Envelope 迁移必须通过 ADR 和协议兼容测试另行推进。

### P1（已修复）

- `scripts/check-archive-synced.sh` 曾按 capability + requirement 全局跳过所有被 REMOVED 的 requirement，存在“先 remove、后 re-add/modify 同名 requirement”时 false positive 的风险。
- 已改为记录 removal 所在 archive name，只跳过“当前 archive 之后被移除”的历史 requirement；后续 re-add/modify 将继续被 gate 检查。
- `source-patch-adapter` 的 `ChangeSet.compose` 场景正反例字面量相同，验收不可执行。已改为 `XYZ` -> `aXbYcZ` 的可区分示例，并列出错误拼接结果。

### P2（已修复）

- `source-patch-adapter` Purpose 仍声称覆盖 backpressure，但该 owner 已迁到 `source-sync-controller`。已把 Purpose 改为 patch extraction / legacy onUpdate compatibility，并显式指向 `source-sync-controller` 负责 pending queue、batching 和 backpressure。

## Well-Architected 评估

| 支柱 | 评价 | 改进建议 |
| --- | --- | --- |
| Operational Excellence | OpenSpec archive gate、`validate --all`、`check-archive-synced.sh` 已形成流程，但提示词把假设写成事实，容易重复误修。 | 保留本次 `review-findings.md`，并把 `docs-review.md` 改为“先验证后修复”的检查式提示词。 |
| Security | 本次不改运行时安全边界；legacy spec notice 避免误把旧 serializer 当作 Core 保存真相。 | 后续迁移 WYSIWYG/导出时继续检查 raw HTML、SVG sanitize、SSRF 与路径权限。 |
| Reliability | 已修复主规范中迁移后旧 requirement 残留，降低 SourceSyncController/adapter 双 owner 风险。 | 合并 spec 前先写 ADR，明确 source adapter、runtime layer、bridge 的 owner。 |
| Performance Efficiency | MiB 单位澄清与 M3 large fixture 表述降低阈值误读风险。 | 后续统一 stage docs 中 MB/MiB 术语，并保留 1/10/50 MiB benchmark 记录。 |
| Cost Optimization | 未直接合并 10+ spec，避免一次性大规模重排造成 review/归档成本。 | 按 capability owner 分 2-3 个小变更逐步整理。 |
| Sustainability | 文档治理本身不直接影响计算资源；MiB 与 large-document 策略澄清有助于避免无谓全文 serializer 路径。 | 后续把大文件预算、后台任务取消和 incremental parse 的资源约束沉淀到规范。 |

## ADR 建议：Core spec 分层整理

### 标题

Core 重构相关 OpenSpec capability 的分层合并策略

### 状态

提议

### 背景与问题陈述

M3/M3.1 后，Source Mode、Runtime、Bridge、Save integrity 相关规范横跨多个 capability。碎片化提高了阅读成本，也容易让旧 adapter requirement 与新 controller requirement 同时存在。

### 决策驱动因素

- 保留 OpenSpec archive 历史可追溯性。
- 避免一次 PR 同时做行为修正和目录重排。
- 保持 Source adapter、Runtime layer、Bridge protocol 的依赖方向清晰。
- 让每个 capability 有单一 owner 与最小可验证场景。

### 选项评估

| 选项 | 优点 | 缺点 | 建议 |
| --- | --- | --- | --- |
| 保持现状，仅加索引 | 风险低、改动小 | 仍然碎片化，后续易重复读错 | 短期可接受 |
| 合并为 `core-source-adapter`、`runtime-layer`、`core-bridge-protocol` 三组 | owner 清晰，减少重复 | 需要 REMOVED/ADDED delta 和索引迁移 | 推荐后续独立变更 |
| 全部合并为一个 `markflow-core-migration` | 阅读入口简单 | 过宽，失去模块测试边界 | 不推荐 |

### 决策结果

建议后续独立 OpenSpec change 采用三组能力：

- `core-source-adapter`: 合并 `source-patch-adapter`、`source-sync-controller`、`source-lifecycle-guard` 中前端 Source Mode adapter/controller/lifecycle 约束。
- `runtime-layer`: 合并 `markflow-runtime`、`runtime-document-service`、`save-integrity` 中 Runtime service、save coordinator、reload、Host trait 约束。
- 保留 `core-bridge-protocol` 独立，`core-backed-source-mode` 作为用户路径/验收聚合规范，不再复制底层 protocol/runtime 细节。

### 后果

- 正面：降低重复 requirement、提升 review 路由准确性。
- 负面：需要迁移 INDEX、archive delta、跨引用和历史链接；执行不当会造成 spec validate 或 archive sync gate 失败。

### 验证方式

- 为合并变更新增 OpenSpec delta，使用 REMOVED + Migration 指向新 capability。
- 运行 `npx openspec validate --all`。
- 运行 `bash scripts/check-archive-synced.sh`。
- 通过索引自检命令确认没有未索引 spec。

## 方法论来源

- AWS Well-Architected Framework: https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html
- ADR overview: https://github.com/architecture-decision-record/architecture-decision-record
- Microsoft ADR guidance: https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record
- OpenSpec CLI docs: https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md
- Solid fine-grained reactivity: https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity
- Solid stores: https://docs.solidjs.com/concepts/stores
- CodeMirror decorations: https://codemirror.net/examples/decoration/
- CodeMirror reference manual: https://codemirror.net/docs/ref/
- Tauri v2 calling Rust from frontend: https://v2.tauri.app/develop/calling-rust/
- Tauri v2 capabilities: https://v2.tauri.app/security/capabilities/
- Tauri v2 security: https://v2.tauri.app/security/

## 验证结果

- M4-M8 追加复核后再次运行 `npx openspec validate --all`：通过，69 items passed。
- M4-M8 追加复核后再次运行 `bash scripts/check-archive-synced.sh`：通过，cutoff 之后归档 delta 均已同步。
- M4-M8 追加复核后再次运行 `npx tsc --noEmit`：通过。
- 独立 sub-agent 统一复核后修复 P0/P1/P2，并再次运行 `npx openspec validate --all`、`bash scripts/check-archive-synced.sh`、`bash -n scripts/check-archive-synced.sh` 与 `npx tsc --noEmit`。
- `npx openspec validate --all`：通过，69 items passed。
- `bash scripts/check-archive-synced.sh`：通过，cutoff 之后归档 delta 均已同步；70 个 cutoff 前 legacy archive 跳过。
- `npx openspec validate archive-sync-gate --strict`：通过。
- INDEX 自检命令：无缺失输出。
- 关键路径/feature flag 检查：`coreSession.ts`、`SourceSyncController.ts`、`editor.sourcePatcher.ts`、`core_bridge.rs`、`runtime_host.rs`、`src-tauri/crates/runtime/src/**` 均存在；`isCoreBackedSourceModeEnabled()`、`openCoreSession()`、`saveCoreSession()`、`Core Source` 均可定位。
- `npm test`：通过，36 files / 401 tests passed。测试过程中有既有 Tauri invoke mock 日志 stderr，但未导致失败。
- `npx tsc --noEmit`：通过。
- `cargo test -p markflow-core`：通过。
- `cargo test -p markflow-runtime -- --skip save_lease_panic_does_not_leak_token`：通过，跳过 1 个已确认会卡住的 panic-path 测试。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`：通过，123 tests passed。
- `cargo test --workspace`：未完成；卡在 `save_lease_panic_does_not_leak_token` 超过两分钟后手动中断。该卡住与本次文档/spec/script 变更无直接耦合，但会影响“完整 Rust workspace 全量通过”的声明。
