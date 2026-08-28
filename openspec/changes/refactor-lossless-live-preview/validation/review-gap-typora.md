# Typora 式所见即所得复核报告

> 复核 `refactor-lossless-live-preview` 整包需求，评估其能否支撑「Typora 式所见即所得」终态。
> 复核方式：只读审阅 proposal/tasks/design/specs/validation + 关键实现（projection.ts、losslessSourceEditor.ts、editor.css）。
> 标注约定：`[FACT]` = 已核实的文档/代码事实；`[INFER]` = 复核者推断。
> 复核日期：2026-08-29。分支：`test/issue-255-lossless-byte-contract`（P5 未合，P6 仅 backlog）。

## 1. 需求整体判断

`[FACT]` 这套需求（Issue #254，umbrella `refactor-lossless-live-preview`）的核心是**把编辑器从「ProseMirror 双正文 + serializer 保存」迁移到「单一 CodeMirror `EditorState.doc` + Rust LosslessDocumentSession 字节快照 + 投影装饰」**，以「未编辑字节逐字保留、编辑只改意图范围（L0/L1 保真）」为最高合同。

`[FACT]` 用户终态目标是 Typora 式所见即所得：**常态只显示渲染视图，点击/光标进入构造才短暂显示 Markdown 标记**。

`[INFER]` 判断：需求**有条件可行**。它已在文档层为「隐藏 marker」预留了位置（design/03 定义 `hidden` 态与 reveal 条件；P4B 的 cohort 门禁；P6 backlog），但存在三处需要处理：① **隐藏 marker 与「纯装饰」的架构张力**（见 §5）；② **P6 与 design/03 的重复/漂移**（P6 的「三态」重复了 03 的「四态」，且 03 把隐藏 marker 定位为 P4B 就应做的 cohort 提升，而非 P5 之后）；③ **marker 从「弱化」到「隐藏」是跨层契约变更，当前 spec 没有把它写成显式 requirement**。

## 2. 阶段与一致性

### 2.1 阶段依赖
`[FACT]` `design/README.md:34-42` 的阶段表：P0（刻画像）→ P0S（止血）→ P1A（Core）→ P1B（Source 闭环）→ P2（基础 Live Preview）→ P3（默认路径）→ P4A（Render IR，可选）→ P4B（widgets/cohorts）→ P5（发布+legacy 清理）→ P6 backlog。
`[FACT]` `P4A-render-ir.md:66-72` 明确 P4A 有合法终态 `SPIKE_COMPLETE_NO_CORE_IR`——Core IR 可以不引入，P4B 只做有可信 local ranges 的 construct。
`[INFER]` 依赖无死锁：P5 不依赖 P4A 必须成功；P6 明确依赖 P5 Go。唯一要盯的是 P4A 若走 `SPIKE_COMPLETE_NO_CORE_IR`，P6 中依赖 Core IR 的部分（大文档/复杂块的隐藏渲染）要降级。

### 2.2 一致性问题清单

| # | 位置 | 问题 | 结论 |
|---|---|---|---|
| 1 | `projection.ts:8` 注释「never hidden in P2」，对照 `design/03:64`「隐藏 marker 之前，每个 cohort 单独通过门禁」 | 代码注释把「永不完全隐藏」写成 P2 全局承诺，但 design/03 明确允许单 cohort 隐藏。**文档领先于代码**，实现尚未兑现文档。 | 不是 bug，但「隐藏」欠实现债务 |
| 2 | `design/03:55` 定义 marker 状态 `visible/dimmed/hidden/revealed`（四态），而 `P6-true-wysiwyg-hidden-markers.md:§3` 定义 `hidden/revealed/composing`（三态） | P6 重复且与 03 不一致（03 有 4 态，P6 只有 3 态、还把 `composing` 当独立态）。**同一组状态两处定义，将来会漂移**。 | 需要收敛：03 为主，P6 引用它 |
| 3 | `P6-true-wysiwyg-hidden-markers.md:0`「前置：P5 全 Go」，对照 `design/03:24`「只有经过 cohort 门禁后才用 replace decoration 隐藏 marker」 | 03 把隐藏 marker 放在 P4B 的 cohort 门禁清单里（P5 之前），P6 却把它整体推迟到 P5 之后。**定位冲突**。 | 隐藏 marker 的「单 cohort 隐藏」应在 P4B 项内做；P6 应是「默认隐藏到 Typora 完整度」而非「首次隐藏」 |
| 4 | `minimum-parity-matrix.md:14` 标记 P4B widget 明确延后，P3 `design/phases/P3-default-editing-path.md:31` 门槛「marker 至少弱化且活动范围完整 reveal」 | P3 把「弱化 marker」定为默认门槛，接受「非隐藏」作为 P3 交付。**与终态「隐藏」存在阶段性落差，但设计上正确（P3 不阻塞）**。 | 无冲突，但需确认 P5 后 default 仍是「弱化」时用户观感 |
| 5 | `tasks.md:Slice 6`（9.1-9.7）与 `P6.md` 将 P6 全部标 `NOT STARTED`、`不属于 Issue #254 当前范围` | 与 `design/README.md:40` 的阶段表一致；但 P6 若只是「记录为 backlog」，其 design/03 已覆盖的部分会悬空。 | 建议：把 design/03 已覆盖的隐藏 marker 拆分给 P4B，P6 只留「完整 Typora 体验」增量 |

## 3. Typora 差距分析

### 3.1 现状（已实现）vs 目标

`[FACT]` 现状 `editor.css:759-762`：`.mf-construct .mf-marker { opacity: 0.45 }`——marker 弱化、不隐藏。`projection.ts:277-285`：reveal 由 selection（半径 2）驱动，construct 相交就加 `.mf-active`（`editor.css:765-768`，marker 全量显示 + 描边）。`projection.ts:309-313`：非 active 时 marker 加 `mf-marker` 弱化。

`[FACT]` `design/03:53-64`：marker reveal 条件已定义（caret 在 marker/content、selection 相交、composition、跨 atomic 前、命令前、widget focus/cancel），且「隐藏 marker 必须每 cohort 单过门禁」。

| 维度 | 现状（P2/P3 实现） | Typora 目标 | 差距性质 |
|---|---|---|---|
| 默认显示 | marker 可见（opacity .45） | marker 隐藏 | 契约级（需 replace decoration 或等宽占位） |
| 交互进入 | caret/selection 相交 → `mf-active` 全亮 | 点入 → marker 短暂显示 | 已基本存在，需从「全亮」变为「显示 marker」 |
| IME | `composing` 时 construct 上下文弱化不隐藏 | 合成中输入可见 | 已设计（03:60），实现需验证 |
| 复制 | `textContent` 含源 → 复制含 Markdown 正确 | 同目标 | 天然一致（`[FACT]` decoration 不改 doc，复制仍得源） |
| 无障碍 | marker 弱化 → SR 读到 `##` 字面 | 隐藏 marker 不能让 SR 丢正文 | `05-render-ir-widgets-nfr.md:115` 已声明要求，实现待验证 |

### 3.2 到底能不能「隐藏 marker 同时保持 doc 不变」？

`[INFER]` 这是整个复核最重要的发现：**当前 `projection.ts` 用 `Decoration.mark`（`decorationFor`, `projection.ts:112`）给 marker 加 class + CSS opacity 弱化。要「隐藏 marker 字符」，有两种代码路径，都已经被文档预告但实现未做：**

1. **`Decoration.replace` 替换 marker 为视效等价物**：`design/03:24` 明说「只有经过 cohort 门禁后才用 replace decoration 隐藏 marker」。`Decoration.replace` 可在视觉上隐藏/替换源文本，且**不改 doc**。这是 Typora 式隐藏的正路。
2. **等宽占位 + opacity:0 + cursor 保位**：marker 仍占据字符位置（`textContent` 含源），仅视觉透明。适合「复制要含源 + 光标可穿越」场景，但光标放在隐藏区域会「看不见在哪」。

`[FACT]` 若用 `Decoration.replace` 彻底替换 marker 为 widget（如标题替换成块级 widget），则复制 `textContent` 是否还含 `#` 取决于实现——若替换成空 widget，复制会丢源。**设计 03/05 已要求「复制结果含 Markdown source」（`05-render-ir-widgets-nfr.md:115`），但没规定实现用 mark 不动 doc、还是 replace 换 widget。这个技术选型没冻结，是 P4B/P6 前必须 ADR 的缺口。**

### 3.3 硬阻塞（区分「阻塞」vs「额外工作」）

**真阻塞：**
- `[FACT]` 隐藏 marker 的**唯一正路是 `Decoration.replace`，它与当前「文本必须整体可读可选可编辑」的 P3 优先次序（`03:21`「文本始终可读、可选、可编辑」）部分冲突**：replace 掉 marker 后，marker 字符不再可点击/可选。这不违反「doc 不变」，但违反「全文可编辑」的字面承诺。**需要按 cohort 单开门禁来豁免**（03:64 已这样要求，但 P3/P4B 尚未执行到隐藏）。
- `[FACT]` 复杂构造（表格 cell、代码围栏、图片）在 `projection.ts:79-109` 的 `classifyNode` 里 `FencedCode/HTMLBlock/CodeBlock` 返回 null → 保持原始源码（`projection.ts:260-262` 不 descend）。**这些构造的「n 隐藏 + 可编辑」依赖 P4B widget，而非 P6 本身**——所以 P6 若想完整 Typora（表格、围栏也渲染），必须吃 P4B 依赖。

**仅是额外工作（非阻塞）：**
- 光标穿越隐藏 marker 的可见性（等宽占位 / reveal 提前）
- 右键菜单、Ctrl+A 全选时 hidden marker 显示策略
- IME 合成邻域不闪 marker（已有设计 03:60，需实现验证）
- 三主题、高对比下隐藏 marker 的 discoverability（NFR §8）

## 4. P6 方案评审

**结论：P6 的「隐藏 marker + 点击显示」方向正确，但与 design/03 重复/漂移，且遗漏了关键场景。**

`[FACT]` `design/03:55-64` 已经定义了 4 态 marker（visible/dimmed/hidden/revealed）与 reveal 条件。`03:24` 已经把「replace decoration 隐藏 marker」放进 P4B cohort 清单。`[INFER]` 意味着 **P6 不应「发明」隐藏 marker，而应把 P4B 里已计划的单 cohort hidden 提升合并进来，再补齐 Typora 完整度的增量（块级整块渲染、跨构造快捷键等）。**

**P6 方案的三态 vs 03 四态**：
- `[FACT]` P6 的 `hidden` ≈ 03 的 `hidden`；P6 的 `revealed` ≈ 03 的 `revealed`；P6 的 `composing` 是 03 里的一种「reveal 触发条件」（03:60），不是独立态。
- `[INFER]` 03 的 `dimmed`（= 现状 opacity .45）在 P6 三态里消失了——这是**倒退**：如果一个构造既不隐藏也不 active，P6 没有定义它该「弱化」还是「全显」。应保留 dimmed 作默认态。
- P6 `[gap]` 遗漏场景：表格 cell 内隐藏（依赖 P4B 表格 widget）、引用/列表多行块级 marker、围栏内代码高亮的 marker 隐藏、链接 URL 隐藏后 hover/active 显示（03:62 有 cursor 触发）、拖选跨隐藏 marker（03:62 有跨 atomic 前 reveal）。

**P6 的 Ghost caret 通道** `[FACT]` 与 03 的 reveal 条件（caret 在 marker/content 就 reveal）等价；`[INFER]` 更精确的是「caret 进入 construct 的 marker OR content range 即 reveal」，不必单独发明「ghost caret」命名。**建议：P6 只补「marker 隐藏后的行为细化」，reveal 判定复用 03 的矩阵。**

## 5. 必须补充进 spec/设计的缺口（按优先级）

| 优先级 | 缺口 | 影响 | 建议落在 |
|---|---|---|---|
| P0 | **Marker 隐藏实现选型未冻结**：mark vs replace vs 占位。这决定复制是否含源、光标可见性、a11y。 | 不做 ADR，P4B/P6 隐藏会返工、可能违反 03:64 复制要求 | `design/03` + 新 ADR |
| P0 | **「隐藏 marker vs 全文可编辑」的豁免规则**：哪些 construct 默认隐藏、哪些 active 才显、哪些永不隐藏。 | 违反 P3 优先次序将引发 No-Go | `design/03` Marker reveal 节 + P4B cohort 清单 |
| P1 | **P6 与 design/03 状态重复**：收敛为单一状态模型，P6 引用 03。 | 两处定义漂移 | `design/03` 为主 + P6 改为引用 |
| P1 | **复杂构造（表格/围栏/列表/引用）的隐藏依赖 P4B**：P6 明确 table/fence 的 hidden 需要 P4B 的 cell/fence widget，不能假想独立完成 | 低估依赖、进度失准 | P6 的「依赖」节 + P4B 每个 construct 加一列「hidden marker」 |
| P2 | **隐藏 marker 的默认开/关**：P4B 的规则是「单项 Go 才能 default-on」（P4B:64）。Typora 完整度若要默认开，需明确阈值与回滚 | 默认开启的风险 | P6 / P4B cohort default decision |
| P2 | **Ctrl+A 全选 + 隐藏 marker**：全选时如何显示全部 marker；Select All 后复制是否含源 | 复制/全选 UX 缺口 | `design/03` Reveal 条件 + P4B 矩阵 |

## 6. 推荐执行路径

`[INFER]` 基于上述，建议把「Typora 式隐藏 marker」并入 P4B 的 cohort 门禁路线，而不是等 P5 后单独做 P6：

1. **P4B 前置 ADR**：冻结 marker 隐藏的底层实现（mark 弱化 / replace 隐藏 / 占位透明）+ 复制含源保证 + a11y。落 `design/03`，阻塞 P4B cohort。
2. **逐 cohort 隐藏**（复用 P4B 顺序，P4B:15-17）：heading→strong→emphasis/strike/inline-code→link→quote/lists→fence；每项独立 flag、按 03:64 门禁单独通过 mouse/键盘/IME/copy/SR/contrast。
3. **P4B widget 隐藏**：task checkbox、fence controls、image、table、frontmatter、diagram——隐藏只在 widget 通过后启用，widget 未过的 construct 保持弱化/源码 fallback（P4B:8 规则）。
4. **「默认开/关」决策**：只有当常用 cohort（heading + strong + emphasis/inline-code）全部隐藏、且不违反复制含源、无 selection trap 时，才 default-on。复杂构造（table/fence）按 widget 就绪单独放开。
5. **P6 重定位**：把 P6 从「发明隐藏 marker」收敛为「Typora 完整度增量 + 全选/拖选跨构造行为 + 三平台视觉基线」，其内容与 P4B 合并，P6 文档改为 backlog 引用 03/P4B 的增量清单。

每项验收：`[FACT]` 04/05 的 byte 合同与 performance SLO（05:92-100）、P4B 矩阵（P4B:22-40）、minimum parity matrix。回滚：关闭单项 flag（P4B:68）。

## 7. 结论

**有条件可行。**

- 方向正确：单一 doc + decoration 隐藏 marker 是达成 Typora 式体验的可行架构，`design/03` 已预留 hidden/reveal 设计，复制含源与 a11y 要求已在 NFR。
- 三个必须解决的缺口：**① 隐藏实现的 ADR 未冻结（mark/replace 选型）；② P6 与 design/03 的状态模型重复且 P6 把隐藏整体推后到「发明」，应并入 P4B cohort；③ 「隐藏 vs 全文可编辑」的单 cohort 豁免规则未在 spec 显式成文。**
- 建议：把「Typora 式隐藏 marker」当作 P4B 的 cohort 提升来落地（而非 P5 后独立 P6），P6 退化为「Typora 完整度增量」backlog。若 P4A 走 `SPIKE_COMPLETE_NO_CORE_IR`，藏 marker 仍可用 local ranges 完成，不影响核心目标。