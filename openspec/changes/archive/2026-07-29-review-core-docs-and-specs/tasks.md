## 1. 验证与同步 P0

- [x] 1.1 对照 `2026-07-29-m31-source-integrity-hardening` 归档 delta 与主规范，确认缺失项并同步
- [x] 1.2 运行 OpenSpec 验证，确认同步后的主规范合法

## 2. 更新 stage docs

- [x] 2.1 更新 `technical-plan.md` 的阶段状态和当前 crate/模块结构描述
- [x] 2.2 更新 `product-plan.md` 的阶段状态和当前产品落地边界
- [x] 2.3 更新 `feature-migration-matrix.md` 中 M3/M3.1 状态，清除已完成项的模糊表述
- [x] 2.4 为 `m3-core-backed-source-mode.md` 补充可验证验收清单

## 3. 清理 OpenSpec specs

- [x] 3.1 修复 3 个 `Purpose: TBD` 字段
- [x] 3.2 为确认属于 legacy ProseMirror/Tiptap 边界的 spec 增加 Legacy notice
- [x] 3.3 更新 `architecture.md` 和 `technical-design.md` 的当前结构或 legacy 定位
- [x] 3.4 修复 `document-size-tier` MiB/MB 单位表述
- [x] 3.5 记录 Core 相关 spec 碎片化合并建议，暂不执行大规模合并

## 4. 跨文档一致性与提示词优化

- [x] 4.1 检查关键路径、Core API/feature flag 引用与当前仓库一致
- [x] 4.2 优化 `openspec/prompts/docs-review.md`，把已处理项、需后续独立变更项和验证要求写清楚

## 5. 验证

- [x] 5.1 运行 `npx openspec validate --all`
- [x] 5.2 运行 `bash scripts/check-archive-synced.sh`
- [x] 5.3 运行前端/Rust 相关基础检查，或记录无法运行的明确原因

## 6. M4-M8 重构文档追加复核

- [x] 6.1 为 M4-M8 阶段文档补充状态、依赖和最后复核日期
- [x] 6.2 对照当前仓库基线，明确 M4 SolidJS 仍为规划中且需独立 ADR/vertical slice
- [x] 6.3 补充 M5 CodeMirror decoration/widget 的 viewport、selection、IME 和 cleanup 约束
- [x] 6.4 补充 M6 Bridge / Editor Adapter 的 UTF-16 selection、Core byte offset 和 transaction id 边界
- [x] 6.5 补充 M7/M8 子里程碑 gate、MiB 单位、Host capability/security matrix 和 legacy removal audit

## 7. 独立 sub-agent 统一复核

- [x] 7.1 派出独立 sub-agent 做只读统一复核
- [x] 7.2 修正 `core-bridge-protocol` 中未实现的全命令 Envelope 当前规范表述
- [x] 7.3 修正 archive sync gate 对 REMOVED requirement 的全局跳过风险
- [x] 7.4 修正 `source-patch-adapter` Purpose owner 和 `ChangeSet.compose` 不可执行示例
- [x] 7.5 重新运行 OpenSpec、archive sync、脚本语法和 TypeScript 验证
