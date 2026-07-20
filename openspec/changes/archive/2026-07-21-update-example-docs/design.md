## Context

示例文档 `example/example-en.md` 和 `example/example-zh.md` 仅覆盖了基础 Markdown 语法和 Mermaid 图表，缺少以下已实现功能的展示：

- PlantUML 图表（完成于 PR #114/#117/#119）
- Markdown 超链接语法
- 裸 URL 自动识别（url-decoration 模块）
- 更多图片引用样式

更新这些示例文档无需修改任何代码、规范或配置。

## Goals / Non-Goals

**Goals:**
- 在英文和中文示例文档中分别新增 PlantUML 图表示例
- 补充 Markdown 超链接示例（外部链接、内部锚点）
- 添加裸 URL 文本，展示自动识别效果
- 展示更多图片引用样式

**Non-Goals:**
- 不修改任何源码或规范文档
- 不涉及导出功能、代码块行号等编辑器交互特性的示例（这些属于编辑器行为，无需文档内容体现）
- 不做文档结构重构，保持现有格式与风格

## Decisions

1. **直接编辑现有文件** — 在 `example/example-en.md` 和 `example/example-zh.md` 中增量追加新章节，不拆分文件
2. **保持与 issue #143 一致** — 补充内容已在 issue 中确认，无需额外讨论
3. **PlantUML 示例使用简短且安全的图表** — 选择不涉及敏感信息的简单 UML 图（时序图、流程图），确保示例在任何配置下都能理解
4. **URL 示例使用 example.com** — 遵循 RFC 2606 保留域名，避免意外指向真实网站

## Risks / Trade-offs

- 无风险。本次变更为纯文档内容更新，不涉及任何代码逻辑。
