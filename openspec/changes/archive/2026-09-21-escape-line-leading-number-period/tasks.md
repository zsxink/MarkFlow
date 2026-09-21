## 1. 新增 SafeParagraph 段落扩展

- [x] 1.1 在 `src/lib/editor.extensions.ts` 新增 `escapeParagraphMarkdown(md: string): string` 纯函数：仅对首行应用转义；覆盖有序列表标记（`数字[.)]+空白/行尾`）、无序列表标记（`- `/`+ ` 后随空白）、ATX 标题（`#`-`######`+空白）、分隔线/Setext 整行（`---`/`___`/`***`）；对非触发行（`6.x`、`-foo`、`a 6. x`、行内 `6\.`）不做改动
- [x] 1.2 新增 `SafeParagraph`：`Paragraph.extend`，`renderMarkdown` 复刻 @tiptap 默认行为（空段落且前一个为空白段落时输出 `&nbsp;`、否则空串；有内容时 `helpers.renderChildren`）并在输出上应用 `escapeParagraphMarkdown`；导出供注册

## 2. 注册 SafeParagraph 并接入编辑器

- [x] 2.1 在 `src/lib/editor.init.ts` 的 `StarterKit.configure` 增加 `paragraph: false`，并在扩展数组（StarterKit 之后、列表扩展之前）注册 `SafeParagraph`
- [x] 2.2 构建 Markdown 编辑器的测试文件同步：`StarterKit.configure` 增加 `paragraph: false` 并注册 `SafeParagraph`（`editor.admission.test.ts`、`editor.extensions.test.ts`、`wysiwyg-markdown-roundtrip.section3.test.ts`、`editor.production-chain.test.ts`、`editor.save.reconcile.test.ts`、`editor.opaque.integration.test.ts`、`editor.markdown.canonicalization.test.ts`、`editor.admission-ui.test.ts`、`editor.markdown.opaque.session.test.ts`、`katex-roundtrip.test.ts` 等出现 `StarterKit.configure` + `createMarkdownExtension` 的文件）

## 3. 回归测试

- [x] 3.1 在 `editor.admission.test.ts` 的 `verifyAdmission` 测试中新增正向用例：issue #286 的 `6\. 正文` / `1\. 另一段` / `10\. 第三段`（单独成行、无标题符号），断言 `verifyAdmission === ok`；长数字 `999999999\. x` 与 `5\) 正文` 一并覆盖
- [x] 3.2 新增负向/不回归用例：真实有序列表、无序列表、任务列表、引用、H1/H2、HR、嵌套列表、强调 `***bold***`、Setext、`-foo`/`6.x`/`a 6. x`/行内 `6\.` 序列化输出不变且 `verifyAdmission === ok`
- [x] 3.3 在 `editor.extensions.test.ts` 增加 `SafeParagraph` 单元测试：直接断言 `escapeParagraphMarkdown` 对各转义前缀的输出，与真实结构的不触碰

## 4. 验证

- [x] 4.1 `npx tsc --noEmit` 通过
- [x] 4.2 `npm run build` 通过
- [x] 4.3 `npm test` 全绿（含新增回归用例）
- [x] 4.4 `npm run validate:openspec` 通过