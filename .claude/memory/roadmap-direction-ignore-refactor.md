---
name: roadmap-direction-ignore-refactor
description: 用户决断——关闭 GitHub 全部 issue/PR，放弃大重构方案，全力转向全新五方向
metadata:
  type: project
---

用户（2026-08-30）在路线图规划中做出决断：**当前 GitHub 仓库（origin `zsxink/MarkFlow`）所有 issue 和 PR 已全部关闭**（含此前判定"太费人"的 `#254` CodeMirror Live Preview 无损编辑链路、`#255` lossless byte contract，以及 markflow-core 分层 M1–M8 大重构方案）——**放弃现有的大重构方案**。已核实 2026-08-30：`gh issue list --state open` 与 `gh pr list --state open` 均为空。

**Why:** 重构投入产出比不符当前优先级；用户要面向用户价值的可见产出，重构线整体存档/清零。

**How to apply:** 后续任何计划**不要**默认把 #254/#255、markflow-core 分层（M1–M8）、CodeMirror Live Preview 重构当作主线条目——被视为已放弃除非用户重新提出。路线图以全新五方向（优化/增强/主题/图床/修复）为主体，见 `docs/next-phase-roadmap.md`。

相关：[[roadmap-enhancement-katex-table-frontmatter]]、[[roadmap-theme-css-files]]、[[roadmap-imagehost-picgo-server]]、[[roadmap-optimization-boundary]]
