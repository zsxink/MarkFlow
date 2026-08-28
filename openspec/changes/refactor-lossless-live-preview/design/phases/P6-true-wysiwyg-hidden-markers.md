# P6：True WYSIWYG — 隐藏 Markdown 标记(Typora 式渲染视图)

## 0. 状态

> **BACKLOG：不属于 Issue #254 当前交付范围。** 本文是 P5 之后的后续功能点规划。
> - 前置：P0–P5 全部 Go,ProseMirror/Tiptap/serializer 已删除(Live Preview 为唯一编辑路径)。
> - 当前：NOT STARTED。在 P5 Go 之前不得开展任何实施。
> - 目标形态：与 Typora 所见即所得模式一致——**正常情况下只显示渲染后的视图,鼠标点击(光标进入)时才短暂显示前面的 Markdown 标记**。

## 1. 目标

把 P2/P4B 的「marker 弱化(`mf-marker { opacity: 0.45 }`)」升级为「marker **隐藏**」:普通文档状态下,标题、加粗、斜体、强调等构造只显示渲染后的文本,`#`、`**`、`` ` `` 等标记字符不显示;**一旦光标/选区进入该构造,标记立刻显示(可编辑源码)**。

不改变底座:Live Preview 仍是单一 CodeMirror `EditorState.doc`,`doc` 永不因投影而重写;字节无损契约(L0/L1)是 P6 的硬性约束,不被任何渲染功能绕过。

## 2. 与现有阶段的关系

| 阶段 | 关系 |
| --- | --- |
| P2 | 提供当前两态(marker 弱化 / active 全亮)——P6 在它的 `projection.ts` 上扩展第三态 |
| P4A | Core Render IR 若 Go,P6 复杂构造的隐藏渲染可接入 IR;`SPIKE_COMPLETE_NO_CORE_IR` 则只用 local ranges |
| P4B | 提供 widget protocol / owner registry / source fallback / 每项独立 flag——P6 的块级与 widget 联动直接复用 |
| P5 | **前置清除**:删除 legacy 编辑器、serializer、双正文状态,固化 Live Preview 唯一路径,才 safe 做「隐藏标记」 |

P4B 设计承诺「marker never hidden in P2」(`projection.ts` 注释)与删除逻辑挂钩:**P4B 只做 weak,真正 hide 是 P6 的新增契约**。

## 3. 设计:三级 marker 状态机

| 状态 | 触发 | 视觉 | 可编辑性 |
| --- | --- | --- | --- |
| `hidden` | 光标/选区**不** intersects 构造 | marker 视觉消失,内容以渲染样式呈现 | 内容可编辑;marker 隐形但占位 |
| `revealed`(激活) | 光标/选区 intersects | marker 全量显示,可编辑标记 | 改级别/加粗范围等 |
| `composing`(回退) | IME 合成中 | 恒为 Weak(不隐藏) | 永不隐藏,防丢字 |

关键机制:

- **隐藏不删 DOM**:marker span 仍占据源文本位置(0 宽/窄占位),`textContent` 始终含 `#`。复制/剪切/辅助技术的「复制结果含 Markdown」天然正确,与 `05-render-ir-widgets-nfr.md` §8 的 a11y 要求一致。
- **Ghost caret 通道**:光标经过隐藏 marker 即把该构造提升为 `revealed`,这是唯一交互入口;保证「点进去就能看到/编辑源码」,永不 trap。
- **块级构造(标题/列表/fence)**:revealed 时全量显示 marker,因为回车、缩进、升降级需要 marker 存在。

## 4. 分层(复用 P4A/P4B 协议)

| 层 | 归属 |
| --- | --- |
| Hiding engine(状态机 + ghost caret) | P6 新增 |
| Widget protocol / owner registry / source fallback | P4B |
| Core Render IR | P4A(可选) |
| 单 owner 装饰 + doc 永不重写 | P2/P3/P1B 底座 |

P6 只在现有 `decorationFor`(`projection.ts:112`)与 reveal 判定(`projection.ts:277-285`)上加第三态文案,不重建 P4B 已验收 widget。

## 5. 实施内容(按 cohort 交付,沿用 P4B「每项独立 flag + 独立验收 + 独立回滚」)

1. 基础状态机 + heading(最先,最难的是块级)
2. strong/emphasis/strike/inline code
3. links(URL 隐藏,hover/active 再显示)
4. quote + lists
5. fence
6. 与 P4B 各 widget(图片/表格/task)的 hidden 联动

每项按 P4B §4 通用矩阵验证:inactive/active/selected/composing/revealed/fallback、click/drag/double、Arrow/Home/End/Shift+Arrow/Backspace、Select All、copy/paste、IME、Undo/Redo、read-only、三主题、screen reader、viewport create/dispose、export。

## 6. 关键风险与应对

| 风险 | 应对 |
| --- | --- |
| 隐藏 marker 导致光标消失/跳不动 | Ghost caret + 严格 revealed 提升;验证 Arrow 全向导航 |
| 复制结果缺 Markdown | marker 仍是 DOM 文本,复制含源;复制测试纳入矩阵 |
| IME 合成吞字 | composing 恒 Weak;复用 P4B composing coverage |
| 大文档性能 | NFR 分级不变(Huge 档默认 Source);P6 对 Huge 回落 Weak/source |
| 与 P4B widget owner 冲突 | 复用单 owner registry;每项独立 flag 独立回滚 |
| 无障碍丢失正文 | 隐藏 marker 不得让 SR 丢正文;DOM 含源保证 |

## 7. 里程碑 / 验收 / 回滚

- **里程碑**:M1 状态机 + heading → M2 行内 cohort → M3 块级 + widget 联动。
- **验收**:每 cohort 按 P4B 矩阵全过 + source before/after byte 报告(不变)+ 人工 Accept/Reject + 独立 Review。
- **Go/No-Go**:任何 selection trap、输入丢失、复制漏源、IME 吞字、不可回源码 = 单项 No-Go(不阻塞其他项)。
- **回滚**:关闭单项 flag → 回退该构造 Weak/local projection;正文/dirty/Core revision 不变。

## 8. 与 Typora 目标的差异记录

- 目标:正常只显示渲染视图,点击才显示标记。
- P6 隐藏的是 **marker 字符**,内容本身仍是源码渲染;块级内容(表格 cell、代码块)仍以 P4B widget/IR 呈现,不做 PM 式结构编辑。
- 将来若要做「marker 彻底蒸发、编辑即结构操作」,属于 P6 之后的再一个功能点,不在本文范围。