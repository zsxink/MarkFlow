## Why

现有 spec 文档分散在多个文件中，存在大量内容重叠（product-spec.md、technical-design.md、architecture.md 在技术选型、项目结构、主题系统等方面重复）。同时项目缺少结构化的 spec 管理流程和代码知识图谱。

## What Changes

1. **合并去重** — 将 architecture.md 合并到 technical-design.md，消除内容重复
2. **迁移到 OpenSpec** — 使用 OpenSpec CLI 统一管理 spec 文档，建立 spec-driven development 流程
3. **集成 CodeGraph** — 为项目添加代码知识图谱，提升 AI 助手开发效率
4. **清理** — 删除空目录和废弃的 QA HTML 文件

## Capabilities

### New Capabilities
- `spec-management`: 基于 OpenSpec 的规范文档管理，包括变更提案、spec 差分、设计文档、任务追踪
- `code-intelligence`: 基于 CodeGraph 的代码知识图谱，为 AI 助手提供语义级代码理解

### Modified Capabilities
（无需修改现有 capability）

## Impact

- docs/product-spec.md → openspec/specs/product-spec.md（精简去重）
- docs/architecture.md → 合并到 openspec/specs/architecture.md
- docs/technical-design.md → 合并到 openspec/specs/technical-design.md
- 新增 openspec/ 目录管理 spec 生命周期
- 新增 .codegraph/ 目录存储代码图谱
