# Tasks

## 1. Caret Placement

- [x] 1.1 新增 `placeCaretAfterContentLoad(editor, mode, previousPos)`，实现 `start` / `preserve` 两种语义、`addToHistory: false` 与 `preventUpdate: true` 的选区事务，以及仅在有焦点时写回浏览器选区；验证选区调整不进入撤销栈
- [x] 1.2 为 `setMarkdown` 增加 `MarkdownLoadOptions`（默认 `caret: 'start'`），在整篇替换后调用光标重定位；验证打开文件后光标落在首块内而非文末

## 2. Call-site Semantics

- [x] 2.1 frontmatter 补丁与保存后图片路径改写改用 `preserve`；验证就地重渲染保留原编辑位置
- [x] 2.2 源码切回所见即所得后按 `preserve` 重定位；验证光标不落在映射后的文末

## 3. Regression Coverage

- [x] 3.1 新增 `src/lib/editor.caret.test.ts`：先记录原生 `setContent` 把光标映射到文末的缺陷，再断言 `start` 落在标题内、`preserve` 保留在原段落附近；额外断言选区事务的 `addToHistory: false` / `preventUpdate: true` / `docChanged: false`，以及仅在视图持有焦点时才写回浏览器选区（不抢侧栏/文件树焦点）
- [x] 3.2 调整既有断言：`editor.admission-ui.test.ts` 显式追加到文档末尾、`sidebar.fileops.test.ts` 断言 `preserve` 选项

## Validation Evidence

- 类型检查：`npx tsc --noEmit` 通过。
- 定向测试：`npx vitest run src/lib/editor.caret.test.ts src/lib/editor.admission-ui.test.ts src/components/sidebar.fileops.test.ts` 51 项通过。
- 全量测试：`npm test` 通过（85 文件 / 811 项）。
- 缺陷复现证据：`editor.caret.test.ts` 第一条用例直接断言未修复时 `selection.from === doc.content.size - 1` 且父节点不是 `heading`，锁定了 ProseMirror 默认映射把位置 1 推到文末的行为。
- 不变量回归取证：临时移除 `setMeta('addToHistory', false)` 后「non-history and non-updating」用例失败；把末尾的 `if (focused) view.focus()` 改为无条件 `view.focus()` 后「only writes the browser selection back when the view owns focus」用例失败，两者恢复实现后均通过。
