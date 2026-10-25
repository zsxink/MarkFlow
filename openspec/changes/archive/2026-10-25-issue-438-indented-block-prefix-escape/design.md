# Design

## D1 实测基础（marked 17.0.6，gfm+breaks，项目同配置）

`正文` 为段落首行、后续行缩进 N 空格 + 前缀时：

| 源 | 重解析结果 |
|---|---|
| `正文\n  - foo` / `正文\n   # x` / `正文\n  > x` / `正文\n  * * *` / `正文\n  <div>` / `正文\n  ``` ` | 拆块：paragraph + list / heading / blockquote / hr / html / fence |
| `正文\n  ---` / `正文\n  ===` / `正文\n  --` | setext heading（上一行升级 H2 / H1 / H2；下划线允许 ≤3 空格缩进） |
| `正文\n  \- foo`、`正文\n  \---`、`正文\n  \# x`、`正文\n  \> x`、`正文\n  \===`、`正文\n  \-` | 单 paragraph：inline tokens `text:"  "` + `escape` + 余文，`@tiptap/markdown` `parseInlineTokens`（dist index.js:801-812）合并相邻同 marks text → 单 text `"  - foo"` 等（**缩进空格保留、反斜杠不进内容**） |
| `正文\n    bar` / `正文\n     - foo` / `正文\n\t- foo` | 单 paragraph，缩进（4+ 空格或 tab）逐字保留在 text token（懒延续；indented code 不能中断段落） |
| `正文\n  bar` | 单 paragraph，text token `"  bar"`（1-3 空格非前缀续行同样保留空白） |

结论：**1-3 空格是「块前缀仍然生效」与「纯文本缩进（懒延续）」的分界线**，放宽到 `^ {1,3}` 与 CommonMark 块前缀有效缩进范围精确一致；4+ 空格/tab 无需也不得转义。issue 表格中 `正文\n    # 标题`（4 空格）实测不拆块，该项不成立。

## D2 实现方案

`escapeLineLeadingPrefix`（`src/editor/extensions/paragraph.ts:47-80`）重构为「缩进提取 + 既有规则作用于余部」：

```ts
function escapeLineLeadingPrefix(line: string, isFirstLine: boolean): string {
  // 1-3 leading spaces do not defuse a block prefix (CommonMark keeps the
  // block start effective), and they survive byte-for-byte in the paragraph
  // text / semantic fingerprint; 4+ spaces or a tab make the line a lazy
  // continuation (no block start) and MUST stay unescaped — escaping there
  // would break byte-stability with authored source (#438).
  const indent = /^ {1,3}/.exec(line)?.[0] ?? '';
  const body = line.slice(indent.length);
  let escaped = body;
  // ……既有九条规则原文，全部把作用对象从 line 换成 body（正则与替换串零改动）……
  // Setext 分支：if (!isFirstLine && /^(={1,}|-{1,})\s*$/.test(body)) {
  //   escaped = escaped.replace(/^[-=]/, '\\$&');
  // }
  return indent + escaped;
}
```

- **规则体零改动**：九条规则（ordered `:50`、bullet `:53`、ATX `:55`、连续 HR `:57`、空格分隔 HR `:65`、blockquote `:67`、fence `:69`、Setext `:73-75`、HTML `:78`）的正则与替换串逐字保留，仅作用对象改为余部；Setext 判定 `.test(body)`、替换作用于余部。
- **column-0 字节等价**：`line` 无前导空格时 `indent === ''`、`body === line`，输出与现状逐字节一致——#286/#421/#436 全部既有用例与 fixtures 零回归由结构保证，不靠逐条重验。
- **输出不变式**：任一命中行的输出 = 原行前 1-3 个前导空格 + `\` + 原行余部（各规则原有的尾随空白消耗/保留语义不变）；未命中行原样返回。
- docstring 增补 #438 段（1-3 缩进不解除块级前缀、4+/tab 懒延续不转义、缩进逐字节保留）。

脑内执行示例（吸取 #436 教训，替换结果逐一核对）：
- `正文\n  ---` → 次行 indent=`"  "`、body=`"---"` → 连续 HR 规则 → `"  \---"`
- `正文\n   ===` → `"   \==="`（Setext 非首行）；`正文\n  --` → `"  \--"`
- `正文\n  - foo` → `"  \- foo"`；`正文\n  1. x` → `"  1\. x"`；`正文\n  # x` → `"  \# x"`
- `正文\n > x` → indent=`" "`、body=`"> x"`，quote 规则 `^>` → `" \> x"`（只转义 `>`，余文保留）
- `正文\n  * * *` → body=`"* * *"`，bullet 规则先行命中 → `"  \* * *"`（与 column-0 顺序语义一致）
- `正文\n    - foo`（4 空格）→ indent=`"   "`、body=`" - foo"` 以空格开头，九条规则均不命中 → 原样
- `正文\n\t- foo` → `/^ {1,3}/` 不匹配 tab，body=`"\t- foo"` 以 tab 开头，不命中 → 原样
- `  \- foo`（已转义）→ body=`"\- foo"` 以 `\` 开头，不命中 → 原样（不双转义）
- `  `（全空格行）→ body=`""`，不命中 → 原样

## D3 指纹空白语义定案（#436 遗留先决问题，结论：不改）

- `semanticFingerprint`（`src/editor/markdown/fingerprint.ts:71-113`）对 text 原样保留（无空白归一化）；`canonicalize` 只折叠 EOF 尾换行。**保持不变**。
- 探针闭环论证（D1 第三/五行）：编辑器内 text `"  - foo"` 序列化为 `  \- foo` → 重解析合并回单 text `"  - foo"` → 指纹一致；authored 磁盘形 `正文\n  \- foo` 解析进编辑器为同一 text，序列化输出与源逐字节相同 → 无编辑保存 canonicalOnly 成立、准入 verify 通过。缩进空格是指纹载荷字节，反斜杠是语法不是内容——「保留缩进 + 缩进后补转义」同时满足两条路径，无需任何空白归一定义变更。

## D4 边界与规则顺序

- **已转义形态天然不双转义**：余部以 `\` 开头时九条规则均不命中（与 column-0 现状同构）。
- **空格分隔 HR 与 bullet 的顺序**：缩进不改变顺序语义——`  * * *`/`  - - -` 由 bullet 规则先行命中（`  \* * *`/`  \- - -`），`  _ _ _` 由空格分隔 HR 规则命中（`  \_ _ _`）。
- **硬换行尾缀归属前行**：`正文  \n  - foo` 中行尾两空格属首行，次行独立判定，与现状一致。
- **首行语义**：除 Setext（仅非首行）外各规则对首行同样应用——`  - foo` 首行 → `  \- foo`（防拆块；首行缩进空格经重解析被 CommonMark 剥离，往返保真不适用，见 proposal Non-Goals）；首行 `  --`/`  ===` 不转义（Setext 首行语义、连续 HR 需 3+）。
- **懒延续边界**：4+ 空格或 tab 开头的行九条规则均不命中（body 以空白开头），与重解析「不拆块」精确互补。

## D5 测试计划

1. **单测矩阵**（`src/editor/extensions/__tests__/index.test.ts` 新增 issue #438 describe）：1-3 缩进各前缀命中且缩进保留（bullet/ordered/ATX/连续 HR/空格分隔 HR `_` 形/quote/fence/HTML）；非首行缩进 Setext（`  --`/`   ===`/`  ---` HR 形）命中、首行 `  --`/`  ===` 不命中；4+ 空格与 tab 不命中；已转义不双转义；全空格行不变；组合多行。
2. **round-trip**（`src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts`，§3.10 后新增 §3.11）：`breakParagraph` 从编辑器 JSON 驱动 `正文\n  ---`、`正文\n   ===`、`正文\n  - foo`、`正文\n > 引用` 等保存后仍同一多行普通段落、re-serialize 字节稳定；authored `正文\n  \- foo`/`正文\n  \--` 磁盘加载（roundTrip 驱动）字节稳定；authored `正文\n    - foo`（4 空格懒延续）字节稳定且不转义。
3. **admission/reconcile**：含缩进前缀续行段落 `decideAdmission` 放行、编辑后 `runSaveBoundary` 不冲突、重开仍是普通段落。

验证路径：任务 1 实现前红（缩进命中用例）、实现后全绿；`npm test` 全量零回归。

## D6 Non-Goals

见 proposal Impact Non-Goals：4+ 空格/tab 懒延续、首行缩进空格往返保真、首行 `-`/`--` 整行懒延续吞并形态、inline code mark 极端用例。
