## Context

当前 WYSIWYG（所见即所得）编辑器使用 ProseMirror（通过 Tiptap）与 `tiptap-markdown` 扩展配合。编辑器模式切换流程为：

- `switchToSource()`: 调用 `editor.storage.markdown.getMarkdown()` 序列化 ProseMirror 文档为 Markdown 字符串，写入 `<textarea>`
- `switchToWysiwyg()`: 读取 `<textarea>.value`，调用 `editor.commands.setContent(normalizeImageMarkdown(...))` 重新解析为 ProseMirror 文档

当用户在 WYSIWYG 模式下按 Enter 键，ProseMirror 内部会执行节点分裂（split node）操作。某些情况下（特别是在列表项、引用块或复杂嵌套结构中），分裂产生的节点结构在 Markdown 序列化时产生不完整输出——`tiptap-markdown` 的 `getMarkdown()` 返回的字符串在分裂点之后被截断或丢失内容。

WYSIWYG 视图的内容未立即检查一致性，因此在切换到源码模式之前，用户看不到问题。切换后，丢失内容已无法恢复（`getMarkdown()` 返回不完整字符串覆盖了 textarea）。

用户报告的具体症状：
- 在有序/无序列表内按 Enter（换行/拆分列表项）后切源码模式，列表之后的内容丢失
- 在引用块内按 Enter 后切源码模式，续行内容丢失
- 源码模式中丢失的行在 WYSIWYG 中仍显示但位置偏移到右侧（ProseMirror 渲染的 phantom 节点）

## Goals / Non-Goals

**Goals:**
- 修复已知场景下 WYSIWYG 模式按 Enter 后 Markdown 序列化截断问题
- 确保 `getMarkdown()` 在 Enter 操作后始终返回完整文档内容
- 添加自动化测试覆盖 Enter → 序列化 round-trip 场景
- 提供保守的运行时校验机制：切换模式前校验内容完整性，发现损坏时发出警告并阻止覆盖

**Non-Goals:**
- 不重写 tiptap-markdown 扩展
- 不改变当前编辑器切换的整体架构
- 不涉及文件保存/读取的变更

## Decisions

### Decision 1: 优先定位 tiptap-markdown 序列化器的节点兼容性缺陷

`tiptap-markdown` 库的 `getMarkdown()` 方法遍历 ProseMirror 文档树并对每个节点调用序列化函数。如果某个节点类型（或嵌套组合）没有对应的序列化规则，或规则实现在特定状态下返回空字符串，则输出被截断。

**Alternatives considered:**
1. **在 `switchToSource()` 前做 ProseMirror 文档校验和修复** — 更安全，但修复范围有限，且无法阻止 `getMarkdown()` 本身的缺陷
2. **替换 markdown 序列化方案** — 可以自己遍历 ProseMirror doc 并序列化，但工作量大且偏离已有的 tiptap-markdown 集成
3. **在 Enter 键处理中注入 post-processing** — 添加 `Enter` 键盘事件的後处理，检查并修复分裂后的节点结构

**Chosen:** 方案1（文档校验 + 修复）作为第一道防线，同时深入分析 tiptap-markdown 序列化器的缺陷并贡献修复。因为：
- 方案3过于干预用户输入流程，可能引入新 bug
- 方案2工作量大，不适合 bug fix
- 方案1在切换点做校验是侵入最小的保护措施，同时可以深入调查序列化根因

### Decision 2: 在 `switchToSource()` 中添加 Markdown 完整性校验

在将 `getMarkdown()` 的返回值写入 textarea 之前，将其内容与通过其他方式获取的文档表示进行比较，确保关键内容没有丢失。具体思路：

1. 获取 `getMarkdown()` 的输出
2. 用 `normalizeImageMarkdown()` 标准化后保存
3. 将保存的 Markdown 重新喂给 `setContent()`（先快照再恢复），检查 round-trip
4. 如果 round-trip 后文档长度或关键节点计数显著减少，说明序列化有问题，发出警告

**Alternatives considered:**
无——此校验是轻量级防御措施，开销可控。

### Decision 3: 修复特定节点类型的序列化

基于调查结果，针对 `tiptap-markdown` 中以下常见问题节点类型添加自定义序列化规则或扩展：

- `listItem` 分裂后的 `bulletList`/`orderedList` 嵌套
- `blockquote` 内多段落或嵌套列表
- `codeBlock` 与周边节点的边界情况

这些自定义序列化规则在 `editor.ts` 的 `Markdown.configure(...)` 中作为配置项注入。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| **Round-trip 校验产生假阳性**（未损坏的内容被标记为损坏） | 校验只发警告不阻止操作，用户可以忽略并继续 |
| **自定义序列化规则与 tiptap-markdown 升级冲突** | 固定 tiptap-markdown 版本，升级时单独测试 round-trip |
| **修复了已知场景但遗漏了未知场景** | 提供通用的 fallback 序列化保护，任何未知节点类型都尝试用其 textContent 兜底 |
| **校验逻辑本身有 bug 导致性能下降** | 校验只在切换模式时执行，不影响正常的 WYSIWYG 编辑性能 |

## Open Questions

- tiptap-markdown 的 `getMarkdown()` 截断是否与特定 ProseMirror schema 节点的 `toMarkdown` 序列化定义缺失有关？需要在调试中确认
- ProseMirror 文档树中是否存在 `getMarkdown()` 无法遍历到的节点类型组合？
