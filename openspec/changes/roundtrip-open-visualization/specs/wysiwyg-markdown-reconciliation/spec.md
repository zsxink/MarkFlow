# wysiwyg-markdown-reconciliation Specification (delta)

## MODIFIED Requirements

### Requirement: WYSIWYG 资格门禁
系统 MUST 在加载 Markdown 到可编辑 WYSIWYG 前完成资格检查，并返回 `eligible`、`eligible-with-opaque` 或 `source-only` 结果及稳定原因。只有能够证明受支持内容可安全往返、其余内容可安全透传或可局部字面量保留的文档才能进入可编辑 WYSIWYG。当检查发现无法安全往返的块时，系统 MUST 先尝试局部字面量保留并获得无损证明，而不是把整篇文档降级为 `source-only`。

#### Scenario: 完全受支持的文档
- **WHEN** 文档只包含往返规范承诺支持的语法且解析成功
- **THEN** 资格结果为 `eligible`
- **THEN** 文档可进入可编辑 WYSIWYG

#### Scenario: 可透传的不透明片段
- **WHEN** 文档包含 WYSIWYG 不原生理解但边界可确定且可原样恢复的片段
- **THEN** 资格结果为 `eligible-with-opaque`
- **THEN** 结果列出每个不透明片段的位置和类别

#### Scenario: 无法安全往返的文档
- **WHEN** 文档的某些块无法通过往返语义校验，但其余内容可与这些块明确分离
- **THEN** 系统 MUST 先尝试把这些块保留为可编辑的局部字面量块
- **THEN** 只有当本地化往返与占位恢复都被证明无损时，文档才以 `eligible-with-opaque` 进入可编辑 WYSIWYG
- **THEN** 无法获得该证明时，资格结果为 `source-only` 并包含稳定原因，且不得创建可能覆盖原文的可编辑 WYSIWYG 会话

#### Scenario: 代码字面量不参与不支持语法扫描
- **WHEN** 围栏代码块或行内代码包含类似 HTML、数学公式、脚注或引用链接的字面量
- **THEN** 资格检查不得把代码字面量识别为不支持的正文语法
- **THEN** 文档仍须经过正常的语义往返校验后才能进入 WYSIWYG

#### Scenario: 列数不一致的 GFM 表格
- **WHEN** GFM 表格的表头、分隔行或数据行列数不一致且转换器可能丢弃单元格
- **THEN** 系统 MUST 将该畸形表格整块保留为局部字面量块，并保持其字面内容不变
- **THEN** 文档其余部分仍可编辑，且本地化往返校验通过后方可进入 WYSIWYG
- **THEN** 若该表格无法被局部保留证明，则资格结果为 `source-only` 并包含稳定的畸形表格原因

#### Scenario: 超出大小上限的文档
- **WHEN** 文档超出可编辑 WYSIWYG 的大小上限
- **THEN** 资格结果为 `source-only` 并包含稳定原因
- **THEN** 系统不得对该文档启动局部字面量保留或创建可编辑 WYSIWYG 会话

### Requirement: 对账失败提供安全恢复路径
只有在无法证明安全候选时（例如对账冲突、本地化往返校验失败或占位完整性被破坏），系统 MUST 保留原始 Markdown，阻止不安全保存，并向用户说明失败阶段与可执行恢复操作。通过本地化往返证明的文档 MAY 保存其已验证候选，但该候选 MUST 只包含经证明无损的内容。用户 MUST 能切换到 Source 查看和编辑完整原文。

#### Scenario: 保存前对账冲突
- **WHEN** 用户触发保存且对账结果为 `conflict`
- **THEN** 磁盘文件不被不安全候选覆盖
- **THEN** 用户收到包含切换到 Source 操作的明确提示

#### Scenario: 局部保留会话的安全保存
- **WHEN** 会话通过局部字面量保留准入，且保存候选能重新解析为编辑器当前语义
- **THEN** 系统 MAY 写入该候选，其中局部保留块逐字节保持原文
- **THEN** 系统 MUST NOT 写入任何内部标记、占位 token 或会话元数据

#### Scenario: 局部保留证明失败
- **WHEN** 局部保留块无法与源文一一对应，或其候选无法重新解析为当前语义
- **THEN** 系统 MUST 阻止保存并保留原始 Markdown
- **THEN** Source 模式仍提供完整原文

#### Scenario: Source 恢复不包含内部表示
- **WHEN** 用户从失败或冲突状态进入 Source
- **THEN** Source 显示原始 Markdown 或已明确选择的可恢复候选
- **THEN** 内容不包含占位 token 或内部元数据

#### Scenario: 结构化诊断不泄露正文
- **WHEN** 系统记录资格、转换或对账失败
- **THEN** 日志包含文档会话标识、失败阶段、原因码、位置范围和长度等诊断字段
- **THEN** 默认日志不得记录完整文档正文或不透明片段内容

## ADDED Requirements

### Requirement: 无法安全往返的块局部字面量保留
系统 MUST 支持把无法安全往返的完整 Markdown 块保留为可编辑的局部字面量块，使文档其余受支持内容保持正常 WYSIWYG 编辑。字面量块 MUST 逐字节保留原文（含 CRLF 等作者字符），MUST 在编辑器中可见并可局部编辑，且 MUST NOT 把 HTML 等原文当作可执行内容渲染。字面量块 MUST NOT 消耗或吞并相邻的受支持内容，也不得与围栏代码中的同字面量混淆。

#### Scenario: 局部保留后其余内容可编辑
- **WHEN** 文档包含一个无法安全往返的块，且其前后的内容都受支持
- **THEN** 该块以局部字面量块呈现，原文逐字节不变
- **THEN** 其余标题、列表、表格与代码块仍作为各自的结构正常渲染和编辑

#### Scenario: 局部字面量块可局部编辑
- **WHEN** 用户编辑某个局部字面量块的文本
- **THEN** 只有该块的原文被更新，其余块内容不受影响
- **THEN** 该编辑后的内容仍须通过保存前的往返证明才可写入

#### Scenario: 局部保留不破坏作者字符
- **WHEN** 原文在局部保留块中使用 CRLF 行尾或引用式定义等标记
- **THEN** 序列化结果 MUST 逐字节保留这些作者字符
- **THEN** 行尾不得被归一化为 LF，Marked 词法分析省略的引用式定义也不得丢失

#### Scenario: 内部标记不落盘
- **WHEN** 系统为局部保留块生成用于隔离与证明的临时标记
- **THEN** 标记 MUST 在保存、导出与剪贴板内容中完全消失
- **THEN** 若标记无法被证明完整还原，系统 MUST 阻止写入该候选
