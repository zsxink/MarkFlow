# Proposal

## Why

整篇内容替换（打开文件、frontmatter 补丁、保存后图片路径改写、源码切回所见即所得）之后，插入光标不在用户预期位置。

`setMarkdown` 通过 `setContent` 一次性替换 `0..doc.content.size`。ProseMirror 用默认 association 映射旧选区，因此旧文档（如启动时的空文档）位于位置 1 的光标被映射到新文档的**末尾**。叠加 `EditorView` 只在聚焦时写回浏览器选区这一行为，从文件树打开文件时旧 DOM Range 会残留，光标按旧文档的字体度量绘制在旧位置——表现为「短光标贴在标题旁」而非落在标题内。

同时，就地重渲染（frontmatter 编辑、图片路径改写）复用了同一条加载路径，把用户原本的编辑位置重置到文档开头；`switchToWysiwyg` 重新接纳整篇内容后同样落在映射后的末尾。

## What Changes

- 新增 `placeCaretAfterContentLoad(editor, mode, previousPos)`，在整篇替换后重新锚定选区与浏览器光标：
  - `start`（文档加载语义）：落在首个可编辑位置；节点开头文档取最近可编辑位置。
  - `preserve`（就地重渲染语义）：保留原位置附近，不回到文档开头。
  - 选区事务带 `addToHistory: false` 与 `preventUpdate: true`，不进入撤销栈、不额外触发一次 update。
  - 视图持有焦点时重新 `focus()`，让浏览器选区与模型一致。
- `setMarkdown` 新增 `MarkdownLoadOptions`，默认 `caret: 'start'`。
- frontmatter 补丁（`applyFrontmatterMarkdown`）、保存后图片路径改写（`sidebar.fileops`）、源码切回所见即所得（`switchToWysiwyg`）改用 `preserve`。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tabs`：要求整篇内容替换后光标位置符合加载/就地重渲染语义，且该调整不进入撤销历史。

## Impact

- 受影响实现：`src/lib/editor.ts`（`setMarkdown`、新增 `placeCaretAfterContentLoad`）、`src/components/sidebar.fileops.ts`。
- 受影响测试：新增 `src/lib/editor.caret.test.ts`；调整 `src/lib/editor.admission-ui.test.ts`（加载后光标在首块，追加内容需显式定位到文档末尾）与 `src/components/sidebar.fileops.test.ts`（断言 `preserve` 选项）。
- 无依赖、持久化格式或公开 API 变更。
