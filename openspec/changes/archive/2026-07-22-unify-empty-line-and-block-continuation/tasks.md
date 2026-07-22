## 1. 空行保留（序列化层）

- [x] 1.1 修改 `fixImageNewlines()`：移除全局 `\n{3,}` 压缩逻辑，改为仅对独立图片行做前后相邻空行整理（各至多保留一个空行）
- [x] 1.2 验证 `normalizeImageMarkdown()` 在无图片时返回与输入完全相同的 Markdown（除回车归一化外）
- [x] 1.3 验证 `normalizeImageMarkdown()` 在代码围栏内外部保留用户输入的空行

## 2. WYSIWYG 末尾续写段落

- [x] 2.1 在 `editor.continuation.ts` 中实现 `ensureContinuationParagraph()` 函数：检查文档最后一个节点是否为特殊块（image/blockquote/codeBlock），若是则追加空 paragraph
- [x] 2.2 修改图片插入路径（`editor.init.ts` 的 `setImage` 调用），在单张图片插入后调用续写段落逻辑
- [x] 2.3 修改引用转换（`toggleBlockquote`），在末尾转换后调用续写段落逻辑
- [x] 2.4 修改代码块转换（`toggleCodeBlock`），在末尾转换后调用续写段落逻辑

## 3. 多图片批量插入

- [x] 3.1 修改 `processImageFiles()`：图片批量插入循环结束后统一判断末尾节点，仅在最后一张图片后创建一个续写段落
- [x] 3.2 确认各图片之间不被续写段落分隔

## 4. 源码模式工具栏适配 CM6

- [x] 4.1 在 `toolbar.ts` 中为 `btn-quote` 添加 CM6 模式分支：通过 `getSourceView().dispatch()` 在选区行前加 `> ` 前缀
- [x] 4.2 在 `toolbar.ts` 中为 `btn-codeblock` 添加 CM6 模式分支：通过 `getSourceView().dispatch()` 用 `\`\`\`` 围栏包裹选区
- [x] 4.3 工具栏操作后调用 `view.focus()` 保持 CM6 焦点

## 5. 测试覆盖

- [x] 5.1 在 `editor.serializer.test.ts` 中添加空行保留测试：多空行保存后保留、图片附近空行正确分隔、无图片时全文保留
- [x] 5.2 在 `editor.serializer.test.ts` 中添加 normalization 范围测试：全局压缩已移除，仅图片附近空行整理
- [x] 5.3 添加 `editor.continuation.test.ts`：图片/引用/代码块后创建、已有内容不创建、多图片仅创建一次
- [x] 5.4 添加续写段落序列化测试：空段落不序列化、填充后正常序列化（serializer 测试已有）
- [x] 5.5 添加 WYSIWYG ↔ Source 往返测试：往返不丢失非空内容和块级结构
