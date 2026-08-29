## ADDED Requirements

### Requirement: 富块只是 Markdown source 的交互投影

Task checkbox、code fence controls、FrontMatter、image、GFM table、Mermaid 和 PlantUML SHALL 以 CodeMirror decoration/widget 投影同一 Markdown source。Widget DOM MUST NOT 成为正文、保存、History、outline 或 export 的权威来源；所有 commit SHALL 返回局部 CodeMirror transaction，并通过 active binding、document identity、revision 和 source range 校验。

#### Scenario: Widget 提交时文档已切换
- **WHEN** 异步 widget 在用户切换文档或 revision 不兼容后返回结果
- **THEN** 结果不得应用到当前文档
- **THEN** 旧 widget 被取消或销毁，磁盘和 Core snapshot 不变

### Requirement: Task checkbox 可直接切换且保留 marker 形式

已支持 task item SHALL 显示可键盘操作的 checkbox。点击或按 Space SHALL 只切换对应 source marker 的完成状态，并保留未触及的列表 marker、缩进、空格和大小写；read-only 状态不得提交修改。

#### Scenario: 点击未完成任务
- **WHEN** 用户点击 `- [ ] item` 的 checkbox
- **THEN** 系统以一次 transaction 只替换 checkbox source range
- **THEN** 一次 Undo 恢复原 marker 和 selection

### Requirement: 图片在文档流内渲染并可回到源码编辑

受支持的 Markdown image SHALL 在文档流内显示图片、alt 语义和加载状态。点击选择图片，显式编辑动作 SHALL reveal 或打开与该 source range 绑定的 alt/path/title 编辑界面；替换、删除、粘贴和拖放 MUST 复用资源事务并产生局部 source patch。

#### Scenario: 编辑图片 alt
- **WHEN** 用户编辑 `![old](path "title")` 的 alt 并确认
- **THEN** transaction 只覆盖 alt 对应 source range
- **THEN** path、title、相邻空行和未触及 bytes 保持不变

#### Scenario: 图片加载失败
- **WHEN** 本地资源缺失、URL 不允许、解码失败或图片超过限制
- **THEN** widget 显示可读错误并提供 Retry、编辑路径和 reveal source
- **THEN** 失败不得删除引用、自动改写路径或阻止保存

#### Scenario: 异步图片资源失败
- **WHEN** 粘贴/拖放的资源准备失败或补偿失败
- **THEN** 文档不得引用未落地资源
- **THEN** 已准备但未引用的资源进入可追踪清理流程，不得静默污染当前文档

### Requirement: GFM 表格提供可预测的 cell 编辑协议

受支持的 GFM table SHALL 以可编辑表格显示。系统 MUST 定义 mouse、Arrow、Tab/Shift-Tab、Enter、Escape、Home/End、row/column add/delete/move 和 alignment 行为。Cell 内支持的 inline Markdown SHALL 使用同一 marker reveal 规则；复杂或不能安全映射的表格 SHALL 精确回退源码。

#### Scenario: 在 cell 中编辑文本
- **WHEN** 用户在一个普通 cell 中插入文本
- **THEN** 系统只修改该 cell 的 content source range
- **THEN** delimiter row、alignment、其他 cell padding 与未触及 bytes 保持不变
- **THEN** 一次 Undo 撤销该次 cell 编辑

#### Scenario: 新增一列
- **WHEN** 用户通过表格 UI 新增一列
- **THEN** 系统在提交前展示或记录完整 affected source ranges
- **THEN** 允许变化的范围仅包括每行插入点、必要 delimiter/alignment bytes 和新增 cell bytes
- **THEN** 所有 surviving source spans 通过 L1 golden 验证

#### Scenario: 不安全的表格语法
- **WHEN** table 含无法可靠映射的 escaped pipe、多行 cell、嵌套 HTML 或 malformed delimiter
- **THEN** 整个最小 table range 回退源码
- **THEN** 系统不得以部分 widget 隐藏无法编辑的内容

### Requirement: Fenced code 与图表具有源码/渲染双态

普通 fenced code SHALL 显示代码块、语言和语法高亮，并可通过 focus/reveal 编辑完整 fence source。受支持的 Mermaid/PlantUML fence MAY 显示图表预览，但必须始终提供 Edit Source、Retry 和 fallback；源码是唯一正文。

#### Scenario: 编辑 Mermaid 源码
- **WHEN** 用户从 Mermaid preview 进入 Edit Source、修改图表并提交
- **THEN** 修改作为一次局部 source transaction 进入 History 和 Core patch
- **THEN** 新渲染请求绑定新 revision，旧请求结果被丢弃

#### Scenario: 图表渲染离线或超时
- **WHEN** renderer 不可用、离线、取消或超时
- **THEN** 该 fence 显示源码和非重复错误状态
- **THEN** 输入、保存、copy 和 export source 不受影响

### Requirement: 图表渲染遵守安全与网络策略

Mermaid SHALL 在禁止任意脚本和外部副作用的隔离环境中渲染。PlantUML SHALL 明确使用本地或用户配置的远程通道；远程通道必须提示正文将发送到第三方，并执行 protocol、redirect、DNS/IP、size、timeout、CSP/SSRF 和 SVG sanitize 策略。无安全通道时 SHALL 保持源码。

#### Scenario: 恶意 Mermaid 或 SVG payload
- **WHEN** 图表源码或返回 SVG 含 script、event handler、foreignObject、外部 URL 或超限 payload
- **THEN** renderer 拒绝或移除不安全内容并回退源码
- **THEN** 不发起未授权网络请求，不执行脚本

#### Scenario: 未配置 PlantUML 服务
- **WHEN** 用户未配置本地或远程 PlantUML renderer
- **THEN** PlantUML fence 保持可编辑源码并解释未渲染原因
- **THEN** 不自动选择公共服务或发送正文

### Requirement: FrontMatter 与 raw HTML 使用显式安全策略

FrontMatter SHALL 至少提供边界清晰的 source projection；只有经 safe-subset 验收的字段 MAY 使用结构化 widget。Raw HTML 默认 SHALL 显示源码或经过严格 sanitize 的只读 preview，且 MUST 提供 reveal source；不得在编辑 surface 执行脚本、加载未授权资源或把 preview DOM 序列化回 Markdown。

#### Scenario: 复杂 FrontMatter
- **WHEN** YAML/TOML 含 anchors、aliases、自定义 tag 或解析错误
- **THEN** 完整 FrontMatter range 回退源码
- **THEN** 保存保持原 bytes

#### Scenario: Raw HTML 含脚本
- **WHEN** 文档含 script、event handler 或危险 iframe
- **THEN** 默认显示源码或安全错误占位
- **THEN** 内容不执行且仍可编辑保存

### Requirement: 每个富块独立门禁、回滚和支持声明

每个 rich block SHALL 有独立 feature flag、owner registration、支持矩阵状态、自动化证据、独立 Reviewer、人工验收和回滚。关闭单项能力 SHALL 回退为同一 source range 的基础投影或完整源码，不得影响其他 block、History、dirty、Core revision 或保存。

#### Scenario: 关闭 table widget
- **WHEN** table widget feature flag 被关闭
- **THEN** GFM table 精确显示 Markdown source
- **THEN** image、task 和 diagram 的状态不变
- **THEN** 切换 flag 不产生正文 transaction
