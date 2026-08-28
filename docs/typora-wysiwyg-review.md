# Typora 式所见即所得复核报告

> 复核日期:2026-08-29
> 复核分支:`test/issue-255-lossless-byte-contract`
> 复核性质:独立只读审查(未修改任何代码、未提交)
> 复核范围:`openspec/changes/refactor-lossless-live-preview/` 全部 31 份需求/设计/验证文档 + `src/lib/lossless/` 关键实现(projection.ts、losslessSourceEditor.ts、editorSurfaceBinding.ts、flag.ts、livePreviewFlag.ts)+ editor.css marker 段落。
> 标注约定:[FACT] = 已核实事实;[INFER] = 复核者推断。

## 1. 需求整体判断(一段话)

这套需求是一个以「字节无损」为一等公民的编辑器重构 program:用 Rust `markflow-core` 的 `LosslessDocumentSession` 持有原始字节快照/EOL 映射/revision 作为保存唯一真相,用单一 CodeMirror 6 `EditorState.doc` 承载全部交互文本,Source 与 Live Preview 只是同一 doc 上的 compartment 重配置,所有编辑收敛为 revision-bound 局部 patch,保存走 guarded atomic write + durable receipt;它按 P0→P0S→P1A→P1B→P2→P3→P4A→P4B→P5 十个阶段推进(每阶段独立证据/Reviewer/人工验收/Go-No-Go),最终交付「ProseMirror/serializer 已删除、Live Preview 为唯一编辑路径、未编辑保存逐字节一致、编辑后未触及字节不变」的产品。对「Typora 式所见即所得」终态(标记默认隐藏、光标进入才显示)而言,P3 现状只做到了「标记弱化 + 活动范围全亮」(editor.css:759-769),隐藏能力被 spec 明确允许但推迟到 cohort 门禁之后(specs/codemirror-live-preview/spec.md:65-67),计划由 P4B 的 cohort 门禁与 P6 的状态机共同完成——**架构底座与该终态兼容、不构成方向性阻塞,但 P6 文档自身存在两处必须先解决的自相矛盾(见 §2 矛盾 1、2),且真桌面 IME 证据债尚未偿还**。

## 2. 阶段与一致性

**阶段依赖判定:清晰、无死锁。** [FACT] P4A 有合法终态 `SPIKE_COMPLETE_NO_CORE_IR`(design/00-program-governance.md:42、design/phases/P4A-render-ir.md:66-73),不会卡死后续;P4B 允许在「P4A Go 或仅需可信 local ranges」下开展(design/phases/P4B-widgets-cohorts.md:9);P5 只要求「计划默认的 P4 项分别 Go」(design/phases/P5-release-legacy-cleanup.md:9);P6 前置为 P0–P5 全 Go(design/phases/P6-true-wysiwyg-hidden-markers.md:6)。P3 当前状态也自洽:代码已 default-on(src/lib/lossless/flag.ts:14、livePreviewFlag.ts:10)但治理上「未获准发布」直到 parity 矩阵签署(validation/minimum-parity-matrix.md:6-7、22-24)——文档明确区分了这两件事,这是刻意设计而非矛盾。

**矛盾清单(每条 文件:行号 + 结论):**

| # | 位置 | 矛盾内容 | 结论 |
|---|---|---|---|
| 1 | design/phases/P6-true-wysiwyg-hidden-markers.md:25 vs tasks.md:129、design/03-editor-live-preview-and-interactions.md:24、design.md:319-327 | P6 断言「**P4B 只做 weak,真正 hide 是 P6 的新增契约**」;但 tasks 7.1 要求 P4B 五个 cohort「实现 marker **replace**/reveal 与 atomic range」,design/03 §2 第 4 点说「只有经过 cohort 门禁后才用 replace decoration 隐藏 marker」,design.md §8 更是把「逐 cohort 隐藏」的五 cohort 清单原文写进了主设计;P4B 的验收矩阵(tasks.md:130)恰好就是隐藏 marker 所需的门禁矩阵 | **最严重的不一致**。两处文档必须二选一对齐,否则 P4B 会把 hiding 做掉、P6 又按「全新契约」重做一遍同一批 cohort → 直接返工。[FACT] |
| 2 | P6-true-wysiwyg-hidden-markers.md:37,72 vs design/03:24 | P6 的隐藏机制是「**隐藏不删 DOM**:marker span 仍占位(0 宽/窄占位),textContent 始终含 `#`,复制/a11y 天然正确」;主设计却规定用 **`Decoration.replace`** 隐藏。replace 下被替换文本不进入 DOM,「DOM 含源保证」不成立(SR 读 DOM,不读 doc);两种机制的点击定位、选区几何、屏幕阅读器语义完全不同 | P6 的机制描述与主链设计冲突,且 P6 选的 CSS 0 宽方案是两条路中更差的一条(见 §3 阻塞 B1)。必须在 P4B 前用 ADR 消歧。[FACT] |
| 3 | design/03:55 vs P6:29-33 | design/03 §5 定义四态 `visible/dimmed/hidden/revealed`(composing 是 reveal **条件**);P6 定义三态 `hidden/revealed/composing`(composing 是**状态**) | 分类学不一致,轻,但实现时会纠结;建议 P6 对齐 design/03 四态并把 composing 降回条件。[FACT] |
| 4 | validation/README.md:76-79 vs tasks.md:48-49,66-67,88、validation/phases/P3.md | 验证资产状态表还停在「P1A Program Go PENDING、P1B READY、P2/P3 BLOCKED」,而 tasks 与 P3 验证记录显示 P1A GO(2026-08-14)、P1B Go(2026-08-19)、P2 GO(2026-08-19)、P3 Reviewer GO | 陈旧状态表,未随阶段推进更新,损害验证资产可信度。[FACT] |
| 5 | design/00-program-governance.md:42、design/phases/P4A-render-ir.md:69 vs design.md:609 | 两处写 SPIKE_COMPLETE_NO_CORE_IR 时「**child change** 以…关闭」,但单分支例外已规定 P1A–P5「不再新建 OpenSpec child change」(design.md:609、proposal.md:47) | 单分支例外引入后未清理的陈旧措辞,P4A 若真走到该终态会照抄出流程错误。[FACT] |
| 6 | (正面核实)P6:50 引用 `projection.ts:112` 与 `projection.ts:277-285` | 复核确认 `decorationFor` 确在 112 行、reveal 判定确在 277-285 行,P6:8 的「never hidden in P2」注释也确实存在于 src/lib/lossless/projection.ts:8 | P6 对实现的关键引用**准确**。[FACT] |
| 7 | tasks.md:75 + validation/phases/P3.md(人工验证记录) | tasks 4.4 注记「composition 邻域 reveal…桌面真 IME 未验证…P3 补」;P3 人工验证记录仍是 NOT RECORDED、parity 矩阵 Program Owner 结论全 PENDING | 非矛盾,是**未偿还的证据债**:P6 的 composing 态所依赖的真 IME 证据至今不存在。[FACT] |

## 3. Typora 差距分析

### 3.1 现状 vs 目标(已核实事实 + 差距定性)

| 维度 | 现状(P3,已核实) | Typora 目标 | 定性 |
|---|---|---|---|
| marker 可见性 | 恒弱化 opacity 0.45(editor.css:759-762);active 构造全亮 + 描边(editor.css:765-769) | 隐藏,光标进入才短暂显示 | 核心差距,P6 目标 |
| reveal 驱动 | selection ±2 字符半径交集驱动(src/lib/lossless/projection.ts:282-285),composing 时重建(projection.ts:347) | 同为光标进入驱动 | 驱动机制已就位,只缺 hidden 态输出 |
| 隐藏/atomic 机制 | 全仓库**零** `Decoration.replace`/`Decoration.widget`/`atomicRanges` 实现(grep 核实) | 隐藏 + atomic 穿越所需机制面为 0 | P4B/P6 从零起步 |
| 块级视觉 | heading 是行内 span 字号/颜色(editor.css:706-719);list 显示字面 `-`/`1.`(仅加粗,editor.css:747-749) | 块级布局、渲染 bullet glyph | 额外工作,P6 未提及 bullet 替换(缺口) |
| link URL | URL 可见(0.7 透明,losslessSourceEditor.ts:45)+ 弱化 | URL 完全隐藏 | P6 §5.3 已覆盖(P6:57) |
| image/table/checkbox | exact source fallback(minimum-parity-matrix.md:14;P4B 状态 NOT STARTED,P4B.md §Construct 状态表) | 内联渲染图片/表格/勾选框 | 额外工作,P4B widget 载体 |
| 复制行为 | CM6 copy 基于 doc slice(非 DOM textContent),天然含完整源码 | Typora 复制富文本 + md | **刻意产品差异**:design/05:115 明文要求复制含 Markdown source,不是缺陷但要在产品层讲清 |
| IME | composing 态由 `view.composing` 驱动重建(projection.ts:347-362);**真桌面 IME 从未验证**(tasks.md:75) | 无感 | 证据债,P6 前置 |

### 3.2 硬阻塞 vs 额外工作(实事求是)

**真阻塞(不解决则隐藏版做不出来或做错):**

- **B1 隐藏机制未决且两文档打架(矛盾 2)。** 若按 P6:37 字面用「0 宽 CSS 占位」:`posAtCoords` 点击定位在 0 宽文本上不可靠、选区高亮与 IME 边界异常 [INFER,依据 CM 坐标映射依赖文本测量]。正确机制是 `Decoration.replace` + `EditorView.atomicRanges`(+ 必要时占位 widget),这也是 design/03:24 本来的规定。[FACT]
- **B2 隐藏态的 caret 语义未定义。** 不声明 atomicRanges 时 caret 可落入 hidden range 形成「隐形 caret」——正是 P6 风险表第一行(P6:67);P6 的对策只有一句「ghost caret 通道」(P6:38),没有机制定义(见 §4)。
- **B3 空 construct 规则缺失。** 空 list item(`- ` 后无内容)、空 heading(`# ` 单独成行)、空引用的 marker 若全隐藏,空列表项视觉上变成空行,与 Typora(空 bullet 可见)冲突;现有矩阵无此场景。[INFER,由 design/03 §7 矩阵与 P4B 矩阵条目穷举得出]

**非阻塞、属额外工作(架构与 spec 均已支撑):** 选区跨隐藏 marker(specs/codemirror-live-preview/spec.md:86-101 已有 position/affinity 合同)、IME(composing 恒 Weak 已设计,P6:33)、Ctrl+A/Ctrl+C(copy 走 doc slice 含源,天然满足 spec)、右键菜单(产品功能)、Undo/Redo(CM 单 History 已实现并通过 lifecycle 测试,P3.md AI 验证清单)、字节无损(投影层不改 doc,specs/codemirror-live-preview/spec.md:19 强制,实现已核验——projection.ts 全文无 doc dispatch)。

### 3.3 P4A/P4B 在终态中的角色与 NO_CORE_IR 影响

- **P4B 是 Typora 终态的实际载体**:cohort 门禁、replace/reveal、atomic range、widget protocol、独立 flag 全在 P4B(tasks.md:127-137)。
- **P4A Render IR 是增强而非前置**:heading/inline/quote/list/fence 用 Lezer local ranges 已足够(projection.ts:229-265 现已工作)。`SPIKE_COMPLETE_NO_CORE_IR` 的影响仅限:table/image/diagram widget 必须靠 local ranges(P4B.md:9 允许)或保持 source fallback;Mermaid/FrontMatter 大概率永远 source fallback。**Typora 核心体验(标题/行内/引用/列表/围栏的隐藏 marker)不受 NO_CORE_IR 影响**;但「Typora 完全体」的边界(table 单元格渲染、内联图片)必须按 P4A.md:71 要求如实写进 P5 的「仍未实现范围」。[FACT + INFER]

## 4. P6 方案评审

### 4.1 三级状态机:成立,但有条件

**有效性** [INFER,证据充分]:hidden/revealed/composing 作为**装饰构建策略**成立——它是 `f(selection, composing, construct)` 的纯函数,每次 rebuild 派生、无持久状态可腐化;所需输入(selection 交集、`view.composing`)在 projection.ts:281-285、347 已具备。三态与「单一 doc、永不重写、字节无损」约束**正交**:隐藏只发生在 decoration 层,spec 的「投影 MUST NOT 修改 EditorState.doc」(specs/codemirror-live-preview/spec.md:19)与 L0/L1 合同完全不受影响。**架构上可行。**

**缺口:**

- **G1 状态机的实现载体自相矛盾**(矛盾 2)——这是唯一可能推翻方案的一条:若真按 P6:37 的 CSS 0 宽方案做,状态机再对也救不了坐标与选区语义。必须先 ADR 定为 `Decoration.replace + atomicRanges`。
- **G2 ghost caret 概念悬空**(P6:38 仅一句)。若「reveal-on-intersect」严格执行,caret 永远在进入构造**前**就触发 reveal,caret 不可能停留在 hidden range 内——ghost caret 只在「atomic 隐藏 range 的键盘穿越」时有意义。要么砍掉该概念,要么给出 CM 机制定义(atomicRanges 边界 + 视觉占位符)。[INFER]
- **G3 漏掉的关键场景**(design/03 §7 与 P4B 矩阵均未覆盖):空 construct 可见性(见 B3);Select All 全文相交 → 按现规则全文 reveal = 整篇闪回源码观感,需要策略;IME composition **起始**于 hidden marker 邻域时 reveal 的同步性(WebKit 可能在 decoration swap 时取消 composition);Undo 落点在 marker 内;input rule 形成构造的瞬间(键入 `**`+文本时构造尚不存在,显隐切换时机);双击选词跨 hidden marker。
- **G4 composing 态的证据基础不存在**:桌面真 IME 从未验证(矛盾 7),而三态里 composing 的全部价值就在真实 IME 上。
- **G5 reveal 粒度未定义**:P6:39「块级 revealed 时全量显示 marker」与 spec 的「揭示完成编辑所需的**最小** marker 范围」(specs/codemirror-live-preview/spec.md:67)需对齐——建议以「该构造的全部 marker」为最小单元,Typora 亦如此。
- **G6 与 P4B 的归属矛盾**(矛盾 1)——P6 §2 的前提句不成立,必须改。

### 4.2 补强建议

1. 用 ADR 冻结机制:`Decoration.replace`(可选空 widget)+ `EditorView.atomicRanges` + composing 期间**冻结装饰态**(不重算,避免 WebKit composition 中断),修正 P6 §3/§6 措辞。
2. 把 G3 六个场景补进 P4B/P6 共用矩阵,并给 Select All 定策略(建议:保持 hidden,仅复制走 doc slice)。
3. M1 开工前偿还 IME 证据债(真桌面中文 IME 邻 marker 输入/撤销)。
4. 状态分类学对齐 design/03 四态。

## 5. 必须补充进 spec/设计的缺口(优先排序)

**P0 级(P4B 开工前,否则返工):**

1. 解决 P4B/P6 hiding 归属矛盾:建议保留 P6 为「隐藏交付」阶段,将 tasks.md:129 的「marker replace」改为「widget/atomic range replace(marker 隐藏属 P6)」,并同步 design/03:24、design.md:319-327 的指向;反向方案(P4B 顺带隐藏)会浪费 P6 文档。
2. 隐藏机制 ADR(§4.2-1)。
3. 真桌面 IME 证据(P3 遗留债)。

**P1 级(P4B 期间):**

4. P4B/P6 矩阵补 6 场景(B3 + G3)。
5. cohort hidden flag 命名与默认矩阵(tasks.md:157、162 要求独立 flag,但 `livePreview.<construct>` 命名空间下 hidden 是独立维度还是复用同名 flag,未定义)。
6. Typora 差异清单写入产品文档:复制=源码语义(design/05:115)、Huge 档默认 Source(document-size-tier/spec.md:23-26)、table/diagram 范围受 P4A 终态约束。

**P2 级(治理卫生):**

7. validation/README.md:76-83 状态表刷新(矛盾 4)。
8. design/00:42、P4A.md:69 的「child change」措辞清理(矛盾 5)。
9. P6 状态分类学与 design/03 §5 对齐(矛盾 3)。

## 6. 推荐执行路径

**第 0 步(文档,约半天,可立即做):** 修复矛盾 1/4/5,启动机制 ADR 草案。

**第 1 步(P4A 窗口期):** 冻结隐藏机制 ADR + 偿还 IME 证据债 + 冻结 flag 命名。
验收:ADR 有 Reviewer 签字;真桌面 IME 视频证据入 `validation/evidence/`。

**第 2 步(P4B):** cohort 按现有顺序(heading+strong → 行内 → links → quote+lists → fence);每个 cohort 同时交付 weak(默认)与 hidden(`livePreview.<construct>.hidden`,default-off)两个状态——hidden 与 weak 共用同一套装饰代码路径,只是 marker span 的 decoration 不同,这样 P6 的 M1/M2 实质并入 P4B 节奏,P6 收缩为「全量默认开启 + 块级打磨」。
每 cohort 验收标准(全部机器可判):
① P4B 通用矩阵全绿(含新增 6 场景);
② L1 byte report 与 hidden 关闭时逐字节一致;
③ 独立 Reviewer + 人工 Accept;
④ flag 关闭回 weak,doc/revision/dirty 不变(对标 flagRollback.test.ts 的 4 项模式)。

**第 3 步(P5):** 发布时 hidden flags 维持 default-off(或已验收 cohort 由 Program Owner 决定 default-on);三平台稳定观察与 legacy 清理按 P5.md 不变。
回滚三层:cohort flag → weak;`codemirrorLivePreview=0` → Source;`losslessCoreSession=0` → legacy(livePreviewFlag.ts:18、flag.ts:22 已实现,Huge 档自动 Source)。

**第 4 步(P6 M1→M3):** M1 heading 块级打磨(空 heading 规则、ghost caret/atomicRanges 穿越手感、块级布局);M2 行内收尾;M3 块级 + P4B widget 联动(空 list item 可见性在此落地)。
每项独立 flag、独立回滚,No-Go 不串项(P6:78 已有此约定)。

## 7. 结论

**有条件可行。** 架构方向(单一 CodeMirror doc + Rust 字节真相 + 装饰投影)是 Typora 式隐藏 marker 的**正确底座**:「doc 永不重写」与隐藏正交、reveal 已由 selection 驱动、spec 已为 cohort 门禁后的隐藏预留了合法性(specs/codemirror-live-preview/spec.md:65-67)、Lezer 的 marker range 已在生产代码中精确收集(projection.ts:238-241)——没有发现任何需要推翻方向的架构死点。真正的风险全部集中在三处,且都可在 P4B 前消解:① P6 与 P4B/design 的**隐藏机制与职责归属自相矛盾**(不修必返工);② 隐藏交互语义(atomicRanges/ghost caret/空 construct/Select All)是 P6 文档里最薄弱、也恰恰是最决定手感的一部分;③ 真桌面 IME 证据债。按 §5 的优先级补齐这三类缺口后,P6 方案可以支撑 Typora 终态;若维持 P6 现状文本直接开工,则大概率在 M1 阶段因坐标/选区问题推翻重来。

---

> **2026-08-29 追记**:经 Program Owner 决定,原 P4B 的 image/GFM table/Mermaid/PlantUML 富块 widget 已移交新增的 **P7 backlog**(design/phases/P7-typora-complete-rich-blocks.md、tasks.md §10、validation/phases/P7.md),P4B 只保留轻量控件(task checkbox/code fence controls/FrontMatter)与 raw HTML policy。本报告 §3.3 所述「Typora 完全体长尾」自此有独立承载阶段;相关交叉引用(tasks 7.5/7.6/9.6、design/05 §5、design.md Slice 4、P6 §5、P4B 设计与验证记录)已同步。报告矛盾 1(P4B/P6 hiding 归属)与矛盾 2(隐藏机制 ADR)**仍未处理**,仍为 P4B 开工前必办项。
