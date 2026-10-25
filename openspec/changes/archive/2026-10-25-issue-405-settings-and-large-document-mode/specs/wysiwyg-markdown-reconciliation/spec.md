# Spec Delta

## MODIFIED Requirements

### Requirement: WYSIWYG 资格门禁

系统 MUST 在加载 Markdown 到可编辑 WYSIWYG 前完成语义安全往返检查。检查发现无法安全往返的块时，系统 MUST 先尝试局部字面量保留并获得无损证明；无法证明无损时返回稳定原因并避免创建可能覆盖原文的可编辑会话。WYSIWYG 文档大小和最大行数阈值只影响自动打开模式，不得作为手动切换的拒绝条件。系统 MUST NOT 依据节点数、块级结构数量或其他复杂度预算拒绝 WYSIWYG 加载。

#### Scenario: 完全受支持的文档
- **WHEN** 文档只包含往返规范承诺支持的语法且解析成功
- **THEN** 资格结果为 `eligible`，文档可进入可编辑 WYSIWYG

#### Scenario: 可透传的不透明片段
- **WHEN** 文档包含 WYSIWYG 不原生理解但边界可确定且可原样恢复的片段
- **THEN** 资格结果为 `eligible-with-opaque` 并列出片段位置和类别

#### Scenario: 无法安全往返的文档
- **WHEN** 文档中的块无法通过往返语义校验
- **THEN** 系统先尝试局部字面量保留；不能证明无损时返回 `source-only` 和稳定原因
- **THEN** 系统不得创建可能覆盖原文的可编辑 WYSIWYG 会话

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
- **WHEN** 文档超过用户配置的 WYSIWYG 文件大小阈值，但 Markdown 内容通过完整安全资格检查
- **THEN** 大小超限只使文档默认以源码模式打开，不会单独返回 `source-only`
- **THEN** 用户主动切换后完整内容进入 WYSIWYG 渲染

#### Scenario: 超过自动模式阈值但安全可渲染
- **WHEN** 文档超过用户配置的 WYSIWYG 大小阈值，但 Markdown 内容通过完整安全资格检查
- **THEN** 资格结果仍为 `eligible` 或 `eligible-with-opaque`
- **THEN** 用户手动切换后，完整内容进入 WYSIWYG 渲染

#### Scenario: 节点数不作为 WYSIWYG 门禁
- **WHEN** 文档的节点数或块级结构数量较多，但内容能够通过正常的 Markdown 安全往返检查
- **THEN** 系统允许进入 WYSIWYG，不以结构数量作为拒绝原因

#### Scenario: 结构过于复杂的文档
- **WHEN** 文档包含大量块级结构，但内容能够通过正常的 Markdown 安全往返检查
- **THEN** 文档仍可进入 WYSIWYG，不计算或应用结构复杂度拒绝预算
