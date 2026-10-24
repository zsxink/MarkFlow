# Design

## 现状与落点

- `escapeParagraphMarkdown`（`src/editor/extensions/paragraph.ts:35-37`）：按 `\n` 拆行 → `escapeLineLeadingPrefix(line, isFirstLine)` 逐行应用规则 → 拼接。`SafeParagraph.renderMarkdown`（paragraph.ts:71-81）空段落 `&nbsp;` 特判后调它。
- 既有八条规则（paragraph.ts:39-62）：有序列表、bullet `^([-+])(?=\s)`、ATX、连续 HR `^(-{3,}|_{3,}|\*{3,})\s*$`、块引用 `^>`、围栏、Setext `===`（仅非首行）、HTML `<`。除两条 Setext 语义规则外全行应用。
- 上游文本编码器 `encodeTextForMarkdown` = `escapeMarkdownSyntax(encodeHtmlEntities(text))`（node_modules @tiptap/markdown dist index.js:1024-1039），转义集 `` /([\\`*_\[\]~])/g `` **逐字符**转义——含 `*`/`_`/反引号/波浪线，不含 `-`/`=`。escapeParagraphMarkdown 收到的文本里这些字符已是转义形态，行首不再命中块级正则。

## 实测结论（marked 17 + 上游编码器源码，2026-10-25）

| 形态 | 重解析（未转义） | 真实管线现状 | 结论 |
|---|---|---|---|
| `正文\n--`、`正文\n-` | heading(2)，上一行升级 H2 | 上游不转义 `-`，序列化输出原样 → 拆块 | **唯一真实缺口，本次实际修复** |
| `正文\n* * *`、`正文\n_ _ _`、`正文\n*  *  *`（1-3 空格分隔） | paragraph + hr | 上游输出 `\* \* \*` → 不拆块 | 契约缺口（纵深防御） |
| `正文\n- - -` | paragraph + hr | bullet 规则先行转义 `\- - -` → 不拆块 | 契约缺口（依赖规则顺序） |
| `正文\n\--`、`正文\n\* * *`、`正文\n\_ _ _` | 同一个多行普通段落（文本保留转义拼写） | — | 修复方案有效 |
| `正文\n* foo`、`正文\n* *` | paragraph + list | 上游输出 `\* foo` → 不拆块 | 契约缺口（bullet 规则缺 `*` 字符） |
| `正文\n  ---`（1-3 缩进） | heading(2)（缩进 Setext 下划线） | 上游不转义 → 拆块 | 真缺口，Non-Goal（见 D3） |
| `正文\n  bar` | paragraph 文本保留前导空格 | — | 缩进场景牵涉指纹空白语义 |
| `-\n正文`（首行 `-` 整行） | list + paragraph | — | Non-Goal（首行块起始，非续行语义） |
| `* - *`（混合字符）、`* *`（两个） | 不构成 thematic break | — | 新规则不命中，不误伤 |

## D1 规则设计（`escapeLineLeadingPrefix` 改动）

1. **bullet 字符集补全**：`^([-+])(?=\s)` → `^([-+*])(?=\s)`。CommonMark bullet 三字符 `-`/`+`/`*`；`*foo` 无空格不命中（lookahead）不变。上游已逐字符转义 `*`，真实管线序列化输出零变化。
2. **Setext H2 下划线**：并入既有 `===` 分支——判定从 `/^={1,}\s*$/` 放宽为 `/^(={1,}|-{1,})\s*$/`（alternation 保证同字符，`=-=` 混合不命中），替换 `escaped.replace(/^[-=]/, '\\$&')` 转义首字符。仍仅非首行应用（首行 `-`/`--` 无前导行，是普通文本）。`-{3,}` 已被 HR 规则（在前）先行转义，本规则实际触达的是 1-2 连字符；写 `-{1,}` 而非 `-{1,2}` 表达「任意 H2 下划线」语义，不依赖与前序规则的顺序。
3. **空格分隔 thematic break**：`escaped.replace(/^([-*_])( {1,3}\1){2,}\s*$/, '\\$1')`——反向引用 `\1` 强制同字符；` {1,3}` 对应 CommonMark 分隔 1-3 空格；`{2,}` 两次重复合计 3+ 字符；`\s*$` 允许尾随空白。放在 HR 规则之后：连续形态 `***` 由 HR 规则先吃（` {1,3}` 要求至少 1 空格，本规则不匹配连续形态，两者正交）；`-` 开头形态由 bullet 规则更先吃，本规则实际触达 `*`/`_` 开头形态。首行也应用（该形态整行是块级标记，首行出现即拆块起点；与 `>`/围栏/`<` 规则的首行语义一致）。

## D2 与上游编码 / opaque / reconcile 的交互

- 真实管线保存候选拼写：`-`/`--` 续行为本改动新增的 `\-`/`\--`（唯一行为变化点）；`*`/`_` 续行仍是上游逐字符转义形态（`\* \* \*`），escapeParagraphMarkdown 的新规则对已转义行首（`\`）不命中、不双重转义。
- 转义后行首为 `\`，eligibility 的 opaque 扫描与 marked 解析都不再命中任何块级起始——走普通段落路径，无需改 eligibility。
- reconcile 语义指纹：re-parse 段落文本经 inline 解析剥回 `\--` → `--`，与编辑器模型一致（与 #421 `\===` 已验证的机制相同）。

## D5 实施期偏差（2026-10-25，apply 阶段记录）

- D1 规则 3 的替换串原文 `'\\$1'` 有误：会把整行替换为 `\`+首字符（`_ _ _` → `\_`，丢中段），与 D4/spec 场景给出的 `\_ _ _` 拼写自相矛盾。实现修正为捕获两段 `/^([-*_])(( {1,3}\1){2,})\s*$/` → `'\\$1$2'`（判定部分与 D1 完全一致：反向引用、1-3 空格、3+ 重复、尾随空白随匹配消耗、置于 HR 后、首行也应用）。
- 规则实际触达路径修正：bullet 规则扩充 `*` 后位于 spaced HR 规则之前，`* * *`/`- - -` 被 bullet 规则先行命中（输出同为 `\* * *`/`\- - -`，与 spaced HR 规则输出拼写一致、无歧义）；spaced HR 规则实际触达的是 `_ _ _` 形态（`_` 不是 bullet 字符）。
- `* - *`/`* *`（非 thematic break 形态）不命中 spaced HR 规则，但作为列表标记被扩充后的 bullet 规则转义（与实测表「`正文\n* *` → paragraph + list」一致）；`_` 形态（`_ - _`/`_ _`）完全不动。
- tasks 1.1 预言「`* foo` 用例绿」不准确：函数级 `* foo` → `\* foo` 实现前为红（bullet 规则本不含 `*`）；「绿兜底」仅真实管线成立（上游转义 `*`）。

## D3 已知边缘（Non-Goal）

- 行首 1-3 前导空格的缩进形态：放宽锚定波及全部规则的 column-0 约定与全部 fixtures；且懒延续保留前导空格的语义使指纹层空白定义需先定案。单独评估。
- 首行 `-`/`--` 整行后随续行（`-\n正文`）：首行是块起始（list），非「续行中断」语义。
- inline code mark 行首内容命中新规则：误转义 → admission 指纹不一致 → reconcile 安全拒绝，不静默损坏（与 #421 一致）。

## D4 测试设计

- `src/editor/extensions/__tests__/index.test.ts` 新增 describe（issue #436）：
  - Setext H2：`正文\n--`→`正文\n\--`、`正文\n-`→`正文\n\-`、`正文\n-  `（尾随空白）→转义；首行 `--`/`-` 不转义；`正文\n== x`（非整行）不转义不变；`=-=` 混合不命中。
  - 空格分隔 thematic break：`* * *`/`_ _ _`/`*  *  *`（多空格）/尾随空白 → 转义首字符；`- - -` → 由 bullet 规则转义为 `\- - -`（pin 现有兜底）；混合 `* - *`、两个 `* *`、非整行 `* * x` 不命中。
  - bullet `*`：`* foo`→`\* foo`、`正文\n* x`→转义；`*foo` 无空格不命中。
  - 组合既有：多行混合新前缀一次通过；已转义形态（`\--`、`\* * *`）不双重转义。
- round-trip（§3.8 所在文件 `src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts` 风格）：软换行/两空格硬换行续行 `正文\n--`、`正文\n- - -`、`正文\n* * *` 真实管线 parse → serialize → re-parse 仍为同一段落、字节稳定。
- admission/reconcile：含上述段落文档 `decideAdmission` 放行；编辑后 `runSaveBoundary` 不冲突；候选串含 `\-`（`--` 续行）/上游编码形态（`*`/`_` 续行）。
- 回归：既有 #286/#421 全部用例与 baseline fixtures 零变化。

## 门禁

`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs`。
