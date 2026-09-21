## Context

往返校验（`verifyAdmission`，`editor.markdown.admission.ts:115`）流程为 解析 → 序列化 → 再解析 → 语义指纹对比。已确认根因在序列化层：`@tiptap/markdown` v3 的 `escapeMarkdownSyntax`（`node_modules/@tiptap/markdown/dist/index.cjs`）只转义 `[\`*_[\]~]`，不覆盖行首的块级前缀。因此「以被转义块级前缀开头的段落」序列化后反斜杠丢失：

- `6\. 正文` → `6. 正文` → 再解析为 `orderedList`（无序歧义）
- `\- foo` → `- foo` → 再解析为 `bulletList`
- `\# foo` → `# foo` → 再解析为 `heading`
- `\---` → `---` → 再解析为 `horizontalRule`
- `5\) 正文` → `5) 正文` → 再解析为 `orderedList`

同一行文本第一次解析是段落、第三次解析是列表/标题/HR，指纹不一致 → `parse-verification-failed` → 文档被拒为 source-only。

关键约束：真实的有序/无序列表、任务列表、引用、标题、分隔线、表格、代码块都是**有类型的节点**（`orderedList`、`bulletList`、`taskList`、`blockquote`、`heading`、`horizontalRule` 等），不会进入 paragraph 渲染器。因此「在 paragraph 渲染器对首行补转义」天然不会触碰真实块级结构——这是结构级（structured）修复优于字符串级（string）修复的核心原因。

## Goals / Non-Goals

**Goals:**
- 修复「转义行首块级前缀的段落」无法进入 WYSIWYG 的误拦截（issue #286 及同根因的 `- / + / # / ---` 前缀）
- 保留 @tiptap paragraph 渲染器既有语义（空段落 `&nbsp;` 占位、行内 mark、子节点渲染）
- 真实块级结构输出**逐字节不变**
- 无新增依赖，无 schema 结构变更

**Non-Goals:**
- 不改动解析器（parse 侧）；`6\.` 等转义输入的解析已是正确的普通段落
- 不修复任务列表类（`\- [ ] todo` 在解析层已歧义为 taskList，属另一缺陷，先由往返一致性兜底，不在此变更范围）
- 不做字符串正则化的全局 post-process（避免误判列表/引用内首行）
- 不注册新的「语义规范化」（fingerprint CANONICALIZATIONS）：本修复是**损失修复**，不是把差异声明为安全规范化

## Decisions

### D1: 用 `SafeParagraph` 扩展替换 StarterKit 默认 paragraph 渲染器

在 `editor.extensions.ts` 新增 `SafeParagraph`（`Paragraph.extend`），并配 `escapeParagraphMarkdown` 纯函数。其 `renderMarkdown` 完全复刻 @tiptap 默认渲染行为（空段落 `&nbsp;`、`helpers.renderChildren`），仅对**首行**输出追加转义。

- 在 `editor.init.ts` 将 `StarterKit.configure` 增加 `paragraph: false`，并在扩展数组注册 `SafeParagraph`，作为唯一 paragraph（与 `MarkdownSafeTable` 处理表格同一模式）
- 相关 Markdown 测试编辑器同步改 `paragraph: false` + `SafeParagraph`

**替代方案（已否决）**：固定 priority 覆盖（PROBE 证明 `sortExtensions` 会保留两个 paragraph 节点、渲染器选择依赖排序，脆弱且有 schema 冲突风险）；字符串 post-process（无法区分「`- item` 在列表内」与「字面 `\- item` 段落」）。

### D2: 转义规则精确匹配 Marked 的重新解析触发条件

`escapeParagraphMarkdown` 只对**首行**（`\n` 之前）应用，且只转义确实会导致再解析歧义的标记：

| 模式 | 正则 | 说明 |
|------|------|------|
| 有序列表 | `/^(\d+)([.)])(?=\s\|$)/` | `数字.`/`数字)` + 空白或行尾；`6.x`（无空白）不转义 |
| 无序列表 | `/^([-+])(?=\s)/` | `- `/`+ ` 后随空白；`-foo` 不触发 |
| ATX 标题 | `/^(#{1,6})(?=\s)/` | 后随空白；`#foo` 不触发 |
| 分隔线/Setext 整行 | `/^(-{3,}\|_{3,}\*{3,})\s*$/` | 整行由分隔线标记组成 |

`*`/`_`/`` ` ``/`~` 已在 `escapeMarkdownSyntax` 覆盖，不重复。`>` 引用前缀序列化时被 HTML 实体化（`&gt;`）已自然保真，无需补转义。

### D3: 校验完整性靠 `verifyAdmission` 回归 + 真实结构不回归

- 正向：issue #286 的 `6\.` / `1\.` / `10\.` + 长数字 + `数字)` + `\-`/`\+`/`\###`/`\---` 全部 `verifyAdmission === ok`，且序列化输出补回反斜杠
- 反向：真实列表、任务、引用、H1/H2、HR、嵌套列表、强调、Setext、`-foo`/`6.x`/`a 6. x`/行内 `6\.` 全部保持原有输出、校验通过

## Risks / Trade-offs

- **低风险**：只改 paragraph 渲染器输出；真实块级节点不经由此渲染器，输出逐字节不变
- **测试面**：应用级 Markdown 编辑器（`initEditor` 及构建 Markdown 编辑器的测试）需把 `paragraph: false` + `SafeParagraph` 接上；涉及数量较多但均为机械改动（见 tasks.md）
- **边界**：`数字.` 后不随空白（`6.正文`）本就不触发歧义，不转义是正确的；对已转义输入解析后文本内是 `6.`（无反斜杠），序列化补回是唯一无法从节点结构直接推断的部分——但已用探针验证与源码语义一致
- **非目标边界**：任务列表 `\- [ ]` 的解析层歧义不在此修复范围，保持现状（往返一致，VERIFY=true）