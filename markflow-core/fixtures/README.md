# Fixtures

MarkFlow 测试工具（lossless 测试、benchmark）使用的 Markdown fixture 文件。

## 目录结构

- `lossless/` — 无损保真测试的输入文件，涵盖 BOM、EOL、FrontMatter、HTML 注释、代码围栏、列表 marker、表格对齐、Unicode 等场景。每个文件测试一种特定格式模式，用于确认 Core 解析和重建后输出与原文件一致。
- `size/` — 大文件（1MB/10MB/50MB），用于 benchmark 和大文件降级策略测试。由自动生成工具创建，无有意义的 Markdown 语义内容。
