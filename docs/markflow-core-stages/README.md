# MarkFlow Core 重构阶段方案索引

> 状态：方案已校准，待 M0 技术基线冻结
> 更新日期：2026-07-25

本目录将 MarkFlow Core 大重构拆成可独立评审、实施和验收的阶段方案。每个阶段都包含技术方案、交付范围、验收标准、测试要求、风险与依赖。

核心文档：

- [产品计划书](product-plan.md)
- [技术方案](technical-plan.md)
- [功能迁移矩阵](feature-migration-matrix.md)

阶段顺序：

1. [M0 Architecture Baseline](m0-architecture-baseline.md)
2. [M1 Core Foundation](m1-core-foundation.md)
3. [M2 Parse Index, StyleMap and Large Document Policy](m2-parse-index-stylemap.md)
4. [M3 Core-backed Source Mode](m3-core-backed-source-mode.md)
5. [M4 SolidJS App Shell and Editor Adapter](m4-solidjs-app-shell-editor-adapter.md)
6. [M5 Core-backed WYSIWYG Editing MVP](m5-core-backed-wysiwyg-mvp.md)
7. [M6 Core Edit Commands, History and Existing Feature Migration](m6-edit-commands-history-feature-migration.md)
8. [M7 Tables, FrontMatter, Assets, Search and Diagnostics](m7-tables-frontmatter-assets-search-diagnostics.md)
9. [M8 Export IR, Host Portability and Full Migration](m8-export-ir-host-portability-full-migration.md)

总体原则：

- 先 Core，后 UI。
- 先保真，后美化。
- 先 Source Mode 接入 Core，再重建 Core-backed 所见即所得。
- 所见即所得编辑模式长期保留；移除的是旧 serializer 真相链路。
- 插件系统本轮不做，只保留内部扩展点。
- 超过 1MB 的 Markdown 文档进入 Large Document 策略。
- Tauri 是 Host Adapter，不是应用框架。
- Core 是 confirmed document truth，CodeMirror 是乐观编辑镜像。
- Core 与 Host 之间由 Runtime/Application Service 协调用例和副作用。
- `bekoedit` / `bekoedit-markdown` 作为 Lossless Markdown Engine 的参考实现和 M0 对照基线，不预设为生产依赖。
- History 在 M6 完成 Core 单一 owner 切换。
- 每个阶段都必须有可重复的 fixture、单元测试或 e2e 验收。
- 每个阶段通过 Go / No-Go gate 后才能进入下一阶段。
- 每个阶段或子里程碑独立建立 Issue、分支和 OpenSpec change，避免巨型长期分支。
