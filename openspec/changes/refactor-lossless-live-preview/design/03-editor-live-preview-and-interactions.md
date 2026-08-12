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
4. 只有经过 cohort 门禁后才用 replace decoration 隐藏 marker；
5. 复杂或未知结构显示源码。

Core Render IR 不得成为 P2 打开、输入和基础投影的硬依赖。

## 3. Projection owner

每个 source range 同一 revision 只能属于：

- `local`：CodeMirror/Lezer 基础投影；
- `core`：confirmed Render IR 高级投影；
- `source-fallback`：原样源码。

owner registry 以 construct type、source range、revision 和 request identity 标识。Core 接管前先清除相同范围 local decoration；stale IR 不能覆盖新 revision。

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

## 5. Marker reveal

marker 状态：`visible`、`dimmed`、`hidden`、`revealed`。Reveal 条件：

- caret 位于 marker 或 content range；
- selection 与 construct 相交；
- composition 与 marker 相交或相邻；
- mouse drag、keyboard selection 即将跨过 atomic range；
- construct command 即将编辑 source；
- widget focus/cancel 需要回到 source。

Reveal 必须只改变 decorations。隐藏 marker 之前，每个 cohort 单独通过鼠标、键盘、IME、copy、screen reader 和 high contrast 门禁。

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

| 上下文 | Enter | Backspace at start |
| --- | --- | --- |
| 普通段落 | 插入继承 EOL 的逻辑换行 | 与前一文本行按普通语义合并 |
| Heading | 拆分为 heading + paragraph，或行尾创建 paragraph | 行首先移除 heading marker/降级，具体规则由 ADR 固定 |
| 非空 list item | 创建同级 item 并继承原 marker style | 空内容边界按 nesting 退级或与前项合并 |
| 空 list item | 退出或降低一级列表 | 移除当前 marker 或退级 |
| Blockquote | 创建引用 continuation；空引用可退出 | 退级引用 marker 或与前块合并 |
| Fence body | 插入 literal newline | literal delete，不触发结构转换 |
| Table | 首期 reveal source 并按文本语义；widget 阶段使用 cell protocol | 同左 |
| Atomic inline/widget | 根据 affinity 移到前后或显式删除整个 source range | 不依赖浏览器 atomic DOM 行为 |
| 跨块 selection | 先在同一 transaction 删除 selection，再执行目标上下文行为 | 删除 selection，保留一个确定 caret |
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
