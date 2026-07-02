## Context

项目已有三份规格文档（product-spec.md、technical-design.md、architecture.md），但内容重叠度高。architecture.md 的主要内容（技术栈、项目结构、图片渲染、Asset Protocol、文件监听）在 technical-design.md 中都有覆盖。根据实际代码状态，src-tauri/src/markdown/ 目录为空（pulldown-cmark 从未实际集成），src/styles/themes/ 和 fonts/ 为空（主题变量集中在 variables.css 中）。

## Goals / Non-Goals

**Goals:**
- 建立 OpenSpec 驱动的 spec 管理流程
- 合并去重现有 spec 文档，消除不一致
- 集成 CodeGraph 提供代码知识图谱
- 清理项目中无用的空目录和废弃文件

**Non-Goals:**
- 不改动任何源代码
- 不改变项目构建流程
- 不新增或修改功能

## Decisions

1. **主 spec 位置**：openspec/specs/ 作为 canonical spec 位置，docs/ 内容全部合并到 openspec/ 后删除
2. **product-spec.md**：保留产品视角的完整规格（用户画像、功能列表、验收标准），移除与 technical-design 重复的技术选型表
3. **architecture.md + technical-design.md 合并策略**：technical-design.md 为架构主文档，architecture.md 的精简架构概览保留为独立文档
4. **旧文件清理**：docs/ 内容全部合并到 openspec/ 后删除，消除双份维护风险

## Risks / Trade-offs

- **一致性问题**：ui-design 移到 openspec/ui-design/，需确保引用路径已更新
- **CodeGraph 存储**：.codegraph/ 目录随项目体积增长可能变大，已在 .codegraph/.gitignore 中配置忽略
