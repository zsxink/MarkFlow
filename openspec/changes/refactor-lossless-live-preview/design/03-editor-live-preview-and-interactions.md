# 单一 CodeMirror、Live Preview 与编辑交互设计

## 1. 单一 EditorView

每个活动 lossless document 只创建一个 `EditorView`。基础扩展永久存在，模式、主题、只读、projection 和调试能力使用 `Compartment` 重配置。

```text
EditorState.doc  ─────────────── 唯一交互正文
selection/history/composition ─ 唯一交互状态
          │
          ├─ Source compartment: syntax highlight + full markers
          └─ Live Preview compartment: semantic decorations/widgets + reveal
```

模式切换不得调用 `setContent()`、serializer、whole-doc replace 或重新创建 EditorView。切换 transaction 必须 `docChanged=false` 且不新增 History entry。

## 2. 基础 Live Preview

P2 只使用 CodeMirror Markdown/Lezer 本地树投影：heading、strong、emphasis、strike、inline code、link、blockquote、list 和 fenced code。优先级：

1. 文本始终可读、可选、可编辑；
2. marker 初期可见但弱化；
3. 语义字号、字重、颜色和布局正确；
4. P4B 只建立可验证的 visibility/atomic/interaction substrate；通过门禁后由 P6 用 replace decoration 隐藏 marker；
5. 复杂或未知结构显示源码。

P4A 已决定本 change 不引入 Core Render IR；所有发布投影使用受信 Lezer local ranges 或精确 source fallback。

## 3. Projection owner

每个 construct identity 在同一 revision 只能属于：

- `local`：CodeMirror/Lezer 基础投影；
- `widget`：source-backed interactive projection；
- `source-fallback`：原样源码。

owner registry 以 construct type、source range、revision 和 request identity 标识。同一 construct 的 owner handoff 必须在一个 StateEffect/transaction 中先移除旧 owner 再建立新 owner。父子构造的范围允许包含，但 parent 必须显式声明让出的 child range 或 editable slot；`source-fallback` 的最小不可信范围压制其内部所有投影。

## 4. 失效闭包

每次 doc change 后先计算最小 projection invalidation closure：

- paragraph/heading/inline：当前语法 block；
- list item：可能影响 marker/loose-tight 时扩大到所属顶层 list；
- blockquote：扩大到所属 quote container；
- fence/frontmatter/HTML block：整个 fenced/container range；
- reference/footnote definition：定义与可见依赖者；
- parser error：错误 range 加安全边界；
- 无可信 range：viewport 内显示 source fallback，并异步请求重建。

投影只处理 viewport 加 overscan；不可见复杂 widget 不实例化重型 renderer。

## 5. Marker visibility 与 reveal

统一状态为 `visible`、`dimmed`、`hidden`、`revealed`；composition 是强制 reveal 或冻结安全投影的条件。P4B 提供状态解析器和交互门禁但不输出 hidden，P6 是唯一 hiding 阶段。

隐藏使用 `Decoration.replace`，需要原子穿越的 source range 同时提供给 `EditorView.atomicRanges`；空 construct 可用只读 placeholder/glyph。不得使用 CSS 零宽 marker 或假设 rendered DOM `textContent` 含有源码。Plain-text clipboard、save、History、drag source 和 accessibility descriptor 必须从 CodeMirror/Core source range 生成。

Reveal 条件：

- caret 即将进入 marker、content 或 atomic boundary；
- selection 与 construct 相交，但 Select All 不触发逐 construct 布局闪烁；
- composition 与 marker 相交或相邻；
- mouse drag、double-click、keyboard selection 即将跨过 atomic range；
- construct command/input rule 即将编辑 source；
- widget focus/cancel 需要回到 source。

Nested construct 先 reveal 最内层可编辑目标，需要时扩大到共享 marker 的最小闭包。空 heading/list/quote/fence 必须保留可发现 marker、glyph 或 placeholder。Input rule 新形成的 construct 先保持 revealed，caret 离开且 range 稳定后才能 hidden。

Visibility 变化必须只改变 decorations/state effects，不得产生 doc transaction、History、dirty 或 Core revision。隐藏前每个 cohort 单独通过鼠标、键盘、IME、copy、screen reader、high contrast、空构造、Select All、Undo 落点和 viewport 重建门禁。

## 6. Selection

CodeMirror `EditorSelection` 是唯一 selection。保存 anchor/head、direction 和 affinity；transaction 后用 `ChangeDesc.mapPos` 映射。DOM selection 只由 CodeMirror 内部管理，MarkFlow 不保存 DOM node。

Widget 必须声明：

- source range；
- atomic 与否；
- before/after affinity；
- Arrow/Home/End/Tab 行为；
- Backspace/Delete 行为；
- Enter/Space activation；
- reveal source 命令；
- screen reader label。

## 7. Enter/Backspace command matrix

命令路由输入：selection、line boundaries、syntax context、construct owner、read-only、composition。输出只能是 `CodeMirror TransactionSpec`、`RevealSource` 或 `NoOp`。

唯一规范行为由 [结构编辑与表格键盘 ADR](../adr/adr-typora-structural-interaction-matrix.md) 冻结，覆盖 paragraph、heading、list、quote、fence、table、atomic、跨块 selection 与 malformed/unknown；下表只是摘要，不得作为实现时重新选择分支的授权。

| 上下文 | Enter | Backspace at start |
| --- | --- | --- |
| 普通段落 | 插入继承 EOL 的逻辑换行 | 与前一文本行按普通语义合并 |
| Heading | 内容开头插入前置 paragraph；中部拆为 heading + paragraph；行尾新增 paragraph；空 heading 转 paragraph | 内容开头删除 heading marker 转 paragraph |
| 非空 list item | 中部拆分或末尾新建同级 item，继承 marker family/indent；不重编号旧项 | 内容开头：嵌套 item outdent 一级，顶层 item 转 paragraph |
| 空 list item | 嵌套 item outdent 一级；顶层 item 删除 marker 退出为 paragraph | 与 Enter 相同的层级决定 |
| Blockquote | 非空行复制当前 quote depth；空 quote 删除一层 marker | 内容开头只删除一层 quote marker |
| Fence body | 插入 literal newline | literal delete，不触发结构转换 |
| Table | P7 前 reveal source；P7 后 Enter 移到同列下一行，末行追加一行 | cell 内普通删除；结构删除只能经显式 table command |
| Hidden marker / atomic construct-widget | marker boundary reveal 后删除 content grapheme并保留 delimiter；widget 仅在 descriptor 声明时 Enter activation | 只有 `deletePolicy=whole` 的 construct/widget 可整段删除，否则只 reveal |
| 跨块 selection | 用一个继承 EOL 的 line boundary 替换 selection | 只删除 selection并 collapse 到起点 |
| Malformed/unknown | reveal source，使用普通文本语义 | reveal source，使用普通文本语义 |

所有结构命令必须保留未触及 marker style、缩进、空行和 EOL，不得借 parser serializer 重新生成容器。

## 8. Paste/drop

管线：

```text
freeze identity + selection + MIME payload
  -> context classify
  -> sanitize/convert/resource prepare
  -> validate identity/revision compatibility
  -> one CM transaction or explicit resource transaction
  -> one History boundary
  -> Core patch/ack
```

优先级：文件/图片（若产品允许）→ HTML → plain text。code/fence/raw context 总是 literal text。HTML conversion 结果是用户明确粘贴产生的新 bytes，可以规范化新插入范围，但不能改 selection 外内容。异步图片完成后必须重新校验 binding generation 与 document identity。

## 9. History

只有 CodeMirror History：

- 连续普通输入使用 CodeMirror 默认合理合并；
- 一个 IME composition 是一个用户意图；
- paste/drop、Enter、结构命令、toolbar 命令、widget commit、bulk replace 显式 boundary；
- Source/Live Preview 切换、projection refresh、Core ack 不进入 History；
- Undo/Redo 产生普通 doc transaction，并经相同 patch pipeline 确认；
- blocked pipeline 时可本地 Undo，但保存必须等待重新收敛。

## 10. 参考实现取舍

吸收 Muya 的 block-context command、token source range、selection path/offset 思想；吸收 Vditor 的活动 marker 展开、paste 分类和浏览器边界用例。拒绝两者的 contenteditable DOM 正文、innerHTML History、DOM text length selection 和模式切换 Markdown round-trip。
