## ADDED Requirements

### Requirement: 单一 CodeMirror 编辑 surface

每个活动 lossless document session SHALL 只创建一个 CodeMirror `EditorView`。Source 与 Live Preview MUST 共享同一 document、selection、viewport、composition、pending patch pipeline 和 History，并通过 extension compartment 重配置模式。

#### Scenario: Source 与 Live Preview 往返切换
- **WHEN** 用户在同一文档中切换 Source/Live Preview 100 次
- **THEN** `EditorView` 实例未被销毁或重建
- **THEN** 文档 bytes、selection、scroll anchor、focus、dirty、revision 和 Undo/Redo 顺序保持一致

#### Scenario: pending patch 时切换模式
- **WHEN** 用户输入后在 patch pending 状态立即切换模式
- **THEN** 同一 optimistic text 继续显示
- **THEN** patch 只提交一次并在 ack 后收敛

### Requirement: Live Preview 不改变底层 Markdown

Live Preview SHALL 只使用 CodeMirror decorations、widgets 和事件处理器投影 Markdown。投影的创建、更新、移除、失败或模式切换 MUST NOT 修改 `EditorState.doc`。

#### Scenario: 渲染粗体与标题
- **WHEN** 文档包含 `# 标题` 与 `**粗体**`
- **THEN** Live Preview 显示标题层级和粗体样式
- **THEN** CodeMirror document 仍逐字符包含 `# 标题` 与 `**粗体**`

#### Scenario: 关闭 Live Preview
- **WHEN** 用户关闭 Live Preview 或投影 feature flag
- **THEN** 编辑器立即显示同一 CodeMirror document 的完整源码
- **THEN** 不发生全文同步、serializer 或 dirty 变化

### Requirement: 基础投影不依赖 Rust Render IR 可用性

首批基础 Markdown construct SHALL 使用 CodeMirror 本地语法树提供即时投影。Core Render IR MAY 增强复杂语义，但其失败 MUST NOT 阻止基本 Markdown 显示、输入或保存。

#### Scenario: Render IR 服务不可用
- **WHEN** Core Render IR 请求超时或返回错误
- **THEN** 已支持的 heading、strong、emphasis、inline code、link、quote、list 和 fence 继续由本地投影显示
- **THEN** 复杂或未知 construct 精确回退源码
- **THEN** 文档保持可编辑可保存

#### Scenario: 输入立即更新基础投影
- **WHEN** 用户输入 `**文本**`
- **THEN** 本地投影在 CodeMirror transaction 后立即更新
- **THEN** 无需等待 IPC ack 才能显示粗体语义

### Requirement: Projection owner 唯一且 revision-bound

每种 construct 在任一 revision 只能由 `local`、`core` 或 `source-fallback` 中一个 owner 投影。Core Render IR SHALL 携带 binding generation、session、document、revision、request、viewport 和 source identity；不匹配的结果 MUST 被丢弃。

#### Scenario: stale IR 返回
- **WHEN** revision N 的 IR 在文档已更新到 revision N+1 后返回
- **THEN** 系统不应用该 IR
- **THEN** 旧 decorations/widgets 被清理或安全映射

#### Scenario: 文档切换时旧结果返回
- **WHEN** 用户从文档 A 切换到文档 B
- **AND** 文档 A 的异步 render 结果随后返回
- **THEN** 结果不得应用到文档 B

#### Scenario: Core owner 接管 construct
- **WHEN** 某 construct 的 confirmed Core IR 通过 identity 校验
- **THEN** 系统先移除该范围的 local owner decorations
- **THEN** 同一范围不得同时叠加 local 与 core 投影

### Requirement: Marker reveal 按 cohort 安全启用

系统 SHALL 先弱化 Markdown markers，只有某 construct 通过 selection、clipboard、IME 和 accessibility 门禁后才能默认隐藏。光标、选区或 composition 进入 construct 时 SHALL 揭示完成编辑所需的最小 marker 范围。

#### Scenario: 未验收 construct
- **WHEN** 某 construct 尚未通过隐藏 marker 门禁
- **THEN** marker 保持可见或仅弱化
- **THEN** 该 construct 仍可直接编辑和保存

#### Scenario: 光标进入粗体
- **WHEN** 已验收 strong projection 中的光标进入内容或 marker range
- **THEN** 对应 `**` markers 完整显示
- **THEN** 其他不相邻 construct 的 markers 保持原投影状态

#### Scenario: IME composition 邻域
- **WHEN** composition 与隐藏 marker 范围相交或相邻
- **THEN** 冲突 marker 被揭示或投影延迟
- **THEN** composition 文本不得丢失、重复或重排

### Requirement: Selection 仅以 source position 映射

Live Preview SHALL 以 CodeMirror UTF-16 position、direction 和 affinity 表达交互 selection，并由 `ChangeDesc` 映射到 transaction 后的位置。跨 Core bridge 时 MUST 使用显式 PositionMap 转换 UTF-16、UTF-8 logical byte 和 source byte 坐标。Rendered DOM node、block object、`wbr`、ZWSP 或 sentinel MUST NOT 成为正常 selection、History 或持久化状态。

#### Scenario: Marker 投影重建
- **WHEN** 光标所在 inline token 的 decorations 因 reveal 状态改变而重建
- **THEN** selection 通过同一 CodeMirror source positions 保持
- **THEN** 不从 rendered DOM 的 `textContent` 长度反推光标

#### Scenario: Transaction 改变 selection 前方文本
- **WHEN** 一个局部 transaction 在 anchor 前插入或删除文本
- **THEN** anchor/focus/direction/affinity 由 transaction position map 确定性映射
- **THEN** Core ack 或 projection refresh 不再二次移动 selection

#### Scenario: Atomic widget 边界
- **WHEN** 用户用 Arrow、Backspace、Delete 或鼠标跨越 atomic widget source range
- **THEN** widget 使用显式 source range 和 affinity 决定进入、揭示、选择或删除
- **THEN** 不依赖浏览器对 `contenteditable=false` DOM 的隐式光标行为

### Requirement: 结构键产生确定的 source transaction

Enter 与 Backspace/Delete SHALL 由统一 command router 按 selection、syntax context、block boundary 和 construct owner 决策，并只产生局部 CodeMirror transaction。系统 MUST 为普通文本、heading、list、quote、fence、table、atomic inline 和跨块 selection 定义可测试行为；无法安全识别上下文时 SHALL 揭示源码或执行 CodeMirror 原生文本语义，不得通过 DOM 修复或全文 serializer 猜测。

#### Scenario: 空列表项按 Enter
- **WHEN** 光标位于空 list item 且用户按 Enter
- **THEN** command matrix 根据嵌套层级执行退出、降级或拆分列表的局部 source changes
- **THEN** 未触及列表 marker、相邻空行和列表外 bytes 保持不变

#### Scenario: 非空段落中按 Enter
- **WHEN** 光标位于普通段落中间且用户按 Enter
- **THEN** 只在 selection 对应 source range 插入新换行并映射 selection
- **THEN** operation 形成一个明确且可 Undo 的 History group

#### Scenario: 不支持结构的边界 Backspace
- **WHEN** parser 无法可靠判断 malformed construct 边界且用户按 Backspace
- **THEN** 该范围先显示精确源码并执行普通文本删除语义
- **THEN** 系统不重建全文或规范化相邻内容

### Requirement: Paste 按 MIME 与上下文原子提交

系统 SHALL 在任何异步转换或文件操作前冻结 clipboard payload、selection 和 document identity。Paste/drop SHALL 区分 literal context、plain Markdown/text、sanitized HTML、file/image，并最终通过 active CodeMirror binding 提交一次用户意图对应的局部 transaction 或显式资源事务。Rendered DOM 与浏览器 `execCommand` MUST NOT 写入正文。

#### Scenario: Code fence 中粘贴 HTML
- **WHEN** 用户在 code fence literal content 内粘贴含 HTML MIME 的内容
- **THEN** 系统按 literal text 插入而不执行 HTML→Markdown 语义转换
- **THEN** 该 paste 可用一次 Undo 撤销

#### Scenario: 普通段落粘贴安全 HTML
- **WHEN** 用户在普通段落粘贴受支持的安全 HTML
- **THEN** 系统 sanitize 并生成可预览的局部 Markdown change
- **THEN** 转换结果作为显式用户输入进入 History 和 Core patch
- **THEN** selection 外的原始 bytes 不发生变化

#### Scenario: 异步图片粘贴期间切换文档
- **WHEN** 图片资源准备期间 active binding 已切换到另一文档或 revision 不再兼容
- **THEN** 旧结果不得插入当前文档
- **THEN** 资源事务取消或进入可恢复状态，且不留下隐式 Markdown normalize

### Requirement: Source History 在模式间唯一

Source 与 Live Preview SHALL 共享 CodeMirror History。普通输入、composition、paste、Enter、结构命令、widget commit 和 bulk replace MUST 具有明确、可测试的 grouping 规则。Undo/Redo SHALL 产生普通 source transactions 并通过同一 revision-bound patch pipeline 同步 Core；系统 MUST NOT 维护 DOM-string History、每模式独立 History 或竞争的 Core UI History。

#### Scenario: Live Preview 粘贴后切 Source 并 Undo
- **WHEN** 用户在 Live Preview 粘贴一个结构片段、切换到 Source 后执行 Undo
- **THEN** 整次 paste 作为一个 History group 被撤销
- **THEN** 模式切换本身不新增 History entry

#### Scenario: 中文 composition 后 Undo
- **WHEN** 一次 IME composition 完成并已确认到 Core
- **THEN** 一次 Undo 撤销该 composition 的用户意图
- **THEN** Undo patch 被 Core 确认且 selection 恢复到确定位置

### Requirement: Unknown 与失败范围精确回退源码

不支持、解析失败、identity stale、unsafe 或 widget 失败的范围 SHALL 显示原始 Markdown 源码。回退 MUST 限定在失败范围，不得清空全文、阻止输入或把错误投影当作正文。

#### Scenario: malformed Markdown
- **WHEN** parser 遇到损坏的 fence、table 或 link
- **THEN** 损坏范围显示原始源码并可编辑
- **THEN** 文档其他已支持范围继续 Live Preview

#### Scenario: widget 加载失败
- **WHEN** 图片或图表 widget 超时、取消或返回不安全内容
- **THEN** 该范围回退源码并提供非重复错误状态与 Retry
- **THEN** 保存 payload 不变

### Requirement: 编辑命令统一产生 CodeMirror transaction

工具栏、菜单、快捷键、粘贴、input rule 和 widget 编辑 SHALL 通过 active CodeMirror binding 产生局部 transaction。命令 MUST NOT 修改隐藏 ProseMirror、rendered DOM 或独立第二文本模型。

#### Scenario: 工具栏加粗
- **WHEN** 用户在 Source 或 Live Preview 中选中文本并点击加粗
- **THEN** 同一 command router 在选区两侧插入或切换 Markdown markers
- **THEN** 生成一个可 Undo 的 CodeMirror transaction 并同步为 Core patch

#### Scenario: 图片 widget 更新 alt
- **WHEN** 用户在图片 widget 中修改 alt 文本并确认
- **THEN** widget 生成只覆盖对应 Markdown source range 的 transaction
- **THEN** 未触及图片路径、相邻空行和文档其他内容保持原字节

### Requirement: Live Preview 分级与独立回滚

系统 SHALL 为 Live Preview 总入口、Core IR 和 construct cohorts 提供受控 feature flags。关闭任一投影能力时，回滚目标 MUST 是同一 CodeMirror 文本的本地投影或 Source，不能恢复 serializer 保存。

#### Scenario: 关闭 Core IR
- **WHEN** `coreRenderIr` 被关闭
- **THEN** 基础本地投影继续工作
- **THEN** 高级 construct 回退精确源码
- **THEN** Core 文本、patch 和保存链路保持不变

#### Scenario: 关闭 Live Preview
- **WHEN** `codemirrorLivePreview` 被关闭
- **THEN** 用户进入 Source 显示
- **THEN** lossless Core session 继续作为保存真相

### Requirement: ProseMirror 仅在完成门禁后移除

系统 MUST 在 lossless CodeMirror 路径覆盖默认打开、保存、常用命令、图片、autosave、external conflict、export 和真实桌面验收后，才移除 ProseMirror/Tiptap 产品依赖。在迁移期，单个文档会话 MUST 选择唯一 owner，不能同时由 ProseMirror 与 lossless session 写入。

#### Scenario: lossless 路径尚未达标
- **WHEN** 必要功能或真实桌面门禁未完成
- **THEN** legacy ProseMirror flag 仍可供独立会话回退
- **THEN** lossless 会话内不得切换到 ProseMirror owner

#### Scenario: legacy 清理
- **WHEN** 默认 lossless path 已通过全部退出门禁和稳定观察
- **THEN** 系统删除 ProseMirror serializer、隐藏 DOM 和持久化 facade
- **THEN** 独立复核确认产品路径不再读取或写入 ProseMirror 文档真相
