## Why

当 Markdown 文档存在「以转义块级前缀开头的独立段落」（如作者为显示字面 `6.` 而写的 `6\. 正文`，或 `\- foo`、`\# foo`、`\---`），打开文档时无法进入 WYSIWYG 预览，只提示「往返校验未通过」，文档停留在源码模式。原因是 `@tiptap/markdown` 的序列化器在把段落写回 Markdown 时会丢弃行首反斜杠转义：`6\. 正文` → `6. 正文`，再解析时被识别为有序列表，语义指纹不一致，`verifyAdmission` 将其拒为 `source-only`。对仅含受支持语法的文档，这是「序列化器未补转义」造成的误拦截，应当修复让这类文档可以预览。

## What Changes

- 新增 `SafeParagraph` 段落扩展（`editor.extensions.ts`），替换 StarterKit 默认 paragraph 的 `renderMarkdown`：
  - 序列化时对段落**首行**行首的块级前缀补转义，覆盖会触发重新解析歧义的前缀：
    - 有序列表标记：`1+ 位数字` + `.` / `)` + 空白或行尾（`6. `、`10. `、`999999999. `、`5) `）
    - 无序列表标记：`- ` / `+ `（仅后随空白；`-foo` 不触发）
    - ATX 标题：`#`-`######` + 空白（`# foo`、`### foo`）
    - 分隔线/Setext 下划线整行：`---`、`***`、`___`（允许尾随空白）
  - 保留 starter-kit 默认的段落渲染行为（空段落的 `&nbsp;` 占位、行内 mark 与子节点渲染）
  - 真实的有序/无序列表、任务列表、引用、标题、分隔线、代码块、表格等**节点**不受影响——它们是有类型的节点，不会经过段落渲染器
- `editor.init.ts` 中 `StarterKit.configure({ paragraph: false })` 并注册 `SafeParagraph`，作为唯一 paragraph 注册（与 `MarkdownSafeTable` 处理表格的方式一致）
- 相关测试编辑器同步使用 `SafeParagraph`（替换 StarterKit 自带 paragraph）
- 新增回归测试：转义数字句点 `6\.` / `1\.` / `10\.` / 长数字 / `数字)`、`\-` / `\+` / `\###` / `\---` 等段落的 `verifyAdmission` 通过；真实列表、标题、TODO、引用、HR、嵌套列表、强调、Setext 等**不回归**

## Capabilities

### New Capabilities

- `paragraph-block-prefix-escape`: 段落首行块级前缀的序列化转义保真，确保「以字面块级前缀开头的合法段落」可进入 WYSIWYG 并保持往返语义一致

### Modified Capabilities

- `wysiwyg-markdown-round-trip`: 扩展「受支持语法」边界——被转义的行首块级前缀（有序/无序列表标记、ATX 标题、分隔线/Setext）不再因序列化丢失转义而被拒为 source-only，往返后语义（文本、段落结构）保持不变

## Impact

- **影响代码**：
  - `src/lib/editor.extensions.ts`：新增 `SafeParagraph`（`escapeParagraphMarkdown` 纯函数 + `Paragraph.extend`）
  - `src/lib/editor.init.ts`：`StarterKit.configure` 增加 `paragraph: false`，扩展数组加入 `SafeParagraph`
  - 使用应用级 Markdown 编辑器的测试文件：`StarterKit.configure` 增加 `paragraph: false` 并注册 `SafeParagraph`
- **API / 依赖**：无新增依赖，仅替换同包 `@tiptap/extension-paragraph` 的渲染器
- **行为影响**：仅改变「以转义块级前缀开头的段落」的序列化输出（补上反斜杠），真实块级节点输出不变；不涉及磁盘格式、存储、导出、剪贴板契约