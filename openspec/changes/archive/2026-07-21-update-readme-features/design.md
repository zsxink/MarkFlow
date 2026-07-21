## Context

README.md 是项目的第一入口文档。当前版本缺少对多个已实现功能的介绍，并且包含一处重复行。本次变更涉及纯内容更新，不涉及代码或架构改动。

## Goals / Non-Goals

**Goals:**
- README「功能特性」列表同步到当前产品实际能力
- 快捷键表补充缺失的 `Ctrl+Shift+S`（另存为）
- 项目文档表删除重复行
- 确保 P0 级功能全部在 README 中有体现

**Non-Goals:**
- 不修改 openspec/specs 中的产品规格文档
- 不涉及代码、UI、API 或依赖变更
- 不改变 README 的整体结构或排版风格

## Decisions

1. **追加而非重写功能列表**
   - 现有列表保留，仅追加缺失项
   - 理由：避免破坏已有链接和格式，最小化 diff

2. **参照 product-spec.md 的 P0 优先级确认覆盖完整性**
   - 将 README 功能逐条与 product-spec.md 比对，确保 P0 功能全部提及
   - 非 P0 功能根据实际用户体验决定是否列入

3. **快捷键表与功能列表分开维护**
   - 快捷键表中出现但功能列表未提及的操作（如 Ctrl+Shift+S 另存为），同时补充到功能列表

## Risks / Trade-offs

- [后续同步] README 仍可能再次滞后 → 建议在开发流程中加入 README 更新 checklist
- [格式兼容] 中文 Markdown 在不同渲染引擎中的表现可能略有差异 → 保持在 GitHub 默认渲染范围内
