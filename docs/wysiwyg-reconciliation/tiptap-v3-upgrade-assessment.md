# WYSIWYG 优化前置筛选评估：TipTap v2 → v3 升级兼容性

> 日期：2026-08-31
> 目的：在决定「方案 A：不升级引擎」vs「方案 B：升级到 v3 对齐 orca」之前，摸清 v2→v3 对 MarkFlow 现有扩展/插件/序列化链路的全部变更风险与工作量。
> 参考：orca（TipTap v3.22.5 + @tiptap/markdown【marked 系】），本地 MarkFlow（TipTap 2.7 + tiptap-markdown 0.8.10【markdown-it 系】）。

---

## TL;DR

| 模块 | v2（现状） | v3（对齐 orca） | 风险 | 工作量 |
|---|---|---|---|---|
| 核心运行时 | @tiptap/core 2.7 | @tiptap/core 3.30 | 🟡 中 | 小（配置签名、`getPos` 返回、`immediatelyRender` 等） |
| Markdown 序列化 | tiptap-markdown 0.8.10（markdown-it） | @tiptap/markdown 3（marked） | 🔴 **高** | 大（重写扩展 hooks，换解析引擎） |
| 列表/Task | @tiptap/extension-task-item/list v2 | @tiptap/extension-list 3（task-item/list 并入） | 🔴 高 | 中（换包 + tokenizer 新 API） |
| 表格 | @tiptap/extension-table v2 | @tiptap/extension-table 3 | 🟡 中 | 小（v3 原生 markdown hook） |
| 代码块高亮 | @tiptap/extension-code-block-lowlight v2 | 同包 v3 | 🟢 低 | 小（plugin 签名兼容） |
| Placeholder | @tiptap/extension-placeholder v2 | @tiptap/extensions 或同包 v3 | 🟢 低 | 极小 |
| 数学公式 | 无 | @tiptap/extension-mathematics（KaTeX） | 🟢 增益 | 新增（顺带实现增强方向 KaTeX） |

**结论**：v2→v3 最大的成本与风险不在「升级运行时」，而在「**换 Markdown 序列化引擎**」——`tiptap-markdown(markdown-it)` → `@tiptap/markdown(marked)`。这恰好也是 orca 大部分价值（占位 token、contentType:'markdown'、tokenizer hooks）的载体。

---

## 一、当前 MarkFlow Markdown 序列化链路（v2）

### 1.1 使用的 hooks
MarkFlow 通过 `tiptap-markdown` v0.8.10 提供的能力做 Markdown ↔ ProseMirror 双向转换（见 `editor.init.ts` / `editor.ts` / `editor.extensions.ts`）：

- **编辑器级**：`editor.storage.markdown.getMarkdown()`（序列化）、`setContent()`（解析）。
- **扩展级**：`addStorage() { return { markdown: { serialize: {...}, parse: {...} } } }` —— tiptap-markdown v0.8 的扩展侧钩子。
  - `CustomLink`：`markdown.serialize.open/close` + `mixable` 控制 `[text](url)` 序列化。
  - `mermaidCodeBlockExtension`：`markdown.serialize` 覆盖代码块输出格式；`markdown.parse.updateDOM` 修 fence 尾部空行。
- **全局兜底**：`checkSerializationIntegrity()` + `extractDocAsFallback()` + toast（`editor.ts`/`editor.helpers.ts`）。

### 1.2 依赖版本
```
@tiptap/core  ^2.6.0（lock 解析 2.7.0）
tiptap-markdown ^0.8.10   ← markdown-it ^14 驱动
@tiptap/extension-task-item ^2.6.0
@tiptap/extension-task-list ^2.6.0
@tiptap/extension-table{,row,cell,header} ^2.6.0
@tiptap/extension-code-block-lowlight ^2.6.0
```

---

## 二、v3 的 breaking changes 对照 MarkFlow（逐模块）

### 2.1 @tiptap/core / 运行时（🟡 低-中）

v3.0.0 release note 关键点（已从 GitHub release 取证）：

| 变更 | 对 MarkFlow 影响 |
|---|---|
| `getPos` 强类型为 `number \| undefined` | `editor.extensions.ts` 的 `getPos()` 判断要更新（现用 `typeof getPos === 'function'` 已兼容）。 |
| Node/Mark/Extension 配置不再允许任意 key（强类型） | `mermaidCodeBlockExtension` 的 `storage.markdown.serialize` 配置需套 v3 类型；手写 HTTP 节点 `addStorage` 用 `Record<string, unknown>` 即可。 |
| `editor.storage` 变为 per-editor 且强类型 | `imageBubblePlugin`/`urlDecorationPlugin` 若存跨编辑器 storage，需改。 |
| `setContent`/`clearContent` 默认触发 update | MarkFlow 的 `programmaticUpdate` 标志位已处理此语义，但仍需回归。 |
| `immediatelyRender`（React 版）；SSR mode | MarkFlow 是非 React 原生实例，影响小；orca 的 `immediatelyRender: false` 可参考。 |
| UMD 不再支持 | Vite 构建不受影响。 |
| **注**：MarkFlow 用 `new Editor({...})` 原生实例（非 React），`@tiptap/react` 的相关 break（FloatingUI 取代 Tippy）**不涉及**（MarkFlow 不用 BubbleMenu/FloatingMenu）。 |

**结论**：运行时升级是小-中工作量，主要在类型与配置签名上，风险可控。

### 2.2 Markdown 序列化引擎（🔴 高 —— 本评估核心）

这是 v2→v3 **真正的高风险区**，也是 orca 价值的载体。

#### 引擎差异
| | tiptap-markdown v0.8.10（现状） | @tiptap/markdown v3（orca） |
|---|---|---|
| 底层解析 | **markdown-it** | **marked** |
| 扩展钩子 | `storage.markdown.serialize/parse` | **`markdownTokenizer` / `markdownTokenName` / `parseMarkdown` / `renderMarkdown`**（扩展级，从 @tiptap/core 暴露） |
| 内容类型 | 间接 | **`contentType: 'markdown'`**（编辑器直接吃 markdown 初始化） |
| marked 注入 | 无 | `Markdown.configure({ marked: myFacade, markedOptions })`（orca 用 `tiptap-marked-facade` 注入自定义 marked 实例，保留插件注册） |

#### 对 MarkFlow 现有代码的冲击
1. `CustomLink` 的 `storage.markdown.serialize` → 需改写为 v3 的 `renderMarkdown(node/fragment)` / `markdownTokenizer` 形式。**链接序列化是核心能力，必须 1:1 保真**。
2. `mermaidCodeBlockExtension` 的 `storage.markdown.serialize` + `parse.updateDOM` → 改 v3 hook。其中"strip fence 尾部空行"目前是 `updateDOM` 里做的 —— v3 没有这个入口，需在 tokenizer/parse 层用别的方式做。
3. StarterKit v3 默认**已含 Link**（且 `@tiptap/extension-link` v3 默认 `autolink: true`）——MarkFlow 现在 `CustomLink` 显式 `autolink:false/linkOnPaste:false` 关掉这些。v3 下需确认 StarterKit 的 link 配置与 CustomLink 不打架。
4. **table**：v3 表格扩展内建 markdown 序列化（`renderTableToMarkdown` + `markdownTokenizer`），MarkFlow 无需再靠 tiptap-markdown 的 HTML fallback —— 这**修复**了当前「表格退化为 HTML/丢内容」的问题。
5. **task-list / ordered-list**：v3 tokenizer 有 orca 修过的边界 bug（对齐续行误判为缩进代码等）。MarkFlow 可以直接抄 orca 的 `RichMarkdownTaskList` / `RichMarkdownOrderedList`。但 task-item/list 包换名（见 2.3）。

**工作量估计**：重写链接/代码块/列表的 markdown hooks（3-4 个扩展），需为每个补 round-trip 回归测试。这是「B 方案」的最大单项。

### 2.3 列表 / Task 扩展（🔴 高 —— 换包）

v3.0.0：
- `@tiptap/extension-task-item` / `@tiptap/extension-task-list` 标记为 `packages-deprecated`，并入 **`@tiptap/extension-list`**（`TaskItem`、`TaskList`、`BulletList`、`ListItem`、`OrderedList`、`ListKeymap` 统一从此包导出）。
- StarterKit v3 也用 `@tiptap/extension-list` 提供列表。
- MarkFlow 现在 `import TaskList from '@tiptap/extension-task-list'` → 需改为 `import { TaskList } from '@tiptap/extension-list'`。
- v3 `ListKeymap` 是新增的（enter/tab/backspace 分支列表行为）——是增强，但要回归嵌套列表的键行为。

### 2.4 表格（🟡 低-中）
v3 表格扩展把 row/cell/header 收进同包 + 内建 markdown hook。MarkFlow 的 4 个 table 导入换成同包 4 个导出即可，且表格 markdown 序列化由 v3 原生接管（更好）。

### 2.5 代码块高亮（🟢 低）
`@tiptap/extension-code-block-lowlight` v3 的 `LowlightPlugin` 签名基本兼容（`createLowlight` + `registered()` API 一致）。MarkFlow 的 `mermaidCodeBlockExtension` 是 `CodeBlockLowlight.extend(...)` 自建 nodeView —— 这一层在 v3 同样支持。orca 的装饰式低亮（`rich-markdown-lowlight.ts`，只重算改动块）是**可选增强**，不是迁移必需。

### 2.6 其他（🟢 低 / 增益）
- **Placeholder**：v3 在 `@tiptap/extensions` 也有打包版，但旧包仍可用。极小。
- **math（KaTeX）**：v3 `@tiptap/extension-mathematics` 提供 `InlineMath`/`BlockMath`（orca 已用）——MarkFlow 的增强方向「KaTeX」可借这次升级**免费拿到 WYSIWYG 内实时公式**（而非 roadmap 里的「静态块+双击编辑」降级方案）。**这是 B 方案的隐藏红利**。

---

## 三、风险与收益对照

### 选 A（不升级，在 tiptap-markdown v0.8 上移植 orca 三件套）
- **收益**：reconcile/资格门禁/占位 token 三件思路可移植；保存丢内容与脏误报能改善。
- **局限**：
  1. `tiptap-markdown` v0.8 的扩展钩子是 `storage.markdown.serialize/parse`，没有 v3 的 `markdownTokenizer`/`renderMarkdown` 双通道，**占位 token 需要在 markdown-it 层的 token 流里拦截**（可行但更脏）。
  2. 没有 `contentType: 'markdown'` 的编辑器级直接初始化。
  3. **引擎仍锁定 markdown-it**——orca 的很多 tokenizer 修复（任务列表、有序列表）无法直接复刻。
  4. **表格 HTML fallback 问题仍存在**（v2 table 没有原生 markdown hook）——只能继续靠兜底。

### 选 B（升级 v3，对齐 orca）
- **收益**：
  1. **1:1 复刻 orca 全部技术**：`contentType:'markdown'`、marked facade、占位 token 的 `markdownTokenizer/renderMarkdown` 双通道、reconcile。
  2. **自带修复**：表格 markdown 内建（消灭 HTML fallback）、task-list tokenizer 修复、列表键增强。
  3. **隐藏红利**：`@tiptap/extension-mathematics` 让增强方向「KaTeX」直接升级为 WYSIWYG 实时公式。
- **成本**：
  1. **换序列化引擎 = 重写链接/代码块/列表 3-4 个扩展的 markdown hooks + 全套 round-trip 回归测试**。这是最大单项。
  2. 换任务列表包 + starter-kit v3 默认 link/underline 的多重注册需确认不冲突。
  3. 需要一个过渡分支专门做迁移 + 回归，工作量约等于一个小型重构（但**目的**不是 #254/#255 的 Live Preview，而是把现有 WYSIWYG 做对齐）。

---

## 四、建议

**先按「方案 B 的降风险版」推进**：
1. 用一次**独立分支**做 v3 升级 + @tiptap/markdown，但**先不引入** orca 的全部 reconcile/资格门禁，先只做到「**v2→v3 + 序列化 hooks 重写 + 现有功能全部回归通过**」。
2. 证明 v3 的 round-trip 不比 v2 差（甚至因为表格内建 markdown 而**更好**）之后，再分阶段引入 orca 三件套（资格门禁 → 占位 token → reconcile）。
3. 若升级过程发现扩展兼容性超出预期（卡在 mermaid/plantuml nodeView），有明确回退点（A 方案仍保留）。

这样把「升级 v3」这个大不确定性拆成「迁移（可回退）+ 移植 orca 价值（按风险排序）」两段，避免一次性赌注。