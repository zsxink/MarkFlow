## ADDED Requirements

### Requirement: 默认编辑面提供 Typora 式即时渲染

对已支持的 Markdown construct，默认编辑面 SHALL 在非活动状态显示渲染后的语义内容，并隐藏仅用于表达语法的 Markdown marker。用户 MUST 能在同一文档会话中切换到 Source 查看完整源码；Source 与所见所得模式 MUST 共享同一 CodeMirror document、selection、History、composition 和 Core patch pipeline。

这里的“Typora 式”定义为编辑体验对齐，而不是复制 Typora 的内部实现或全部扩展语法：支持矩阵内的 construct 必须原地渲染、原地编辑；矩阵外或不安全的 construct 可以精确回退源码，但不得伪装成已完成的所见所得。

#### Scenario: 打开普通 Markdown 文档
- **WHEN** 默认配置打开包含 heading、strong、emphasis、link、quote 和 list 的文档
- **THEN** 非活动 construct 只显示其渲染语义，不显示对应 Markdown marker
- **THEN** 用户不需要切到独立预览窗格即可阅读和编辑
- **THEN** 底层 CodeMirror document 仍逐字符包含完整 Markdown source

#### Scenario: 切换 Source
- **WHEN** 用户从所见所得模式切换到 Source
- **THEN** 同一 EditorView 立即显示完整 Markdown source
- **THEN** 不发生全文同步、serializer、selection 重置、History entry 或 dirty 变化

### Requirement: Marker 可见性使用统一派生状态

系统 SHALL 以 `visible`、`dimmed`、`hidden`、`revealed` 四种视觉状态描述 marker；状态 MUST 由当前 construct 支持级别、selection、composition、command 和 fallback 条件派生，不得作为第二份正文状态持久化。`composition` 是强制 reveal/冻结隐藏投影的条件，不是第五种正文状态。

- `visible`：Source、fallback、空 construct 占位或尚未验收的 construct；
- `dimmed`：支持语义样式但尚未通过隐藏门禁；
- `hidden`：已验收 construct 的非活动 marker；
- `revealed`：caret、selection、composition 或编辑命令需要源码时完整显示该 construct 的 marker。

#### Scenario: 光标进入隐藏的粗体
- **WHEN** caret 从普通文本进入已隐藏 marker 的 strong content 或边界
- **THEN** 该 strong construct 的全部配对 marker 在同一交互帧内进入 `revealed`
- **THEN** caret 保持在确定的 source position
- **THEN** 不相邻 construct 保持原状态

#### Scenario: 未验收 construct
- **WHEN** construct 尚未通过隐藏门禁
- **THEN** marker 保持 `visible` 或 `dimmed`
- **THEN** 用户仍可直接编辑、复制和保存完整源码

### Requirement: 隐藏 marker 不改变正文且具有确定的原子边界

隐藏 SHALL 使用 CodeMirror replacing decorations 表达，并以对应 source range 提供 atomic cursor boundary；必要的视觉占位 SHALL 由只读 widget 提供。Atomic descriptor MUST 区分 `hidden-marker` 与 `atomic-construct/widget`：前者只控制导航，边界删除必须先 reveal 并执行 marker-aware content 语义，绝不能默认删除 delimiter；后者只有显式声明 `deletePolicy=whole` 才能整段删除。Replacing decoration、atomic range 和 widget MUST NOT 自行删除或改写 `EditorState.doc`。复制、剪切、拖拽、辅助技术文本和保存内容 MUST 从 CodeMirror source range/明确的 accessibility descriptor 生成，不得依赖 rendered DOM `textContent` 恰好包含 marker。

#### Scenario: 键盘跨越隐藏 marker
- **WHEN** 用户使用 Arrow、Home、End、Backspace 或 Delete 跨越隐藏 marker
- **THEN** caret 只能落在该 atomic range 的明确前后边界，或先 reveal 再进入源码
- **THEN** 一次删除的 affected source range 可预测且可一次 Undo

#### Scenario: 粗体 closing marker 后按 Backspace
- **WHEN** `**text**` 的 closing marker 处于 hidden，caret 位于其 source range 后边界并按 Backspace
- **THEN** owning strong construct 先 reveal
- **THEN** 同一用户意图只删除 contentRange 末尾的一个 grapheme，paired `**` markers 保持完整
- **THEN** content 已空时只 reveal 且不删除 delimiter

#### Scenario: 图片 widget 边界删除
- **WHEN** caret 紧邻 image widget 且 descriptor 明确声明 `deletePolicy=whole`
- **THEN** Backspace/Delete 可以一次删除完整 image Markdown source range
- **THEN** 未声明 `deletePolicy=whole` 时只 reveal source，不删除任何隐藏 range

#### Scenario: 复制隐藏内容
- **WHEN** selection 包含一个或多个隐藏 marker 且用户复制为 `text/plain`
- **THEN** clipboard plain-text payload 包含对应的完整 Markdown source
- **THEN** 可选的 `text/html` payload MAY 使用渲染语义，但不得替代或污染 source payload

### Requirement: Selection、IME 与输入规则在显隐切换中稳定

Marker 显隐、viewport 重建和 fallback MUST 保持 CodeMirror UTF-16 selection、direction 和 affinity。Composition start/update/end 期间，与 composition range 相交或相邻的 marker SHALL 保持 revealed，或冻结到不会移动 DOM 几何的安全投影；系统 MUST 在真实 Tauri WebView 上验证中文和日文输入法。

#### Scenario: 在隐藏 marker 邻域开始中文输入
- **WHEN** 用户在隐藏 marker 前后开始一次 CJK composition
- **THEN** 冲突 marker 在 composition 提交前保持可见或投影冻结
- **THEN** composition 不被取消、不丢字、不重复、不重排
- **THEN** 一次 Undo 撤销完整 composition 意图

#### Scenario: 输入规则形成 construct
- **WHEN** 用户键入完整的 inline marker 对，或在 block marker 后按 Enter 形成结构
- **THEN** construct 先以可发现的 source/`revealed` 状态完成输入
- **THEN** 只有 caret 离开且 parse/range 稳定后才转为 `hidden`

#### Scenario: 全选
- **WHEN** 用户执行 Select All
- **THEN** 全文 selection 不得触发逐构造闪烁、布局跳动或整篇强制展开
- **THEN** copy/cut 仍以完整 source ranges 工作

### Requirement: 空构造与 malformed 构造始终可发现

空 heading、空 list item、空 task item、空 quote、空 fence 和只有 marker 的 inline construct MUST 保留可见的 marker、glyph 或可访问 placeholder，使用户能够定位、退出、删除或继续输入。Malformed、unknown、unsafe 或 range 不可信的 construct SHALL 精确显示源码。

#### Scenario: 空列表项失焦
- **WHEN** 文档包含空 list item 且 caret 离开该行
- **THEN** 列表 glyph 或 marker 仍可见，不得把该项渲染成不可发现的空白行
- **THEN** 返回该项后 Enter、Backspace、Indent 和 Outdent 行为可预测

#### Scenario: 损坏的链接
- **WHEN** link destination 未闭合或 source range 不可信
- **THEN** 该链接显示完整源码并可编辑
- **THEN** 相邻已支持 construct 继续保持所见所得投影

### Requirement: 结构化编辑保持单一 source transaction 语义

Heading、paragraph、quote、ordered/unordered/task list、fence、link 和 inline mark 的 Enter、Backspace/Delete、Tab/Shift-Tab、toolbar、shortcut 和 input rule SHALL 产生局部 CodeMirror transaction。每个用户意图 MUST 具有明确 affected source range、selectionAfter 和单一 Undo boundary；系统不得从 rendered DOM 反推 Markdown。

Heading/list/quote/table 的唯一键盘结果 SHALL 遵守 `adr/adr-typora-structural-interaction-matrix.md`：heading 内容中部 Enter 产生 heading prefix + paragraph suffix，空 heading 转 paragraph；空嵌套 list Enter/Backspace 只 outdent 一级，空顶层 list 退出为 paragraph；quote 退级每次只删除一层 marker。任何不可信上下文必须 reveal source 或 NoOp，不得在多个合法结果中临时选择。

#### Scenario: 活动 heading 按 Enter
- **WHEN** caret 位于 heading 内容中或行尾并按 Enter
- **THEN** 内容中部时 prefix 保持 heading、suffix 成为下一行 paragraph；行尾时创建下一行空 paragraph
- **THEN** 只修改该 heading 的必要 source range
- **THEN** 新 caret 所在 construct 以 `revealed` 或可见 placeholder 呈现

#### Scenario: 嵌套列表退级
- **WHEN** 用户在空嵌套 list item 中按 Enter 或 Backspace
- **THEN** 系统执行一次可 Undo 的单级 outdent transaction；只有顶层空 item 才退出为 paragraph
- **THEN** 未触及 sibling marker 样式、缩进、空行和 EOL bytes 保持不变

### Requirement: Typora 体验按支持矩阵声明完成

系统 SHALL 维护正交的 construct 支持矩阵，分别记录 release class（`WYSIWYG-required`/`policy-required`/`conditional`/`out-of-scope`）、projection maturity（`source-fallback`/`dimmed-preview`/`hidden-preview`/`interactive-widget`）、default state、配置条件、Normal/Large/Huge 降级和证据。`default-on` 不得与 maturity 混为同一状态。Program 完成声明 MUST 要求 `WYSIWYG-required` 的 heading、paragraph、strong、emphasis、strike、inline code、links、quote、ordered/unordered/task list、fence、thematic break、image 和 GFM table 达到目标 maturity，并在 Normal/Large 的默认配置达到规定 ON 状态；`policy-required` 的 FrontMatter/raw HTML 达到声明的安全终态时 MAY 以 source fallback 完成；Mermaid/PlantUML 仅在产品设置启用且安全 renderer/通道可用时进入 interactive widget，否则显示可解释的 source fallback。

#### Scenario: 发布候选仍有必达项为源码
- **WHEN** 发布支持矩阵中的 `WYSIWYG-required` construct 仍低于其声明的 hidden/widget maturity
- **THEN** Program 不得宣称达到 Typora 式所见所得终态
- **THEN** 可将该构建标记为中间 Live Preview 里程碑

#### Scenario: 安全策略项以源码为目标终态
- **WHEN** complex FrontMatter 或 raw HTML 被列为 `policy-required`，其签署目标是安全 `source-fallback`
- **THEN** 该状态满足对应策略合同，不因显示源码阻止 P7/P5
- **THEN** 产品不得把该项宣传为所见所得富编辑

#### Scenario: 必达 widget 实现但默认关闭
- **WHEN** image 或 GFM table 已达到 `interactive-widget` maturity，但 Normal/Large 的 release 默认 flag 仍为 OFF
- **THEN** P7 与 Program 不得 Go
- **THEN** 支持矩阵不得用 maturity 掩盖默认用户仍看到源码的事实

#### Scenario: Huge 文档降级
- **WHEN** 文档进入 Huge 等级且重型投影超过冻结预算
- **THEN** 系统可以默认进入 Source 或关闭重型 widget，并明确显示原因
- **THEN** 该降级不违反 Normal/Large 文档的 Typora 体验完成声明，也不改变 byte fidelity
