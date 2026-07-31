# MarkFlow Core 二期多阶段实施索引

> 已归档的 umbrella change 只做 program charter。每个工作包必须建立独立
> Issue、branch、OpenSpec child change、PR 和验收证据。

## 执行规则

每个阶段文档都是一个独立交付单元，必须按以下顺序执行：

1. 创建真实 GitHub Issue，从 `main` 创建符合规范的分支。
2. 创建 child OpenSpec change，将 requirement 和 umbrella task ID 唯一映射到该 child。
3. 记录输入基线、feature flag、fallback、rollback 和证据目录。
4. 先完成 contract/fixture，再实现，再完成 unit/integration/desktop evidence。
5. 运行适用的本地 CI gate，派独立 agent 复核。
6. delta spec 先 sync，再 archive；archive 与实现进入同一 PR。
7. child 合并后更新独立 program tracking 文档，不修改已归档 umbrella checklist。

## 阶段文档

| 顺序 | 阶段 | 目标 | OpenSpec tasks |
| ---: | --- | --- | --- |
| 1 | [R0A 基线、治理与证据系统](./stages/r0a-baseline-governance.md) | 建立可审计的 program 与证据模型 | 1.1-1.7, 2.10 |
| 2 | [R0B Parser 与 Bridge Spike](./stages/r0b-parser-bridge-spike.md) | 验证 parser/source-map 和真实 IPC | 2.1-2.9 |
| 3 | [R0C Projection 正确性](./stages/r0c-projection-correctness.md) | 修复 stale、ack、degraded 和现有路由 | 3.1-3.10 |
| 4 | [R1A 单一 EditorSurfaceBinding](./stages/r1a-single-editor-surface.md) | Source/WYSIWYG 共用一个 EditorView | 4.1-4.8 |
| 5 | [R1B Command Router 与单一 History](./stages/r1b-command-history.md) | 统一命令、事务时序、History 和输入内核 | 5.1-5.10 |
| 6 | [R2A Concrete Syntax 与 Render IR v2](./stages/r2a-render-ir-v2.md) | 建立 lossless 生产语义模型 | 6.1-6.9 |
| 7 | [R2B Typora Live Preview](./stages/r2b-live-preview.md) | 分 cohort 完成 marker fold/reveal | 7.1-7.13 |
| 8 | [R3A Task 与 Code Fence Widgets](./stages/r3a-task-code-widgets.md) | 建立同步 widget protocol pilot | 8.1, 8.7-8.8, 8.12 部分 |
| 9 | [R3B Table 与 Image Widgets](./stages/r3b-table-image-widgets.md) | 完成 lossless table 与资源事务 | 8.2-8.6, 8.12 部分 |
| 10 | [R3C FrontMatter、Diagram 与 HTML](./stages/r3c-frontmatter-diagram-html.md) | 完成安全结构化与异步 widgets | 8.9-8.12 |
| 11 | [R4A Input Integrity](./stages/r4a-input-integrity.md) | 完成 IME、自然编辑、clipboard 和无障碍 | 9.1-9.11 |
| 12 | [R4B Performance、Security、Resilience](./stages/r4b-performance-security.md) | 达到大文档预算与安全门禁 | 10.1-10.8 |
| 13 | [R5A Desktop、Visual 与 Platform](./stages/r5a-desktop-visual-platform.md) | 收集 required 发布证据 | 11.1-11.10 |
| 14 | [R5B 稳定观察](./stages/r5b-stability-observation.md) | 验证同一 release candidate | 11.11 |
| 15 | [R5C Legacy Cleanup 与 Archive](./stages/r5c-cleanup-archive.md) | 删除旧路径并完成最终归档 | 12.1-12.10 |

## 关键路径

```text
R0A -> R0B -> R0C -> R1A -> R1B -> R2A -> R2B
                                          |
                                          v
                            R3A -> R3B -> R3C
                                          |
                                          v
                                    R4A + R4B
                                          |
                                          v
                                    R5A -> R5B -> R5C
```

`9.1-9.2` 的最小 composition tracking/protected range 必须在 R1B/R2B pilot 前落地；
R4A 负责完整语言矩阵与产品硬化。R5B 必须基于 R5A 冻结的候选 build，R5C 不得与
observation 并行。

## 跨阶段不变量

- Core text 是唯一文档真相。
- 所有异步结果必须匹配 binding generation、session、document、revision、request。
- unsupported/unsafe 必须精确 source fallback。
- 未通过 composition/selection gate 的 construct 默认关闭。
- 未执行 GUI、visual、IME、platform、observation 证据不得标记通过。
- child change 必须满足[验收手册](./03-acceptance-and-manual-test-plan.md)和
  [追踪矩阵](./04-traceability-matrix.md)。

