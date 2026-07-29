## Context

MarkFlow 同时维护 stage docs（阶段方案/验收上下文）和 OpenSpec specs（可归档、可验证的行为约束）。M0-M3/M3.1 已陆续归档后，部分文档仍保留早期 ProseMirror/Tiptap 或 pre-M0 描述；同时 `docs-review.md` 把若干问题作为断言列出，需要逐项用当前仓库证据复核。

约束：
- 在 `docs/issue-213-core-docs-review` 分支完成，不在 `main` 上修改。
- 以仓库当前代码、归档 change、OpenSpec 主规范为事实来源。
- 对 review prompt 中的 claim 按假设处理；未确认的问题只记录建议，不直接大规模改写。
- 本次是文档/spec 治理，不引入运行时行为变更。

## Goals / Non-Goals

**Goals:**
- 修正文档状态和当前实现结构，使 M3/M3.1 之后的读者能判断哪些内容是当前事实、历史背景或后续计划。
- 同步归档 delta 到主规范，确保 archive-sync gate 对主规范有效。
- 为 legacy ProseMirror spec 添加清晰边界，避免 M4-M8 迁移期间误读为最终 Core 架构。
- 保留可审查性：把 spec 合并这类高风险结构调整降级为后续 ADR/变更建议。
- 使用可运行命令验证 OpenSpec、文档链接/路径和前端/Rust 基础检查。

**Non-Goals:**
- 不合并或重命名 10+ 个 OpenSpec capability 目录。
- 不改 Rust/TypeScript 运行时代码来适配文档。
- 不归档本变更，除非所有验证完成且按项目要求完成独立复核。

## Decisions

1. **先同步缺失 delta，再做文本清理**
   - 选择：优先处理 `2026-07-29-m31-source-integrity-hardening` 已归档 delta 与主规范差异。
   - 替代：先做 stage docs 状态更新。拒绝原因是主规范遗漏属于 P0，会污染后续一致性判断。

2. **Legacy spec 使用 notice 而非删除**
   - 选择：对仍描述 ProseMirror/Tiptap 现状或历史行为的 spec 增加 `Legacy notice`，并在必要处指出 Core 迁移阶段。
   - 替代：删除或合并 legacy spec。拒绝原因是这些 spec 仍是回归约束和历史行为说明，直接删除会损失验收语义。

3. **碎片化合并仅输出 ADR/建议，不在本次执行**
   - 选择：给出合并候选、边界和优先级，后续用独立 OpenSpec change 执行。
   - 替代：本次直接合并目录。拒绝原因是 OpenSpec capability 重排影响 archive 历史、引用路径和 CI gate，超出文档状态修正的安全范围。

4. **状态文本以“当前事实 + 后续阶段”表达**
   - 选择：stage docs 只把 M0-M3/M3.1 已完成、M4+ 待规划写清楚，不承诺未实现能力。
   - 替代：把所有计划文档改成最终架构描述。拒绝原因是会掩盖未完成迁移风险。

## Risks / Trade-offs

- [Risk] 文档中仍可能有未扫描到的旧路径或旧术语 → [Mitigation] 使用路径检查、关键词扫描和 `openspec validate --all` 验证，并记录未处理建议。
- [Risk] 主规范 delta 同步与人工编辑冲突 → [Mitigation] 先 diff 归档 delta 与主规范，逐段同步，之后运行 archive sync gate。
- [Risk] Legacy notice 过宽导致现行行为被误标为废弃 → [Mitigation] notice 明确“迁移边界”，不声明功能立即废弃。
- [Risk] 文档治理 spec 自身过度工程 → [Mitigation] 只新增最小规范，用于固化本项目已存在的归档同步和文档一致性要求。
