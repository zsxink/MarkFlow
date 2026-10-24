# Design

## 调研结论（已实测，apply 时可直接引用）

- **marked 17.0.6 自定义 block tokenizer 不会被 paragraph 吞噬**（探针实测，脚本 `.tmp/probe-marked-math.mjs`）：`text\n$$\nx\n$$` 正确产出 `paragraph + mathBlock`；空行分隔、围栏内 `$$`（不识别）、未闭合 `$$`（走段落）、行中 `$$..$$`（不命中）行为全部符合预期。**无需 preprocess/掩码替换方案**，直接复刻 `OpaqueNode` 的 `markdownTokenizer` 挂载模式（`src/editor/markdown/opaque/extension.ts:109-126` 的 start/tokenize 写法 + `markdownTokenName` 属性）。
- KaTeX 装饰插件（`src/editor/katex.ts`）与扫描器（`src/utils/katex-scan.ts`）**不动**：行内/行中公式仍走装饰；行首块被 tokenizer 摘走后装饰插件自然不见。
- 转义根因规避机制：latex 存 attr（非 text node）→ 不经 marked inline 解析（`\\` 不丢）→ 不经 `@tiptap/markdown` 的 `encodeTextForMarkdown`（`&`、`\` 不改写）。renderMarkdown 直接输出 attr 内容。
- `verifySingleBlockUpgrade`（`src/editor/markdown/single-block-upgrade.ts:24`）用 `parseTipTapMarkdownToDoc`（editor.markdown.parse）→ mathBlock tokenizer 生效，literal `$$` 块自动升级。
- 导出从编辑器 DOM 快照采集（`src/export/snapshot.ts` / `document-export.ts`）→ NodeView 渲染结果自动继承，无需改动。

## D1 节点设计：`mathBlock`（新文件 `src/editor/extensions/math-block.ts`）

- `Node.create`，`name: 'mathBlock'`，`group: 'block'`，`atom: true`，`selectable: true`，`draggable: false`
- `markdownTokenName: 'markflow-math-block'`
- attrs：`{ latex: { default: '' } }`（authored attr，参与语义指纹；不进 `RUNTIME_ONLY_KEYS`）
- **tokenizer**（block level）：
  - `start: (src) => src.search(/^[ \t]{0,3}\$\$/m)`，<0 返回 undefined
  - `tokenize`：`/^[ \t]{0,3}\$\$((?:[^$]|\$(?!\$))*?)\$\$/.exec(src)`，命中后 `latex = match[1].trim()`；trim 后为空 → return undefined（交回普通解析）
- `parseMarkdown(token, helpers)`：`helpers.createNode('mathBlock', { latex: token.latex })`
- **renderMarkdown 幂等规范形**：`latex.includes('\n') ? `$$\n${latex}\n$$` : `$$${latex}$$``
  - 幂等验证：`$$\na\nb\n$$` → latex=`a\nb`（trim 首尾）→ 输出 `$$\na\nb\n$$` → re-parse latex=`a\nb` ✓；单行同理。中间行缩进/换行原样保留（trim 只去首尾）。
  - `$$ x $$` → `$$x$$`、`$$\n x\n$$` → `$$\nx\n$$` 属规范化（幂等、指纹稳定）
- `renderHTML`：`['div', { class: 'math-block', 'data-latex': latex }]`（NodeView 接管内容渲染）
- `renderText`：`$$${latex}$$`（clipboard 纯文本）
- **NodeView**（参照 `katex.ts` 的 `buildFormulaWidget` 交互与 `code-block.ts` mermaid NodeView 结构）：
  - 默认态：`div.katex-block` 容器 + `renderKatex(latex, true)` 懒渲染（loading 占位「加载中…」、错误占位复用 renderKatex 错误路径）；`import { renderKatex } from '../../render'`（editor 层依赖 render，code-block.ts 先例）
  - 编辑态：点击进入 → `textarea.katex-source-editor`（复用现有 CSS 类）+ 确认/取消按钮；确认 → `setNodeMarkup` 更新 latex attr；⌘/Ctrl+Enter 确认、Escape 取消
  - `stopEvent`：编辑态或事件目标在容器内返回 true（atom 无 contentDOM）；`ignoreMutation: () => true`
  - 注意 latex 变更后失效缓存并重渲染（内容键控缓存可简化为 NodeView 内局部状态）

## D2 katex.ts 装饰插件不动

行首块被 tokenizer 摘走后，装饰插件 text node 扫描不再覆盖它们。行内 `$..$` 与行中 `$$..$$`（单 text node 内）保持现状。

## D3 eligibility 掩码（`src/editor/markdown/eligibility.ts`）

- 新纯函数 `scanMathBlockRegions(source): Array<{from,to}>` 加入 `src/utils/katex-scan.ts`（与 tokenizer 同规则：行首 ≤3 空格 `$$` 到最近闭合 `$$`；`from/to` 为原文字节区间）
- `classifyEligibility` 在扫描前消费 math 区间：区间内的内容不参与 inline-HTML（eligibility.ts:297）、opaque 扫描、fence/其他构造判定（公式内容不是 markdown 语法；`$$` 块内的 ```` ``` ````、`<div>`、`<!--` 不应触发 unknown-construct 或被 opaque 吃掉）
- 实现顺序：先扫 math 区间，opaque/code region 扫描跳过已消费区间；注意保持 `classifyEligibility` 既有 verdict 语义（纯公式文档 verdict 不变）
- **护栏**：掩码只扩大放行范围——若 math 区间本身含不安全形态，安全网是 latex 原样存 attr 不渲染 HTML（renderHTML/NodeView 全走 textContent/inner 无外部注入），无 XSS 面

## D4 序列化白名单与 harness

- `MARKFLOW_SERIALIZABLE_TYPES`（`src/editor/markdown/adapter.ts:27`）加 `'mathBlock'`
- 测试 harness 构建点注册 MathBlock：`grep -rn "createAppEditor\|makeEditor" src/**/__tests__/`——重点 `src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts`、`src/__tests__/katex-roundtrip.test.ts`、admission/reconcile/single-block-upgrade/canonicalization harness（注册方式：`mermaidCodeBlockExtension()` 旁边加 `MathBlock`）

## D5 保存边界与 dirty

- 打开不编辑：programmatic load 不触发 dirty-check（isProgrammaticUpdate 守卫）→ 不误报
- 编辑后保存：latex 拼写规范化（trim/定界形态）经 re-parse 指纹一致 → reconcile 不冲突；写盘为规范形属 canonical normalization（与列表 marker 规范化同性质）
- round-trip baseline fixtures 若有 `$$` 字节对比用例：规范形差异按既有 `knownV2Differences` 机制处理或改用规范形 fixture

## D6 Non-Goals

- 行中跨行公式（`text $$a\nb$$ text`，`$$` 不在行首且内容跨行）不渲染——现状同样不渲染，保持
- 粘贴多行公式纯文本即时转 mathBlock——粘贴走 soft-break 段落路径，重开/重新准入后正确转节点渲染
- 段落内公式文本（行内/行中）经序列化转义（`&`→`&amp;`）的既有缺陷——行中公式现状即如此，独立问题不混入
- KaTeX CSS 进导出主题——既有状况

## 测试落点

- 新增 `src/editor/extensions/__tests__/math-block.test.ts`：tokenizer 规则矩阵（行首/缩进/单行/跨行/未闭合/围栏内/trim）、renderMarkdown 幂等、NodeView 编辑交互（renderKatex mock）
- 扩充 `src/__tests__/katex-roundtrip.test.ts`：跨行 align 全链路（parse 节点、latex 原样、serialize 字节无损、幂等）
- 扩充 admission/reconcile：含 `$$` 块文档 decideAdmission 放行、runSaveBoundary unchanged
- `src/editor/extensions/__tests__/index.test.ts`：escapeParagraphMarkdown 回归确认不动 `$$` 行
- `npx tsc --noEmit`、`npm test`、`npm run build`、`npm run validate:openspec`、`node scripts/check-layering.mjs`
