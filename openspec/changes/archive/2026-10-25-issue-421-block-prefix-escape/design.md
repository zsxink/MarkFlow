# Design

## 现状与落点

- `escapeParagraphMarkdown`（`src/editor/extensions/paragraph.ts:24-39`）：按 `\n` 拆行 → `escapeLineLeadingPrefix` 逐行应用四条规则（有序列表 `^(\d+)([.)])(?=\s|$)`、bullet `^([-+])(?=\s)`、ATX `^(#{1,6})(?=\s)`、HR `^(-{3,}|_{3,}|\*{3,})\s*$`）→ 重新拼接。`SafeParagraph.renderMarkdown`（paragraph.ts:48-58）对空段落 `&nbsp;` 特判后调它。
- 既有四条规则**全行应用（含首行）**——这是既有语义（段首被转义前缀保真），不动。

## D1 新增四条规则（`escapeLineLeadingPrefix` 增加 `isFirstLine` 参数）

按行应用顺序（在既有四条之后追加）：

1. **块引用**：`escaped.replace(/^>/, '\\>')`——任何行首 `>` 都转义。依据：blockquote 可中断段落，自然 parse 出的 paragraph 内行首 `>` 只可能来自源码被转义形态 `\>`（首行）或编辑器输入（续行），补回 `\>` 两种场景都正确；`>foo` 无空格形态同样被 `^>` 覆盖。
2. **围栏开头**：`escaped.replace(/^(`{3,}|~{3,})/, '\\$1')`——转义首字符。fenced code 可中断段落，paragraph 内行首 3+ 反引号/波浪线只来自转义形态或编辑器输入。
3. **Setext 下划线整行**：`isFirstLine` 为 false 且 `/^={1,}\s*$/.test(line)` → `escaped.replace(/^=/, '\\=')`。首行跳过：Setext 语义需前导行，首行 `===` 是普通文本，转义是无谓拼写改写。
4. **HTML 块起始**：`escaped.replace(/^<[a-zA-Z!\/]/, '\\<')`（只转义 `<` 一个字符）。CommonMark type 1-6 html block 可中断段落；`<` 后空格（`a < b`）不命中不误伤。

## D2 与 opaque/eligibility 的交互

转义后行首字符为 `\`，eligibility 的 opaque 扫描与 marked 解析都不再命中 html-block/fence/blockquote——天然走普通段落路径，无需改 eligibility。测试需断言：`正文\n<div> x` 经 WYSIWYG 往返后保存为 `正文\n\<div> x`，重开（重新准入）仍是普通段落（不进 opaque session）。

## D3 已知边缘（Non-Goal，记录到 issue 评论）

- paragraph 内 inline code mark 内容含 3+ 连续反引号且 code span 位于行首：code span 定界符（内容最长反引号串+1 ≥4）与围栏正则重叠被误转义 → re-parse 语义变化 → admission 指纹不一致 → reconcile 安全拒绝（不写盘、不静默损坏）。极端罕见，接受。
- `<?php` 处理指令形态（`?` 不在 `[a-zA-Z!/]`）：issue 修复方向明确排除。
- 首行规则组合：四条新规则中 1/2/4 首行也应用（保真被转义形态）；仅 Setext 3 跳过首行。

## D5 实施期实测偏差（2026-10-25，主流程独立抽查确认）

- `@tiptap/markdown` 文本编码器（`encodeTextForMarkdown` = `escapeMarkdownSyntax` + `encodeHtmlEntities`）在 `escapeParagraphMarkdown` 收到文本**之前**已把 `>`→`&gt;`、`<`→`&lt;`、反引号/波浪线逐字符转义。因此 D1 的规则 1/2/4 在真实管线中不触发（三类续行原本就不拆块）；**唯一真实拆块缺口是 Setext `===` 续行**（re-parse 升级 H1 → `runSaveBoundary` conflict semantic-mismatch，与 issue 症状吻合）。
- 四条规则仍全部实现并直接单测（`escapeParagraphMarkdown` 是导出契约，段落层保证不依赖上游编码细节——纵深防御）；保存候选的实际拼写为上游编码形态（`&gt;`/`` \` ``/`&lt;`）+ 本改动产生的 `\===`，均满足「re-parse 仍为同一普通段落、不进 opaque、往返校验通过」。
- issue 中「`正文\n> 引用` 经解析管线输出 paragraph + blockquote」指**磁盘源码直接 parse**（CommonMark 正确行为，issue 也注明这不是 bug）；WYSIWYG 保存候选经编码后不拆块。delta spec 的 THEN 已按实测拼写修订。
- D1 规则 4 的实现为 lookahead 形态 `^<(?=[a-zA-Z!\/])`（design 字面正则会吞掉第二个字符）。

## D4 测试设计

- `src/editor/extensions/__tests__/index.test.ts`：`escapeParagraphMarkdown` 新增规则矩阵（每条规则的命中/不命中形态 + 首行 vs 续行 + 组合既有四条不变）。
- `src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts` §3.8 风格：真实管线 round-trip 用例——软换行续行四类前缀（`正文\n> 引用` / `正文\n``` x` / `正文\n===` / `正文\n<div> x`）、两空格硬换行形态、`>foo` 无空格、首行 `===` 不转义、被转义首行形态（`\> foo` 等）往返保真。
- admission/reconcile：含此类段落文档 `decideAdmission` 放行；编辑后 `runSaveBoundary` 不冲突、候选串含转义。
- 回归：既有四条规则与 §3.8 软换行用例零变化。

## 门禁

`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs`。
