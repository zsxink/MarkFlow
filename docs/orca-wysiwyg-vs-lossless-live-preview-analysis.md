# 调研分析：Orca 的 Markdown 所见即所得实现 vs MarkFlow `refactor-lossless-live-preview` 能否做到 WYSIWYG

> 调研日期：2026-08-29
> 对比对象：
> - [stablyai/orca](https://github.com/stablyai/orca)（浅克隆快照，主分支，v1.4.178-rc.2）
> - 本仓库 `openspec/changes/refactor-lossless-live-preview`（proposal.md / design.md / design/* / tasks.md，含 `src/lib/lossless/` 当前实现对照）
>
> 本文档为独立调研产物，不修改任何现有文件。

---

## TL;DR

1. **Orca 的 WYSIWYG 是「富文本树」路线**：TipTap v3（ProseMirror）+ `@tiptap/markdown`，编辑真相是 ProseMirror 文档树，Markdown 只是序列化产物。它靠**三态渲染门控**（source / rich-editor / preview）+ **round-trip 证明** + **diff-match-patch 源码调和**来逼近字节保真，属于"语义等价 + 尽力保字节"。
2. **MarkFlow 提案是「源码真 + 投影」路线**：CodeMirror 6 单一 EditorView 是唯一编辑正文，Rust Core 持有字节真相，渲染只是 decoration/widget 投影。它承诺的保真等级**更严格**（L0/L1 字节级合同），WYSIWYG 形态是 **Obsidian 式 Live Preview → P4B 逐 cohort 隐藏 marker → P6 Typora 式全隐藏**。
3. **结论：`refactor-lossless-live-preview` 能做到所见即所得编辑模式，但形态不是 Orca/Tiptap 那种富文本树 WYSIWYG**。基础 Live Preview（语义样式 + marker 弱化 + 激活揭示）已在 P2/P3 落地并通过验收；Typora 式"正常只显示渲染视图、点击才显示标记"被明确规划在 P4B（cohort 隐藏）与 P6（backlog，True WYSIWYG）。proposal 同时**明确拒绝** ProseMirror 富文本方向，目标是最终删除 Tiptap/serializer。
4. 两条路线在工程上高度趋同（不安全就回源码、局部 patch、未触及区域不变、外部修改防护），核心分歧在**保真等级**（字节等价 vs 语义等价）和**编辑真相**（源码文本 vs 富文本树），这是产品哲学选择而非谁对谁错。

---

## 一、Orca 是怎么做 Markdown 所见即所得的

Orca 是一个 Electron 桌面应用（AI 编排 IDE），其内置 Markdown 文件编辑器位于 `src/renderer/src/components/editor/`（约 501 个文件），核心相关文件：

| 文件 | 职责 |
| --- | --- |
| `EditorMarkdownFileSurface.tsx` | 按渲染模式分发到 Monaco / TipTap / 只读预览 |
| `markdown-render-mode.ts` / `markdown-rich-mode.ts` | rich 模式门控与不支持语法检测 |
| `RichMarkdownEditor.tsx` / `useRichMarkdownEditorInstance.ts` | TipTap 编辑器实例与生命周期 |
| `rich-markdown-extensions.ts` | 语法扩展集合（唯一的解析/序列化契约） |
| `rich-markdown-serialization-commit.ts` / `rich-markdown-source-reconcile.ts` | 保存前的源码调和（保真核心） |
| `markdown-round-trip.ts` | 一次性 TipTap 解析→序列化 round-trip 证明 |
| `markdown-frontmatter.ts` | front matter 剥离与重组 |
| `rich-markdown-source-transport.ts` | 原样 HTML/字面量的 keyed envelope 通道 |

### 1.1 引擎选型：TipTap（ProseMirror）+ `@tiptap/markdown`

- 编辑器是 TipTap v3，`Markdown.configure({ marked, markedOptions: { gfm: true } })` 负责 Markdown ⇄ ProseMirror doc 的双向转换（内部用 `marked` lexer/parser，Orca 用一个 Proxy facade 修正了 `@tiptap/markdown` 3.22.5 的 registry 注入问题，见 `tiptap-marked-facade.ts`）。
- 扩展集合覆盖：StarterKit（标题/列表/引用/加粗/斜体/删除线等）、lowlight 代码块（React NodeView + 语言选择）、链接（自定义优先级让 `` [`x`](y) `` 序列化正确）、本地图片（NodeView 走 IPC→blob URL 绕过跨域）、任务列表、details/summary、GFM 表格、KaTeX 行内/块级公式、doc link、raw HTML inline/block 通道、批注高亮。
- 这是**真正的富文本 WYSIWYG**：`**bold**` 在文档里就是一个带 bold mark 的文本节点，marker 字符默认完全不存在于视图层——观感同 Typora/Notion。

### 1.2 三态渲染门控：不是所有文件都允许进 WYSIWYG

`getMarkdownRenderMode()` 把用户选择的 viewMode（source/preview/rich）映射为实际渲染模式：

```text
viewMode=source  → source（Monaco）
viewMode=preview → preview（只读渲染）
viewMode=rich    → 超过 300KB（RICH_MARKDOWN_MAX_SIZE_BYTES）→ source（可"仍然打开"覆盖）
                   含不支持语法 → source（带原因 banner）
                   否则        → rich-editor（TipTap）
```

不支持语法的检测（`markdown-rich-mode.ts`）先剥离代码块/行内代码再跑正则：

- **HTML/JSX/MDX**、**reference-style links**（`[x]: url`）、**footnotes**（`[^x]: ...`）→ 直接判为 rich 不安全；
- HTML 命中后再做**第二道证明**：真正创建一个一次性 TipTap 编辑器做完整 parse→`getMarkdown()` round-trip（≤50KB，LRU 缓存 20 条），逐个验证内嵌 HTML 片段在输出中原样存活，全部存活才放行 rich 模式。

代码注释里有一条关键不变量：

> "rich-mode detection must use the exact same markdown extension set as the live editor. If these drift, Orca can claim a document is editable in preview and then still lose syntax on save."

即：**门控用的解析器必须和编辑器是同一套**，否则会出现"门控说安全、保存却丢语法"。

### 1.3 front matter 与原样内容的旁路

- front matter（YAML `---` / TOML `+++`）被正则剥出 TipTap 之外，以只读 banner 显示（"edit in source mode"），保存时重组回正文。永远不让 front matter 进 ProseMirror 树。
- 无法建模的内容（raw HTML 等）通过 **keyed transport envelope** 过关：`` [[ORCA_RICH_MD:<32位hex>:inline-html:<urlencoded>]] ``这样的带 key 信封让 `marked` 当普通文本处理，序列化后解包还原；并有 `isReservedRichMarkdownTransportBody` 防止用户正文撞车信封格式。

### 1.4 保存保真：三路源码调和（Orca 的"无损"答案）

富文本树序列化必然归一化未触及区域（`*` vs `-`、CRLF、setext 标题等）。Orca 的对策是 `reconcileSerializedMarkdown()`（`rich-markdown-source-reconcile.ts`，197 行，注释密度极高）：

```text
refs:
  originalSourceRef   磁盘原始字节（可能非规范、可能 CRLF）
  baseCanonicalRef    原始字节经 getMarkdown() 的规范形（未编辑基线）
  lastCommittedRef    上一次真正写盘的精确字节

每次提交（300ms debounce + autosave/restart/teardown 三处同步 flush）：
  edited = editor.getMarkdown()          // 规范形，恒 LF
  reconcileSerializedMarkdown(originalSource, baseCanonical, edited, roundTrip)
```

调和算法六分支：

1. **edited === baseCanonical**（语义上没改）→ 原样返回原始字节，**零磁盘扰动**；
2. 仅 EOL/尾部换行差异 → 携带源 EOL 返回，跳过重解析；
3. 任一串 > 50k UTF-16 单元 → 有界成本，直接回退规范形；
4. 主路径：diff-match-patch（10ms 超时，防半匹配死循环）对 baseCanonical→edited 求 patch，**打到 originalSource 上**（LF 空间 + UTF-8 offset 修正）——用户的编辑被"移植"进原始字节，未触及区域保留原样式；
5. 任一 patch 应用失败（模糊定位不可信）→ 回退规范形；
6. **证明步**：把调和结果再喂给一次性 TipTap 重序列化，规范形与 edited 不等即证明 fuzzy 匹配放错了位置 → 回退规范形。最后恢复主导 EOL（CRLF 文件保持 CRLF）。

失败兜底永远是"内容正确、样式可能归一化"，从不丢内容。外部修改用 `lastCommittedMarkdownRef` 短路（自己刚写的字节不当作外部改动），程序化 reload 会重置三路 refs 基线。

### 1.5 Orca 方案的本质与边界

- **编辑真相 = ProseMirror 树**；保真 = "语义等价 + dmp 移植 + round-trip 证明"的尽力字节保持。证明的是 *render-equivalent*，不是 byte-equal。
- **兼容面以门控换安全**：footnotes、reference links、部分 HTML、>300KB 文件都被挡在 rich 之外（回 source，但可编辑）。超大文档/超大调和直接接受规范形（会改未触及字节）——代码里明确承认这是"today's behavior"的取舍。
- UX 上限高：这是结构化富文本编辑（表格 cell、节点拖拽、slash 菜单、emoji 菜单、链接气泡、批注），第一观感即可对标 Typora。

---

## 二、`refactor-lossless-live-preview` 的 WYSIWYG 能力分析

### 2.1 架构：与 Orca 相反的真相归属

design.md §2 的双层模型：

```text
Rust LosslessDocumentSession（字节真相）      CodeMirror EditorSurfaceBinding（交互真相）
original bytes + hash                        logical LF text（optimistic）
BOM + per-newline EOL map                    selection / viewport / composition
confirmed text / revision                    decorations / widgets
persisted revision / file identity           CodeMirror History
```

- **编辑真相 = CodeMirror 源码文本**，渲染永远只是投影（"widget/decoration 只是同一 CM doc 的投影"）；
- 所有编辑入口产生 **revision-bound 局部 patch**（UTF-16 changes → Core 校验 → 逻辑 UTF-8 字节范围），禁止 serializer/`normalizeImageMarkdown()` 等任何全文归一化进入保存路径；
- 字节合同分两级：**L0**（零编辑零写盘、显式保存 byte-to-byte）与 **L1**（编辑后未触及 byte span 逐字节不变）——比 Orca 的"语义等价"合同**严格一个等级**。

### 2.2 WYSIWYG 的三层递进形态

| 层 | 内容 | 状态 |
| --- | --- | --- |
| **P2/P3 基础 Live Preview** | 单一 EditorView + compartments 切换；Lezer 本地语法树对 heading/strong/emphasis/strike/inline code/link/quote/list/fence 做语义 decoration；marker **弱化**（`opacity: 0.45`），光标/选区/composition 进入时全量揭示；失效按最小结构闭包；malformed/unknown 精确回退源码 | **已完成**（tasks 4.1–4.10 全勾；`src/lib/lossless/projection.ts` 已实现，注释明确 "never hidden in P2"） |
| **P4B cohort 隐藏 + Widgets** | marker replace（隐藏）按五个 cohort 逐项开启（heading+strong → 行内 → links → quote/list → fence）；task checkbox / fence 控件 / image / GFM table / frontmatter / Mermaid / raw HTML 逐个 widget（原子 range、键盘协议、source fallback、独立 flag） | 未启动（P3 默认开启 parity 尚未签署） |
| **P6 True WYSIWYG（backlog）** | Typora 式：正常状态 marker 完全隐藏（三级状态机 hidden/revealed/composing + ghost caret 通道）；marker span 仍在 DOM 中占位（复制天然含 Markdown）；IME 合成期恒弱化；按 cohort 复用 P4B 验收矩阵 | backlog，明确 P5 Go 之前不得实施 |

P6 文档（`design/phases/P6-true-wysiwyg-hidden-markers.md`）自我定位非常清楚：

> 目标形态：与 Typora 所见即所得模式一致——正常情况下只显示渲染后的视图，鼠标点击（光标进入）时才短暂显示前面的 Markdown 标记。
> 差异记录：P6 隐藏的是 **marker 字符**，内容本身仍是源码渲染；……不做 PM 式结构编辑。

### 2.3 与 Orca 门控哲学的对照

两者在"渲染出错怎么办"上答案一致——**回源码，可编辑，绝不猜正文**：

| 维度 | Orca | MarkFlow 提案 |
| --- | --- | --- |
| 回退粒度 | **文件级**（含不支持语法 → 整个文件回 Monaco source） | **construct 级**（单个构造 `source-fallback`，其余继续投影） |
| 回退触发 | 正则检测 + round-trip 证明失败、超 300KB | parser error / IR stale / widget timeout / unsafe URL / unsupported |
| 大文档 | 300KB rich 上限（可覆盖） | document-size-tier 分级，Huge 档默认 Source |
| 门控/编辑同源不变量 | 检测 parser 必须等于编辑器扩展集 | construct owner registry：同一 range 只允许 `local`/`core`/`source-fallback` 一个 owner，且 P4A parser spike 候选必须同时服务 range 与投影 |

### 2.4 proposal 是否"能做到所见即所得"——分层结论

**能做到，且已有三条明确证据链：**

1. **基础 Live Preview 已经做到并验收**（P2 Go；P3 完成编辑能力迁移：toolbar/keyboard/paste/图片/Enter-Backspace command matrix/History grouping 全部 `[x]`，仅默认 flag 开启的 parity 签署 5.10–5.13 待办）。这就是 Obsidian 式"边写边渲染"的所见即所得。
2. **Typora 式观感有完整设计**（P6 三级状态机 + ghost caret + 复制保源 + IME 回退），且 P4B 的 cohort/widget 协议是通往它的已铺路径。技术上 CodeMirror `Decoration.replace` + atomic range 是被 Obsidian Live Preview、Zettlr 等验证过的成熟做法，不存在可行性风险，只有交互打磨成本。
3. **字节保真不依赖渲染**：投影层崩溃/超时/不认识语法时，同一源码仍可编辑、保存——WYSIWYG 是投影增强而非保存前置（design.md Decision 7），这消除了 draft 分支曾出现的"WYSIWYG 打开只显示源码"单点故障。

**做不到 / 明确不做的：**

1. **Orca/Tiptap 式结构化富文本编辑被明确排除**（design.md 路线比较表 + Non-Goal"首期实现完整 CommonMark/GFM/Pandoc 的所见即所得投影"；P5 之后删除 ProseMirror）。表格 cell 内富文本、图片节点级操作等靠 P4B widget 协议逐步逼近，上限是"CM widget + 局部 patch"，不是 PM 的任意结构编辑。
2. **完整 WYSIWYG 观感是长周期交付**：design.md 自认风险——"CodeMirror Live Preview 的编辑质感短期不如 ProseMirror"。从当前 P3 到 P6 全量 Typora 观感，中间隔着 P4A（parser spike/Render IR，有两个合法终态）、P4B（每 cohort 一轮 AI+Reviewer+人工验收）、P5（legacy 清理）。

### 2.5 从 Orca 可借鉴的四点

1. **round-trip 证明作测试 oracle**：Orca 用"调和结果重序列化必须语义等价"做保存安全证明。MarkFlow 的 Enter/Backspace command matrix、cohort 投影回归可以用同思路做**语义 oracle 测试**（命令产生的 patch 应用后，重新 parse 的语义树与期望一致），比纯字节断言多一层语义保护。
2. **门控 UX 的明示与豁免**：Orca 对"为什么不让我用富模式"给出具体原因文案，且 size 限制允许"Open anyway"覆盖。P4B raw HTML policy / P6 大文档回落 Source 时值得照搬这种"原因 + 可覆盖"的降级 UX。
3. **keyed envelope 防撞车**：若 P4B raw HTML 采取占位/信封策略，Orca 的 `[[ORCA_RICH_MD:<key>:...]]` + 保留体检测（防止用户正文伪装信封）是现成参考。
4. **flush 三通道**：Orca 在 autosave、应用重启、React teardown 三个路径都挂了同步序列化 flush（`useLayoutEffect` 先于编辑器销毁）。MarkFlow 的 flush barrier 已覆盖 save/切换/reload/close，可补"窗口关闭/应用退出"通道的对拍测试。

### 2.6 风险对照

| 风险 | Orca 的做法 | MarkFlow 提案的暴露面 |
| --- | --- | --- |
| 未触及字节被归一化 | dmp 补丁 + 证明步，但超 50k/patch 失败/超 300KB 分支**接受规范形** | L1 合同下这是 No-Go；Core patch 模型在结构上杜绝，但 P4B widget 的局部 patch 质量是长尾风险 |
| 光标/选区在隐藏 marker 中迷失 | PM 原生处理（无隐藏 marker 问题） | P6 的 ghost caret/atomic range 是最大交互风险点，P6 文档已列为单项 No-Go 红线 |
| IME 吞字 | PM 原生 | composing 恒弱化 + P4B 矩阵门禁 |
| 性能 | 300KB 直接不让 rich | viewport-only projection + 分级降级，合同更宽但验收更严 |
| 生态/功能上限 | TipTap 扩展生态，slash/emoji/表格控件开箱即得 | 全部自研（P3 command router 已自研完成，P4B widget 继续自研） |

---

## 三、最终结论

1. **`refactor-lossless-live-preview` 能做到所见即所得编辑模式**：基础形态（语义渲染 + marker 弱化/揭示）已在 P2/P3 落地并经真实桌面验收；Typora 式"隐藏标记"形态在 P4B/P6 有详细可执行设计与验收矩阵。
2. **它做到的不是 Orca 那种 WYSIWYG**：Orca 是富文本树编辑器 + 门控 + 序列化调和；MarkFlow 是源码投影编辑器 + 字节会话。前者 UX 上限高、保真靠证明兜底；后者保真上严格（byte-level L0/L1）、UX 逐 construct 爬坡。两者的共同底线一致——**渲染失败时回退源码可编辑，绝不让渲染层污染正文**。
3. 若追求"像 Orca/Typora 那样打开即纯渲染视图"，请对齐 P6 的预期时间线（P4A/P4B/P5 全部 Go 之后）；若接受 Obsidian Live Preview 观感，当前 P3 完成后的默认开启（5.10 parity 签署后）即已达到。

---

## 附：证据文件索引

**Orca（/tmp/orca-analysis 克隆快照）：**
- `src/renderer/src/components/editor/EditorMarkdownFileSurface.tsx` — 三态分发、front matter banner、size 覆盖
- `src/renderer/src/components/editor/markdown-render-mode.ts` / `markdown-rich-mode.ts` — 门控与不支持语法检测、HTML round-trip 证明
- `src/renderer/src/components/editor/rich-markdown-serialization-commit.ts` / `rich-markdown-source-reconcile.ts` — 六分支调和算法
- `src/renderer/src/components/editor/rich-markdown-extensions.ts` — 扩展集合（解析/序列化契约）
- `src/renderer/src/components/editor/rich-markdown-source-transport.ts` — keyed envelope
- `src/renderer/src/components/editor/RichMarkdownEditor.tsx` / `useRichMarkdownProgrammaticSync.ts` — 生命周期、外部同步、flush 通道
- `src/shared/constants.ts:93` — `RICH_MARKDOWN_MAX_SIZE_BYTES = 300 * 1024`

**MarkFlow：**
- `openspec/changes/refactor-lossless-live-preview/proposal.md` / `design.md`（§路线比较、Decision 2–14、Slices 0–5）
- `design/03-editor-live-preview-and-interactions.md`（单 EditorView、reveal、command matrix、paste、History）
- `design/phases/P2-live-preview-surface.md` / `P4A-render-ir.md` / `P4B-widgets-cohorts.md` / `P6-true-wysiwyg-hidden-markers.md`
- `tasks.md`（P0–P3 完成状态：§1/§1S/§2/§3/§4 全勾，§5 的 5.1–5.9 勾选、5.10–5.13 待办，§6–§9 未启动）
- `src/lib/lossless/projection.ts`（当前 Live Preview 实现：弱化/active reveal，"never hidden in P2"）
