# Design

## Context

`setMarkdown` 是 WYSIWYG 的唯一整篇加载入口：打开文件、恢复标签、frontmatter 补丁、保存后图片路径改写、源码切回所见即所得都经过它。它调用 `setContent` 一次性替换 `0..doc.content.size`。

ProseMirror 在 `replace` 步骤中用默认 association 映射旧选区，因此旧文档位于位置 1 的光标会落到替换区间的末端——即新文档末尾。此外 `EditorView` 只在持有焦点时写回浏览器选区，从文件树打开文件时旧 DOM Range 会残留，光标按旧文档字体度量绘制。

## Goals / Non-Goals

**Goals:** 让光标位置与操作语义一致；保证选区调整不影响撤销历史与更新通知；保持浏览器可见光标与模型选择一致。

**Non-Goals:** 改变 `setContent` 的解析或保真路径；引入滚动位置记忆（已有独立机制）；改变源码模式的 CodeMirror 选区恢复。

## Decisions

- **在 `setMarkdown` 内部统一处理，而非在调用方各自修正。** 所有整篇替换都经过该函数，集中处理可避免遗漏；调用方只声明语义（`start` / `preserve`）。
- **用两种语义而非单一默认。** 文档加载应落在开头（用户刚打开文件，没有「原位置」概念）；就地重渲染应保留位置（用户正在编辑，跳到开头是干扰）。用一个布尔或让调用方传位置都不如显式语义清晰。
- **`start` 用 `Selection.atStart`，`preserve` 用 `Selection.near`。** `atStart` 对节点开头文档会返回最近的合法可编辑位置，正好覆盖「文档以非文本块开头」的情况；`near` 自带向最近有效位置的回落。
- **选区事务加 `addToHistory: false` 与 `preventUpdate: true`。** 仅设置选区不应产生可撤销步骤，也不应触发 `onUpdate` 的脏检查/序列化链路。项目已有同类先例（见 `.claude/memory/tiptap-load-undo-stack.md`）。
- **仅在视图持有焦点时重新 `focus()`。** `EditorView` 在失焦状态跳过 `selectionToDOM`；此时强行 focus 会从文件树或侧栏抢走焦点。因此在记录 `focused` 之后才决定是否写回浏览器选区。
- **`previousPos` 在替换前捕获。** 替换后再读 `state.selection` 已被映射，拿不到原位置。

## Risks / Trade-offs

- [在 `preserve` 下若前后文档结构差异过大，`Selection.near` 可能落到非预期块] → 这是可接受的行为：它至少保证不跳到文首，且始终是合法位置。回归用例只断言「不在文首、落在段落内」，不锁定精确偏移。
- [`addToHistory: false` 可能让用户在「加载后立刻撤销」时回滚到更早的编辑] → 该事务本身不产生可撤销步骤，撤销行为与加载前保持一致；已有 `editor.admission-ui.test.ts` 与 `documentSessions.test.ts` 的历史断言覆盖。
- [`start` 语义改变了加载后 `commands.insertContent` 的默认插入点] → 这是预期修复。原先依赖「加载后光标在末尾」的测试需显式定位到文档末尾，已在 `editor.admission-ui.test.ts` 中改为 `insertContentAt(doc.content.size, ...)`。
