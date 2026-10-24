# Proposal

## Why

#421（PR #435）覆盖了 Setext `===` 续行后，复核发现同类残留缺口仍会让「WYSIWYG 编辑 → 保存重解析」拆块、保存被拒（issue #436）：

| 续行前缀 | 重解析结果（marked 17 实测） | 现状 |
|---|---|---|
| `-` / `--`（Setext H2 下划线整行） | 上一行升级为 H2 标题 | **唯一真实拆块缺口**：HR 规则仅覆盖 `-{3,}`，bullet 规则要求 `-` 后随空白，单/双连字符整行两者都不命中；上游文本编码器（`escapeMarkdownSyntax`，转义集 `` [\`*_\[\]~] ``）不含 `-`，与 `===` 缺口完全同构 |
| `* * *` / `_ _ _`（空格分隔 thematic break） | 上一行后拆出分隔线 | 函数级契约缺口：`*` 不在 bullet 规则内，`*{3,}`/`_{3,}` HR 规则只匹配连续无空格形态。真实管线已被上游逐字符转义中和（`*`/`_` 在上游转义集内，序列化输出 `\* \* \*`）——但段落层保证不应依赖上游编码细节（#421 确立的纵深防御原则） |
| `- - -`（横线形态空格分隔 thematic break） | 上一行后拆出分隔线 | 函数级契约缺口：bullet 规则 `^([-+])(?=\s)` 先行命中行首转义，`\- - -` 重解析为普通段落——**当前已不拆块**，但该兜底依赖规则顺序，需以规则与测试 pin 住 |

## What Changes

- `escapeParagraphMarkdown`（`src/editor/extensions/paragraph.ts`）在既有规则不动的前提下：
  - 新增 Setext H2 下划线规则：`^-{1,}\s*$` 整行 → 转义为 `\-`，**仅对非首行应用**（与 `===` 规则同语义：首行无前导行可下划线，`-`/`--` 首行是普通文本；`-{3,}` 部分已被 HR 规则先行覆盖，两者无冲突）——实际修复
  - 新增空格分隔 thematic break 规则：`^([-*_])( {1,3}\1){2,}\s*$`（同一字符重复 3+ 次、以 1-3 空格分隔、允许尾随空白）→ 转义首字符——契约纵深防御，统一覆盖三种子字符（`-` 形态实际由 bullet 规则先行兜住）
  - bullet 规则字符集 `[-+]` → `[-+*]`：补全 CommonMark 第三种 bullet 字符 `*`（实测发现 `正文\n* foo` 重解析拆出 list）。上游已逐字符转义 `*`，真实管线零变化，纯函数级契约补全
- 实测确认修复有效：`正文\n\--`、`正文\n\* * *`、`正文\n\_ _ _` 重解析均为同一个多行普通段落
- 测试：`escapeParagraphMarkdown` 单测矩阵扩充（含首行不转义、混合字符 `* - *` 不命中、两个字符 `* *` 不命中、bullet `*` 形态）、round-trip 续行用例、admission/reconcile 保存不冲突用例

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `paragraph-block-prefix-escape`: 续行被转义块级前缀的覆盖范围补齐 Setext H2 下划线（`-`/`--` 整行）与空格分隔 thematic break 形态；bullet 字符集补全 `*`

## Impact

- `src/editor/extensions/paragraph.ts`：`escapeLineLeadingPrefix` 增加两条规则（其中 Setext H2 复用既有的非首行判定）、bullet 规则字符集扩一个字符
- 测试扩充：`src/editor/extensions/__tests__/index.test.ts`、round-trip 相关套件、admission/reconcile 相关
- 无新增节点/解析器/设置变更；无 Rust 变更
- Non-Goals：
  - 行首 1-3 前导空格的缩进形态（`正文\n  ---` 实测重解析升级 Setext 标题，确为真缺口）：放宽缩进锚定波及**全部**既有规则的 column-0 约定与全部 round-trip fixtures，且懒延续对前导空格的保留语义（实测 `正文\n  bar` 重解析段落文本保留两个空格）牵涉 reconcile 语义指纹对空白的定义，需单独定案，本次不做
  - 首行 `-`/`--` 整行后随续行的罕见形态（`-\n正文` 实测重解析为 list 吞懒延续）：超出「续行前缀」语义（首行是块起始而非懒延续中断），不在本次范围
  - paragraph 内 inline code mark 行首内容命中新规则的极端用例（code span 定界符与 thematic break 正则重叠，误转义会被 admission 指纹拦截为安全失败，不静默损坏，与 #421 Non-Goals 一致）
