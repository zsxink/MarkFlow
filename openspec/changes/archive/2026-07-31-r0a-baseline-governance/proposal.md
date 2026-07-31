## Why

二期（#247/#250）拆分为 15 个阶段工作包后，"完成"仍是自由文本 checklist，无法区分"架构完成、实现完成、自动验证、桌面验证、平台验证、产品验收"。若 R0 不先建立可审计的 program 与证据模型，后续 119 项任务会在多个 child change 中失真，且 archive 时无法证明 required gate 真实执行。

## What Changes

- 建立覆盖 CommonMark、GFM、CJK、malformed、nested、table、FrontMatter、image、diagram、HTML、LF/CRLF/mixed EOL、BOM、1/10/50 MiB 的 canonical fixture 集合与 manifest（`markflow-core/fixtures/manifest.json` + hash）。
- 建立 machine-readable capability/evidence matrix（owner、child change、flag、implementation、unit、integration、desktop、visual、IME、platform、observation、evidence URI），可被 `scripts/check-capability-matrix.sh` 解析校验。
- 固定 evidence 目录 `stage/case/platform/revision/timestamp`，修订 R0 baseline report，记录当前 binary revision、复现步骤、截图、日志目录与已知错误。
- 增加 archive honesty check：evidence 为空、revision 不匹配或 required gate 未执行时 archive/merge 失败。
- 定义每阶段 feature flags、默认值、fallback 与删除时间；**BREAKING**：任何 flag 只允许回退到 exact source projection，禁止引入 serializer/DOM save fallback。
- 冻结 benchmark、visual、IME、widget P0/P1、observation manifests 与 release-gate ADR。
- 收敛任务归属：tasks `1.1-1.7`、`2.10` 唯一映射到本 child change，每个 umbrella task 只有一个 child owner。
- 修正 `docs/markflow-core-phase2` 状态语言，使已归档 charter 只作为 program charter，不再被误认为当前实现追踪源。

## Capabilities

### New Capabilities

- `phase2-governance`: 二期 capability/evidence matrix、task 归属、honesty check 与 evidence 目录约定，定义"完成"状态的可审计边界。
- `canonical-fixtures`: 可重复生成的 Markdown/EOL/large-document canonical fixtures 与 manifest/hash 校验。
- `feature-flag-rollback`: 每阶段 feature flags、默认值、fallback 与删除时间，以及仅 exact source projection 的 rollback 约束。

### Modified Capabilities

- `visual-release-gate`: R0 起冻结 benchmark、visual、IME、widget 与 observation manifests，并作为 archive 门禁的依据；R0 自身交付 release-gate ADR。
- `archive-sync-gate`: 增加 honesty check 变体——证据为空、revision 不匹配或 required gate 未执行时归档失败；validated 后 evidence 需来自当前 commit。
- `ci-openspec-validation`: 将 capability matrix 解析校验与 fixture manifest hash 校验纳入统一 `npm run validate:openspec` 门禁。
- `documentation-consistency`: 修正二期阶段文档状态语言，区分 charter、当前实现与未来计划，禁止把"charter 已归档"描述为"产品已验收"。

## Impact

- `docs/markflow-core-phase2/**`：README 状态语言、stage 文档、验收手册、追踪矩阵按 R0A 修正。
- `openspec/specs/`：新增 3 个 capability spec，修改 4 个既有 spec。
- `scripts/`：新增 fixture manifest/hash、capability matrix 解析与 archive honesty check 脚本。
- `markflow-core/fixtures/`：合并 canonical Markdown/EOL/size fixtures 与 manifest；统一在既有 `markflow-core/fixtures/` 目录下维护。
- CI：`ci-openspec-validation` 与 archive sync gate 扩展解析校验与 honesty check。
- 日志：仅增加不含文档内容的可观测性字段，不改变产品编辑行为。
