## Context

当前 archive 流程依赖人工检查 delta spec 是否已同步到主规范（`openspec/specs/<capability>/spec.md`）。issue #150 已发生一次遗漏，需通过自动化来消除这一风险点。

CI 目前已有测试、类型检查、Rust 代码质量验证，但缺少对 OpenSpec 制品自身完整性的校验。

## Goals / Non-Goals

**Goals:**
- 归档后自动校验 delta spec 内容已存在于对应主规范中
- CI 中每次 PR 和推送都运行 `openspec validate --all` 确保所有 spec 合法
- 开发流程文档中明确「归档后验证」步骤

**Non-Goals:**
- 不自动同步 delta 到主规范（仍然是人工操作，gate 只做检测）
- 不修改现有的 archive 流程脚本
- 不校验 archive date cutoff 之前的旧归档（历史存量不追责）

## Decisions

1. **校验策略：内容行匹配 vs AST/结构对比**
   - 选择：内容行匹配（grep -qF）
   - 理由：delta spec 和主规范都是 markdown，内容行匹配简单可靠，避免引入 markdown parser 依赖。误报率低——delta spec 的实质性要求行（设定规则、描述行为）应逐字出现在主规范中；若因措辞不同导致误报，正好说明同步不够精确，值得人工确认。
   - 替代方案：markdown AST 对比（复杂度高，维护成本大，收益不成比例）

2. **Cutoff 机制：日期前缀 vs git 提交记录**
   - 选择：archive 目录名日期前缀比较（字符串比较）
   - 理由：archive 目录格式固定为 `YYYY-MM-DD-<name>`，取前 10 字符即可比较，零开销、零依赖
   - 替代方案：查 git 提交时间（性能开销大，边界情况复杂）
   - 环境变量 `ARCHIVE_SYNC_CUTOFF` 允许覆盖 cutoff 日期，用于 backdate 场景

3. **CI 步骤位置**
   - `openspec validate --all` 放在 `Install dependencies` 之后、`Build frontend` 之前（早失败早反馈）
   - `check-archive-synced.sh` 紧随其后，与 spec 合法性校验一起构成完整的 archive 验证层

## Risks / Trade-offs

- [内容行匹配的假阴性] → delta spec 中的非同步内容恰好与主规范中已有文本匹配。概率低，且匹配内容宽度 ≥6 字符进一步降低风险。
- [正文措辞差异导致假阳性] → 实际上这验证了同步的精确性，可接受。若团队认为某处同步不需逐字匹配，可调整 delta spec 措辞。
- [新增归档时 CI 失败] → 开发者在归档前必须确保 delta spec 内容已同步到主规范，这正是 gate 的意图。
