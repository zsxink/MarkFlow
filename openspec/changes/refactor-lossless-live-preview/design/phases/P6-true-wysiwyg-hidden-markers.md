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
