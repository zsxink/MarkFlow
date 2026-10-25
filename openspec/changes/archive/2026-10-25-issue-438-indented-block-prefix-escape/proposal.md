# Proposal

## Why

#436（PR #437）覆盖了 column-0 锚定的全部续行前缀后，残留最后一类缺口——行首 1-3 前导空格的缩进形态（issue #438）。CommonMark 中 1-3 空格缩进不阻止块级起始，而 `escapeLineLeadingPrefix`（`src/editor/extensions/paragraph.ts`）全部规则 column-0 锚定不命中。marked 17（gfm+breaks，与项目同配置）探针实测：

| 续行前缀形态 | 重解析结果（实测） | 现状 |
|---|---|---|
| `正文\n  ---`（1-3 空格 + `-{3,}`） | 上一行升级为 H2（缩进 Setext 下划线，不是 HR） | **真实拆块缺口**：全部规则 column-0 锚定不命中；上游 `escapeMarkdownSyntax` 转义集 `` [\`*_\[\]~] `` 不含空格、`-`、`=`，真实管线无兜底 |
| `正文\n   ===`（1-3 空格 + `=` 整行） | 上一行升级为 H1 | 同上 |
| `正文\n  - foo` / `  # x` / ` > 引用` / `  ``` `/`  <div>` / `  * * *`（1-3 空格 + 各块级前缀） | 拆出 list / heading / blockquote / fence / HTML 块 / HR | 同类拆块缺口（`>`/`<`/反引线形态虽被上游实体/逐字符编码兜住，但段落层保证不应依赖上游编码细节——#421 确立的纵深防御原则） |
| `正文\n    # 标题`（4+ 空格） | **不拆块**（懒延续：indented code 不能中断段落；issue 表格该项不成立） | 无需修复，且 MUST NOT 转义——authored 磁盘形 `正文\n    - foo` 本就逐字保留在段落内，补转义反而破坏字节稳定 |

影响：WYSIWYG 段落内输入带 1-3 缩进的上述续行后保存 → 候选重解析拆块/升级标题 → reconcile 语义指纹不一致 → 保存被拒（安全失败、不写盘）；authored `正文\n  \- foo` 磁盘形也无法通过准入校验进入可编辑 WYSIWYG。

## What Changes

- `escapeLineLeadingPrefix` 统一放宽锚定：函数顶部一次性提取行首 `^ {1,3}` 前导空格，既有全部规则（ordered/bullet/ATX/连续 HR/空格分隔 HR/blockquote/fence/Setext/HTML）零改动地作用于余部，缩进空格原样回填、反斜杠转义插入在缩进之后。column-0 输入的输出字节与现状完全一致（既有用例零回归）。
- 4+ 空格与制表符缩进不纳入：懒延续语义下重解析本就不拆块，转义反而破坏与 authored 源的字节稳定。
- 指纹空白语义定案（#436 遗留的先决问题）：**无需改动** fingerprint/canonicalization——探针实证续行 1-3 前导空格逐字节保留于 text token（`正文\n  bar` → text `"  bar"`）、转义形 `正文\n  \- foo` 重解析经 inline 合并为单 text `"  - foo"`（反斜杠不进指纹）。缩进保留 + 缩进后补转义即同时满足语义指纹一致与 authored 字节稳定。
- 测试：`escapeParagraphMarkdown` 单测矩阵扩充（缩进命中/首行 Setext 不转义/4+ 与 tab 不命中/已转义不双转义/全空格行）、round-trip 续行与 authored 形用例、admission/reconcile 保存不冲突用例。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `paragraph-block-prefix-escape`: 行首块级前缀判定允许 1-3 前导空格缩进（转义插入在缩进后、缩进逐字节保留）；明确 4+ 空格/tab 懒延续不转义

## Impact

- `src/editor/extensions/paragraph.ts`：`escapeLineLeadingPrefix` 顶部缩进提取重构（规则体与替换串零改动）+ docstring 增补 #438 语义
- 测试扩充：`src/editor/extensions/__tests__/index.test.ts`、`src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts`、admission/reconcile 相关套件
- 无新增节点/解析器/设置变更；无 fingerprint/canonicalization 改动；无 Rust 变更
- Non-Goals：
  - 4+ 空格或制表符缩进的续行（懒延续，重解析不拆块；`escapeLineLeadingPrefix` MUST NOT 命中，否则 authored `正文\n    - foo` 磁盘形的字节稳定性被破坏）
  - 段落首行 1-3 缩进空格本身的往返保真（CommonMark 段落起始缩进在重解析时被剥离，Markdown 语法无对应表达；带缩进前缀的首行序列化会补转义防拆块，但首行缩进空格的往返不构成本能力的验收面）
  - 首行 `-`/`--` 整行后随续行的罕见形态（`-\n正文` 重解析为 list 吞懒延续）：超出「续行前缀」语义，与 #436 Non-Goals 一致
  - paragraph 内 inline code mark 行首内容命中规则的极端用例（误转义会被 admission 指纹拦截为安全失败，不静默损坏，与 #421/#436 Non-Goals 一致）
