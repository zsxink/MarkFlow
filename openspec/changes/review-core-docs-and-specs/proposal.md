## Why

Core 重构已经推进到 M3/M3.1，但 stage docs、OpenSpec 主规范和归档变更之间存在状态滞后、legacy 边界不清、归档 delta 疑似未同步等问题。继续让文档与 spec 分散漂移，会削弱后续 M4-M8 方案评审、实现验收和归档 gate 的可信度。

## What Changes

- 复核 `openspec/prompts/docs-review.md` 中列出的每个问题，只修正经当前仓库证据确认成立的文档/spec 不一致。
- 更新 Core stage docs 的阶段状态、当前实现结构、M3 验收清单和迁移矩阵表述。
- 同步已归档变更中遗漏传播到主规范的 delta，并修复相关 OpenSpec Purpose、Legacy notice、单位和结构描述问题。
- 为 spec 碎片化给出架构评审结论和后续合并建议，不在本次变更中大规模重排 capability 文件。
- 不修改运行时代码、不改变用户可见产品行为。

## Capabilities

### New Capabilities

- `documentation-consistency`: 规范 Core 重构文档、OpenSpec 主规范、归档变更和代码事实之间的一致性维护要求。

### Modified Capabilities

无。本次变更不改变已有产品能力的运行时行为要求；对已有 spec 的编辑只用于同步归档 delta、补足元信息或澄清 legacy/status/单位表述。

## Impact

- 影响文档：`docs/markflow-core-stages/**`、`openspec/specs/**`、`openspec/prompts/**`。
- 影响 OpenSpec：新增本变更的计划 artifacts，并可能新增 `documentation-consistency` 主规范。
- 不影响源码、API、依赖、构建流程或运行时数据模型。
