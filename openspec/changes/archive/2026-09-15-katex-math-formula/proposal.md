## Why

数学公式是技术文档、学术写作的核心需求。当前 MarkFlow 支持 Mermaid/PlantUML 图表，但缺少 LaTeX 数学公式渲染能力。路线图 1.1 明确将 KaTeX 列为增强方向首项，填补公式写入场景的空白。

## What Changes

- 新增 KaTeX 数学公式渲染管道：行内 `$..$` 与块级 `$$..$$` 语法识别与渲染
- 复用 Mermaid/PlantUML 惰性渲染架构，零侵入 Tiptap 内核
- 支持双击公式块回源码编辑的交互模式
- 新增 `katex` npm 依赖（SSR 渲染到 HTML，无运行时客户端渲染）

## Capabilities

### New Capabilities

- `katex-math-render`: KaTeX 数学公式惰性渲染管道——解析层识别 `$..$` / `$$..$$`，渲染层生成静态图块，支持双击回源码编辑

### Modified Capabilities

- `lazy-mermaid`: 扩展惰性渲染管道以支持数学公式（仅管道复用，不修改 Mermaid 逻辑本身）

## Impact

- **依赖变更**：新增 `katex` npm 包（~200KB gzipped）
- **代码变更**：`src/lib/` 新增公式渲染模块，`src/components/` 扩展惰性渲染管道
- **构建影响**：需确保 KaTeX 字体文件正确打包（可选 CDN 或本地）
- **性能影响**：惰性加载，仅文档含公式时才加载 KaTeX，不影响无公式文档的启动速度
