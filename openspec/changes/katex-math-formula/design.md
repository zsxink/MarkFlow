## Context

项目已升级到 tiptap v3 并采用 `@tiptap/markdown` 作为统一的 markdown 管道（`src/lib/editor.init.ts` 的 `createMarkdownExtension()`），而非独立的 `markdown-it` 实例。markdown 解析/序列化由 v3 markdown pipeline 完成（`editor.admission` / `opaque` / `reconcile` 模块）。路线图 1.1 原方案基于 `markdown-it` + `markdown-it-texmath`，需针对 v3 管道调整。

相同架构参考：Mermaid（`src/lib/mermaid.ts` + `mermaid-lazy.ts`）与 PlantUML（`src/lib/plantuml.ts` + `plantuml-lazy.ts`）已建立"惰性渲染 + 双击回源码"的成熟模式，KaTeX 复用此模式即可零侵入 Tiptap 内核。

## Goals / Non-Goals

**Goals:**
- 支持行内 `$..$` 与块级 `$$..$$` 公式的识别与渲染
- 复用惰性加载：无公式文档不加载 KaTeX 库
- 复用"静态块展示 + 双击回源码编辑"交互模式
- 通过 v3 markdown 管道正确序列化（round-trip 保持 `$..$` / `$$..$$` 语法）

**Non-Goals:**
- 不做 WYSIWYG 内实时渲染（路线图 1.1 已知约束，输入即渲染需另开 Tiptap node，成本高，本轮排除）
- 不引入独立的 `markdown-it` 解析链路

## Decisions

### D1: KaTeX 渲染库按需加载

新增 `src/lib/katex-lazy.ts`，仿照 `mermaid-lazy.ts` 单例动态 import 模式：

```typescript
let promise: Promise<typeof import('katex')> | null = null;
export function loadKatex(): Promise<typeof import('katex')> {
  if (!promise) promise = import('katex');
  return promise;
}
```

**替代方案**：直接在 bundle 引入 KaTeX。被否——违背惰性加载目标，且 KaTeX 主包 + 字体对首屏 bundle 体积影响大（路线图优化方向红线）。

### D2: 解析层接入 v3 markdown 管道

不引入独立 markdown-it，改为在 tiptap v3 markdown 管道中识别公式。需先验证 v3 pipeline（`editor.markdown.adapter.ts` / admission）对内联 `$..$` 的处理路径。

**首选路径**：在 v3 markdown 序列化/解析的扩展机制中注册公式 tokenizer/序列化规则，使 `$..$` 在 round-trip 中保持原样（opaque 传递），渲染侧单独扫描识别。

**兜底**：若 v3 管道不支持自定义内联语法扩展，则在渲染扫描层用正则识别 `$..$` / `$$..$$`（二维：先匹配 `$$..$$` 块级，再匹配 `$..$` 行内，避免交叉误判），渲染层独立处理，序列化保持原样透传。

### D3: 渲染层静态块 + 双击编辑

仿照 Mermaid 的渲染组件模式：
- 块级 `$$..$$` → 渲染为居中的静态 KaTeX HTML 块
- 行内 `$..$` → 渲染为行内 KaTeX span
- 双击 → 回源码模式显示原始 LaTeX 语法

### D4: 边界规则（spike 验证过的约束）

- `$..$` 与 `$$..$$` 匹配需遵循 LaTeX 惯用边界：`$` 后不能紧跟空白/数字（防误判货币 `$100`），`$$` 优先于 `$`（最长匹配）
- 跨行仅块级 `$$` 支持；行内 `$` 不跨行
- 无效 LaTeX → 显示占位 + 错误提示，不崩溃
- **已知边界**：行内公式内嵌套的裸 `$` 会被提前截断（例如 `$\text{cost: $5}$` 被错误匹配为 `cost: `）。按 LaTeX 惯例，行内文本中的 `$` 应写为 `\$`，这是预期行为；若后续有明确需求支持嵌套 `$`，需在 scanner 中引入转义感知，不在本轮范围

### D5: 错误与安全

- `katex.renderToString` 的 `throwOnError` 开/关需权衡：渲染期 catch 错误显示占位，避免整页报错
- KaTeX 的输出是受控 HTML，经 `katex` 内部 sanitize，符合 `safe-dom-construction` 规范

## Risks / Trade-offs

- **[v3 管道不支持自定义内联语法]** → 兜底用渲染层正则扫描，保持序列化透传。需先在 apply 阶段 spike 验证 v3 pipeline 扩展能力。
- **[KaTeX 字体打包体积]** → KaTeX 需自带字体文件（woff2，~百KB 级）。惰性加载下仅公式文档触发，且采用动态 import 拆包，不影响首屏。
- **[行内 `$` 误判（货币/转义）]** → 严格边界规则 + 正则最长匹配，spike 阶段验证边界用例。
- **[与 tiptap v3 round-trip 冲突]** → 公式语法作为 opaque 透传，验证 `$..$` → 序列化 → 重新解析不变。
