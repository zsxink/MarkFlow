# Spec Delta

## MODIFIED Requirements

### Requirement: WYSIWYG 资格门禁

系统 MUST 在加载 Markdown 到可编辑 WYSIWYG 前完成资格检查，并返回 `eligible`、`eligible-with-opaque` 或 `source-only` 结果及稳定原因。只有能够证明受支持内容可安全往返、其余内容可安全透传或可局部字面量保留的文档才能进入可编辑 WYSIWYG。当检查发现无法安全往返的块时，系统 MUST 先尝试局部字面量保留并获得无损证明，而不是把整篇文档降级为 `source-only`。

除大小上限外，资格检查 MUST 以单遍结构扫描统计文档的块级结构数量，超过内部结构复杂度预算（非用户配置的固定预算，其值以预算内最坏准入耗时保持在秒级内为准）的文档直接判为 `source-only` 并附「结构过于复杂」稳定原因；此类文档 MUST NOT 进入解析/往返证明流程。

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

#### Scenario: 结构过于复杂的文档

- **WHEN** 文档的块级结构数量超过内部结构复杂度预算（无论体积是否超限）
- **THEN** 资格结果为 `source-only`，原因为「结构过于复杂」
- **THEN** 系统不启动解析、往返证明或局部字面量保留，文档留在源码模式
- **THEN** 提示文案引用实际生效的预算数值
