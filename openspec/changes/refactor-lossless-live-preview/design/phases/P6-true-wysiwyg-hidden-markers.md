# P6：Typora 式单一所见所得编辑

## 0. 状态

> **IN SCOPE — PLANNED / NOT STARTED。** P6 是 Issue #254 的必达产品阶段，不再是 P5 之后的 backlog。
>
> 前置：P3 默认路径已达到 minimum parity；P4A 终态已冻结；`P4B-SUBSTRATE-GO` 已记录（含真实 IME 基线和 widget protocol）。P4B 单项 widget 可以保持 fallback，由 P7 收口。
>
> 后续：P6 Go 后进入 P7；P5 最后执行发布与 legacy 清理。

## 1. 产品目标

对发布支持矩阵内的普通 Markdown，默认编辑面与 Typora 的公开 Live Preview 行为对齐：inline marker 在完成输入并离开后智能隐藏，block marker 在结构渲染后隐藏；用户把 caret/selection 移入 construct 时原地揭示源码并继续编辑。用户始终处于一个可写 surface，不需要在编辑器和预览窗格间往返。

“Typora 式”是用户体验合同，不是内部架构复制，也不代表一次覆盖 Typora 的全部扩展语法。MarkFlow 继续使用单一 CodeMirror source truth + Rust byte session；unsupported/malformed/unsafe construct 精确回退源码。

## 2. 唯一机制与状态模型

以 [Typora 投影与交互 ADR](../../adr/adr-typora-projection-interaction-contract.md) 为唯一机制：

- `Decoration.replace` 隐藏 marker；
- 同一 source range 提供 `EditorView.atomicRanges`；
- atomic descriptor 区分 `hidden-marker` 与显式 `deletePolicy=whole` 的 atomic construct/widget；marker boundary delete 先 reveal 并删除 content grapheme，不直接删除 delimiter；
- 空 construct 可使用只读 placeholder/glyph；
- plain-text clipboard、save、History、a11y descriptor 来自 source range，不依赖 DOM `textContent`；
- 不允许 CSS 零宽 marker、DOM-string History 或删除 doc 中 marker。

状态统一为：

| 状态 | 使用条件 | 视觉/交互 |
| --- | --- | --- |
| `visible` | Source、fallback、空构造、未支持 | 完整源码 marker |
| `dimmed` | 已投影但未通过 hidden gate | marker 弱化 |
| `hidden` | 已验收且非活动 | marker 替换隐藏，保留 atomic source range |
| `revealed` | caret/selection/command/composition 需要源码 | 该 construct 全部必要 marker 显示 |

Composition 是强制 `revealed` 或冻结安全投影的条件，不是持久状态。

## 3. Reveal 与 selection 规则

- caret 进入 marker、content 或 atomic boundary 前先 reveal；
- 非空 selection 与 construct 相交时 reveal 交互所需最小 construct 闭包；
- Select All 保持稳定布局，不逐 construct 闪回源码；copy/cut 直接使用 source selection；
- nested construct 以最内层为首要编辑目标，需要时扩大到共享 marker 的最小闭包；
- double-click、drag、Shift+Arrow、Home/End、Backspace/Delete 不能把 caret 留在不可见 source position；strong/emphasis/link 的 hidden marker 边界删除必须保留 paired syntax，空 content 时只 reveal；
- Undo/Redo、viewport 卸载/重建、Source 往返必须恢复确定 source selection；
- input rule 新建 construct 时先保持 revealed，caret 离开且 range 稳定后才 hidden。

## 4. 空构造规则

以下构造失焦后不得变成不可发现空白：

- 空 heading：保留 heading placeholder 或 marker；
- 空 unordered/ordered/task list item：保留 bullet/number/checkbox；
- 空 quote：保留 quote bar/marker；
- 空 fence：保留 code block shell、language 与可进入 source 的控制；
- 空 inline pair：保持 revealed，直到包含内容或被删除。

Enter、Backspace、Delete、Tab/Shift-Tab 必须遵守 [结构编辑与表格键盘 ADR](../../adr/adr-typora-structural-interaction-matrix.md) 对 paragraph、heading、list、quote、fence、atomic、跨块 selection 与 malformed 上下文的唯一规则，并记录 selectionAfter、affected range 和一次 Undo 合同；不得沿用 P3 文档中仍含选择分支的旧摘要。Table 规则由 P7 实现。

## 5. Cohort 交付

1. M1：visibility engine + heading + paragraph/thematic break；
2. M2a：strong/emphasis/strike/inline code；
3. M2b：inline/reference/autolink（活动时显示 destination/title）；
4. M3a：quote + ordered/unordered/task list；
5. M3b：fence + P4B task/fence controls/FrontMatter 联动；
6. M4：全局 interaction polish、支持矩阵与默认开启决定。

每个 cohort 独立 flag、独立证据、独立 Reviewer、独立人工验收。Flag 命名分离 projection 与 visibility，例如 `livePreview.heading` 和 `livePreview.heading.hidden`，关闭 hidden 必须回到 dimmed，而不是关闭整个 construct。

## 6. 验收重点

除 P4B 通用矩阵外，P6 每项必须证明：

- inactive 只显示渲染语义，active 在一个交互帧内 reveal；
- marker 显隐不改变 doc、dirty、revision、History 或 byte payload；
- plain-text copy/cut 始终包含完整 Markdown source；
- CJK composition start/update/end 不被 decoration swap 打断；
- empty construct、Select All、nested selection、input rule 和 Undo 落点无 trap/闪烁；
- screen reader 获得可理解的正文与控件描述；
- Huge 文档降级原因可见，Normal/Large 达到冻结 SLO。

## 7. Go/No-Go 与完成定义

P6 Go 要求发布必达 inline/block cohorts 达到 `hidden-preview` 或更高状态，真实桌面语义、视觉、IME、keyboard、a11y、L0/L1 和回滚证据全部通过。

以下任一发生即对应 cohort No-Go：selection trap、不可见 caret、IME 丢字/重排、copy 漏 source、空构造不可发现、显隐产生 doc transaction、无法回 Source。

P6 Go 只能宣称“基础 Markdown 已达 Typora 式所见所得”；图片、表格和图表的终态由 P7 完成，Program 仍不得宣布完成。

## 8. 回滚

关闭 `*.hidden` flag 回到 dimmed projection；关闭 construct flag 回到源码；关闭 Live Preview 回到同一 CodeMirror Source。任何回滚都不得回到 serializer 保存。

## 9. M2b：link（inline / reference / autolink）隐藏 marker

> 本 section 记录 M2b 的 link 状态机与几何决策（§9.5 / §9.8 的实现注脚；tasks.md 的
> §9.5/§9.8 勾选由人工验收与 Program Owner 决定，M2b 实现不自行勾选）。

### 9.1 活动态行为：采用规范 `revealed`（整条揭示），不新增 active-field 边状态

link 与 M2a 对称成对 marker（`**`…`**`）不同，是**非对称多段**（`[` / `](` / `"title"` / `)`）。
P6 状态机已有 `revealed` 定义：“caret/selection/command/composition 需要源码 → 该 construct
全部必要 marker 显示”（§2）。M2b 的 link **复用该规范 `revealed` 态**：

- **inactive**（caret 在 link 外且 `link.hidden` ON）：隐藏全部语法骨架与非文本字段
  （所有 LinkMark、dest URL、title），仅显示 link 文本（autolink 显示 URL，定义行显示 dest）。
- **active / revealed**（caret/selection 与 link 相交）：**整条链接源码揭示**——`[text](dest "title")`
  全部字段（含 dest / title）可见且可**就地编辑**。

理由（“活动态可选别的行为”的说明）：

1. 设计 §2 的定义就是整条揭示；`revealed` 天然满足 §9.5 的硬性要求“活动时显示 destination/title
   且可编辑”——caret 进入 link 即整条显示，dest/title 可编辑。
2. 字段级（仅揭示 caret 所在字段）虽更 Typora 化，但属**新范式**：需要逐字段原子几何、跨字段
   编辑时隐藏其它字段的交互、以及“编辑 text 时 dest 不可见”的反直觉 UX；与已冻结的 `revealed`
   定义冲突，风险高。MVP 选择规范 `revealed`，字段级作为 P7 增强候选，不本 cohort 引入。
3. 与 M2a 一致：`revealed` = 显示源码，无新状态。

### 9.2 各形态隐藏几何（inactive 时 replace+atomic，仅留显示文本）

| 形态 | Lezer 节点 | markers（LinkMark） | 隐藏（replace+atomic） | 显示 |
| --- | --- | --- | --- | --- |
| inline | `Link` | `[` `]` `(` `)`（4） | `[` + `]` + `(` + url + title + `)` | 文本 `[1,5)` |
| autolink | `Autolink` | `<` `>`（2） | `<` + `>` | URL `[1,20)` |
| reference full/collapsed | `Link` | `[` `]`（2） | `[` + `]` + LinkLabel `[ref]`/`[]` | 文本 `[1,5)` |
| reference shortcut | `Link` | `[` `]`（2） | `[` + `]` | 文本 `[1,5)` |
| 定义行 | `LinkReference` | `:`（1） | LinkLabel `[ref]` + `:` + title | dest URL |

- 嵌套 `[**b**](u)` 自然组合：link 隐藏骨架只留文本 `**b**`，strong 再隐藏 `**`，显示加粗 “b”。
- 裸 URL 子构造（如 inline 的 `(url)` 内部）是 `markers=[]` 的 `mf-link`，非可隐藏形态 → 维持
  dimmed，不参与隐藏。

### 9.3 分类门控（延用 M1 thematicBreak 模式）

`Autolink` / `LinkReference` 目前映射 `unknown`（source-fallback）。为隐藏 autolink/定义行，
在 `classifyLezerNode` 中**仅当 `isLivePreviewProjectionOn('link')` ON** 时将其提升为本地
`mf-link` 构造（默认 OFF 保持 GOLDEN parity 不变；PARITY_DOC 不含 autolink/定义行节点）。

### 9.4 malformed link 精确回源码

- 无法解析为 link 节点（未闭合 `[text` / `[text](`）→ 根本不产生构造 → 天然精确实源码。
- 解析出 `Link`/`Autolink`/`LinkReference` 但几何不完整（marker 无序/重叠、缺少必需子节点）→
  `buildHiddenConstruct` 返回 `dimmed`（全部源码可见、marker 弱化），**绝不半隐藏**。

### 9.5 边界删除保留 paired syntax（§9.8 点名 link）

扩展 `hiddenMarkerInteraction.ts`：link 形态（inline/autolink/reference）在
`Backspace @ range.to`（闭 delimiter 后）→ 删 link 文本末一个 grapheme、保留骨架；
`Delete @ range.from`（开 delimiter 前）→ 删 link 文本首一个 grapheme；其余 marker 内边界 → NoOp。
定义行：`Backspace @ range.to` 删 dest 末 grapheme；`Delete @ range.from` → NoOp。
flag OFF 时 handler 返回 false，交回普通源码删除（字节合同不变）。

### 9.6 reference 定义行 dest 编辑：受限项（不静默做一半）

reference link 的 destination 在**定义行、不在引用点本行**（§9.5 硬约束点名）。MVP **不实现
跨位置就地编辑 dest**：reference 激活（revealed）时显示完整 `[text][ref]` 含标签供导航；
destination 在定义行编辑——定义行的 dest URL 在 inactive 时保持可见（隐藏只去 `[ref]:` 标签），
且 active（revealed）时整行揭示可编辑。本项在 RUN.md 声明为受限项。

## 10. M3：quote / list（ordered / unordered / task）/ fence 的块级隐藏 marker

> §10 记录 M3 的块级几何与交互决策（tasks.md §9.6/§9.8 的实现注脚；勾选由人工验收与
> Program Owner 决定，M3 实现不自行勾选）。

M3 是**块级** marker（`>`、`-`/`1.`/`- [ ]`、开闭 ```` ``` ````），与 M2a/M2b 的
**行内** marker 不同。沿用「先解析子节点、再算隐藏 range」的 M2b 纯函数模式（`linkFormGeometry`），
新增三个导出几何纯函数：

- `blockQuoteGeometry(range)`：Blockquote 的 QuoteMark `>` 即其 markers；隐藏每个 `>`，
  content 为整个 Blockquote range（mark 可跨 replace）。
- `blockListGeometry(range)`：ListItem 的 ListMark（`-`/`*`/`+`/`1.`/`- [ ]`）即其 markers；
  隐藏每个 ListMark，content 从最后一个 marker 之后到 item 末。
- `blockFenceGeometry(range, fenceSubs)`：FencedCode 的 markers **冻结为空**（parity oracle 与
  P4B fence cohort 依赖），开/闭/语言几何改从捕获的 FenceSub 子节点
  （`CodeMark`/`CodeInfo`/`CodeText`）解析；open + language + close 一起隐藏，body 保留。

### 10.1 三条块级规则

1. **空块保持可发现（design §4）**：复用既有 `visible` 态（**不新增状态**）——空 quote 留 `>`、
   空 list item 留 bullet/number/checkbox、空 fence 留 shell + language。各几何函数与
   `blockIsEmpty(geo, doc)` 协作：content/body trim 空 → `visible`（marker 不隐藏）。
2. **P4B widget 联动不重复隐藏**：`blockquote`/`listItem`/`fence` owner 均 `local`（可隐藏）；
   `taskCheckbox` owner 为 `widget`——它的 `[ ]`/`[x]` TaskMarker 决不被 list 隐藏（buildDecorations
   已跳过的针对 widget 的 TaskMarker 保留），list 只隐藏 `-`；`codeFenceControls` widget 拥有
   开 fence 的语言徽标 slot（fence 隐藏与 P4B 控件并存，body 仍可 copy）；`frontmatter` owner 为
   `source-fallback`——**不隐藏**。
3. **malformed → 精确回源码**：unclosed fence（无闭合 `CodeMark`）→ `blockFenceGeometry` 返回
   null → `dimmed`（不 half-hidden）。quote/list 无 malformed 形态。

### 10.2 分类门控

`mf-blockquote`/`mf-list-item`/`mf-fence` 各自经 `clsToLivePreviewConstruct` 映射到
`quote`/`list`/`fence` 独立 flag（`livePreview.<c>` + `<c>.hidden`，默认 OFF）。与 M2b link 同：
`hiddenRequested` 仅在 P6 映射命中时置位；flag OFF → 回 `dimmed`（源码可见）。`blockquote`/
`listItem`/`fence` 的默认 owner 本就是 `local`，所以 flag OFF 不改变 GOLDEN parity 构造集。

### 10.3 边界删除（ADR §6 跨块规则）

块 marker 是**开头式**（非成对闭合），故保护语义为「marker 永不被单独删除」：
- quote/list：`Backspace @ markers[0][1]`（开 marker 后）→ NoOp；`Delete @ range.from` → NoOp；
  其余位置交回普通源码删除。真正的「退层/退级」Backspace 由 `structuralInteraction`（先装、同
  `Prec.highest`）处理，二者不重叠。
- fence：`Backspace`/`Delete` 在开 ```` ``` ```` 后/前 → NoOp；`Backspace` 在闭 ```` ``` ````
  前 → NoOp（`fenceMarksAt` 从 syntax tree 解析开/闭/body，不用冻结的 markers）。flag OFF →
  handler 返回 false → 普通源码删除（字节合同不变，可独立回滚）。
