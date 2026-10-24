# Proposal

## Why

跨行块级公式（`$$` 定界、内容含换行，典型如 `\begin{align}` 环境）在 WYSIWYG 无法解析渲染（issue #417），且经 WYSIWYG 编辑保存后磁盘源码被改写。三层根因均已实测定位：

1. **渲染扫描粒度**：`src/editor/katex.ts` 装饰插件按单个 text node 跑 `scanFormulas`；#404（`breaks: true`）后段落内软换行为独立 `hardBreak(soft)` 节点，多行 `$$` 块被拆散到多个 text node，任何单节点内凑不齐 `$$..$$` 定界对，逐节点扫描恒为 0 匹配 → 不渲染。
2. **解析层吃字符**：marked 的 CommonMark 反斜杠转义把行尾 LaTeX 换行符 `\\` 吃成单 `\`，公式内容在第一次 parse 时即损坏；该丢失发生在指纹往返之前，admission 无法拦截。
3. **序列化层改写**：`@tiptap/markdown` 对非代码上下文文本统一做 `encodeHtmlEntities`（`&`→`&amp;`）+ `escapeMarkdownSyntax`（`\`→`\\`），序列化输出 `&amp;=`、`\\begin` 等被改写的源码。

单行 `$$..$$`（行首或行中）与行内 `$..$` 不受影响；「完全不渲染」是 #404 引入的回归，parse/serialize 两层损坏在 main 上为存量问题。

## What Changes

- 新增独立块级公式节点 `mathBlock`（atom block，复刻 `OpaqueNode` 的 `markdownTokenizer` 挂载模式）：marked 块级 tokenizer 以「行首（≤3 空格缩进）`$$`」为开启条件、非贪婪匹配到最近闭合 `$$`，公式 LaTeX 内容存入 `latex` attr——**不经过 marked 行内解析与序列化转义**，三层根因同时消除
- `latex` 序列化采用固定规范形（内容含换行 → `$$\nlatex\n$$`；单行 → `$$latex$$`），幂等可 re-parse，admission 语义指纹稳定，跨行块在 WYSIWYG 中渲染、可点击编辑
- `src/editor/katex.ts` 装饰插件保持不动：行内与行中 `$$..$$` 仍走装饰渲染路径；行首跨行块被 tokenizer 摘走后自然离开装饰路径
- eligibility 掩码保护：行首 `$$` 块区间内的内容不参与 inline-HTML / opaque / fence 等 markdown 构造判定（公式内容不是 markdown 语法）
- `MARKFLOW_SERIALIZABLE_TYPES` 注册 `mathBlock`；测试 harness 构建点统一注册新节点；fallback literal 块经 `verifySingleBlockUpgrade` 自动升级为 `mathBlock`

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `katex-math-render`: 块级公式识别与编辑——跨行 `$$` 块作为独立块节点识别、渲染、编辑，不再依赖段落 text node 扫描
- `wysiwyg-markdown-round-trip`: 新增块级公式往返保真契约——`latex` 内容字节级无损（`\\`、`&`、缩进、换行原样），定界拼写允许规范化

## Impact

- `src/editor/extensions/math-block.ts`（新增）：节点定义 + tokenizer + NodeView（KaTeX 渲染、点击编辑）
- `src/utils/katex-scan.ts`：新增 `scanMathBlockRegions` 纯函数（与 tokenizer 同规则）
- `src/editor/markdown/eligibility.ts`：math 区间掩码
- `src/editor/markdown/adapter.ts`：`MARKFLOW_SERIALIZABLE_TYPES` + `mathBlock`
- `src/editor/init.ts`、`src/editor/extensions/index.ts`：注册
- 测试构建点（round-trip/katex-roundtrip/admission/reconcile harness）注册新节点；新增 `src/editor/extensions/__tests__/math-block.test.ts`
- 无 Rust / 导出管线变更（导出快照从编辑器 DOM 采集，NodeView 渲染结果自动继承）
- Non-Goals：行中/行内跨行公式（`text $$a\nb$$`）不渲染为已知限制；粘贴纯文本即时转公式块、行内公式文本经序列化转义的既有缺陷不在本 issue 范围
