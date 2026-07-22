## Context

当前系统存在两个相互关联的问题：(1) `normalizeImageMarkdown()` 中的 `fixImageNewlines()` 使用全局正则 `/\\n{3,}/g` 将代码围栏外所有连续 3+ 换行压缩为 2 个，导致用户在源码模式明确输入的空行在保存时被静默删除；(2) 图片通过 `setImage()` 插入块级节点，引用和代码块通过 `toggleBlockquote()`/`toggleCodeBlock()` 转换当前块，这些操作在特殊块位于文档末尾时没有统一逻辑确保其后存在可编辑的普通段落。

两个问题分别涉及序列化层和编辑层，但都指向同一个核心矛盾：Markdown 语法对"空行"和"空段落"的表达能力有限，而编辑器需要在这两者之间做出合理取舍。

本设计实现 Issue #154 中定义的"建议的产品规则"（见 proposal）。

## Goals / Non-Goals

**Goals:**
- 源码模式中用户输入的空行在保存/模式切换时不再被全局换行压缩删除
- 图片、引用、代码块插入/转换时，若位于文档末尾，自动在块后保留一个普通续写段落
- WYSIWYG 尾部空段落不编码进 Markdown（不使用 `&nbsp;`、零宽字符、HTML）
- 工具栏图片、引用、代码块操作在 CM6 源码模式下使用 CM6 API
- 连续插入多张图片时只生成一个尾随续写段落
- 已有内容时不得额外插入续写段落

**Non-Goals:**
- 不改变 WYSIWYG ↔ Source 往返的整体机制
- 不在 Markdown 中存储空段落（不引入新序列化格式）
- 不重构整个工具栏架构，只适配 CM6 操作
- 不改变分隔线（`setHorizontalRule`）已有行为

## Decisions

### Decision 1: normalizeImageMarkdown 的换行压缩改为仅作用于图片附近

**现状**：`fixImageNewlines()` 在 `fixCorruptedImageNewlines()` 之后调用，其正则 `/\\n{3,}/g` 跳过代码围栏但会压缩文档中其他所有位置的 3+ 连续换行。

**方案**：将全局换行压缩改为仅对独立图片行附近做二维相邻空行整理（前后各至多保留一个空行），其他位置的连续空行全文保留。

```
// 当前逻辑（40-47行）：
// 1. 先确保独立图片行前后都有空行分隔
// 2. 然后全局压缩 3+ 连续换行 → 这正是导致空行丢失的原因

// 新逻辑：
// 1. 确保独立图片行前后都有空行分隔（保留）
// 2. 移出全局压缩步骤，仅保留"确保图片周围恰好一个空行"的保障
```

**理由**：图片归一化的初衷是保证图片作为块级元素在 Markdown 中正确渲染（前后有空行），不应延伸为全局空行清理。用户输入的空行有其语义（分段/留白），系统应忠实保留。

### Decision 2: 续写段落的创建逻辑放在 `editor.ts` 的命令级

**不对序列化层做改动**，而是在 `setImage()`、`toggleBlockquote()`、`toggleCodeBlock()` 等命令的 ProseMirror 层面插入判断：如果操作后的块节点恰好是文档最后一个子节点，则在其后 append 一个新的空 paragraph，并将编辑器的光标/焦点放在合适位置。

```
// 伪代码
function ensureContinuationParagraph() {
  const editor = getEditor()
  const doc = editor.state.doc
  const lastChild = doc.lastChild
  // 如果最后一个节点是目标块（image/blockquote/codeBlock）且不是 paragraph
  // 且没有后续兄弟节点 → 追加空 paragraph
  if (isTargetBlock(lastChild) && lastChild === doc.child(doc.childCount - 1)) {
    editor.chain().focus().command(({ tr, dispatch }) => {
      tr.insert(doc.content.size, editor.schema.nodes.paragraph.create())
      if (dispatch) dispatch(tr)
      return true
    }).run()
  }
}
```

**理由**：续写段落是编辑器的交互行为，不涉及 Markdown 序列化。放在命令层可以自然利用 ProseMirror 的 state 管理。

### Decision 3: 多图片插入的续写段落仅创建一次

`editor.init.ts` 中 `processImageFiles()` 会顺序插入多张图片。当批量插入时，只在所有图片插入完成后，且最后一张图片是文档末尾节点时，创建一个续写段落。

**实现方式**：在批量插入循环外统一检查，避免每插入一张图片就创建一个段落。

### Decision 4: 源码模式工具栏操作适配 CM6 API

**现状**：图片插入（`insertImageSrc`）在 `toolbar.ts` 中已有 CM6 适配（通过 `getSourceView()` 获取 CM6 `EditorView`），但引用和代码块按钮仍直接操作隐藏的 ProseMirror 编辑器。

**方案**：
- 引用（`btn-quote`）：在 CM6 模式下获取选区文本，包裹 `> ` 前缀
- 代码块（`btn-codeblock`）：在 CM6 模式下用 ``````` 包围选区文本，并提供续写段落标识
- 图片（`btn-image`）：已有 CM6 适配，无需改动

**理由**：CM6 模式下 ProseMirror 编辑器隐藏或不存在，直接操作 ProseMirror 无效。使用 CM6 的 `view.dispatch` 进行文本级操作是正确方式。

### Decision 5: 末尾续写段落不编码进 Markdown

**WYSIWYG → Source 切换**时，ProseMirror 序列化过程中的末尾空 paragraph 自然消失（标准 Markdown 序列化器不输出空段落）。

**Source → WYSIWYG 切换**时，解析器不会为末尾的额外换行创建空段落——这已经是当前行为。因此续写段落作为编辑器内交互状态存在，不在 Markdown 中留下痕迹。

### Decision 6: 图片工具栏按钮在 CM6 下的图片插入后保持光标在插入内容末尾

已有 `insertImageSrc()` 函数实现了 CM6 下的 `![alt](path)` 插入并将光标移动到插入内容的末尾。此行为已满足图片在源码模式的需求，无需额外变更。

## Risks / Trade-offs

- **[风险] ProseMirror 末尾空 paragraph 在序列化中丢失** → 这是预期行为，续写段落是编辑态，不是持久态。如果后续需要更好的 WYSIWYG 体验，可以单独在 ProseMirror 层面管理"末尾提示段落"，但不影响 Markdown。
- **[风险] 批量插入 + 续写段落判断的时序** → `processImageFiles()` 使用 `await` 顺序插入，在循环外统一判断末尾节点状态，避免竞态。
- **[风险] `normalizeImageMarkdown()` 改为仅图片狭窄范围后，是否影响其他调用者** → 需检查所有调用 `normalizeImageMarkdown` 的路径（`getMarkdown()`、`setMarkdown()`、`onUpdate`、`switchToSource`），确保图片在序列化中仍保持正确分隔。
- **[风险] CM6 工具栏操作与 WYSIWYG 共存** → 使用已存在的 `getMode()` 分支逻辑，在 CM6 和 ProseMirror 之间正确切换。

## Open Questions

- 如何判断 WYSIWYG 模式下"文档末尾"的精确语义——是仅 ProseMirror doc 的 lastChild，还是考虑 collapsed/empty 的情况？
- 引用和代码块在 CM6 模式下要不要在插入后自动创建续写段落标记？还是由用户自己在文档末尾操作时自然续写？
