## ADDED Requirements

### Requirement: WYSIWYG → Source 切换保留代码块尾随换行

系统 MUST 确保从 WYSIWYG 切换到源码模式时，围栏代码块末尾的尾随换行在 CM6 文档中保留。

#### Scenario: 代码块尾随换行在切换时保留
- **WHEN** WYSIWYG 模式中代码块末尾有一个尾随换行
- **WHEN** 用户切换到源码模式
- **THEN** CM6 文档中结束围栏前保留该尾随换行

#### Scenario: 多个尾随换行在切换时保留
- **WHEN** WYSIWYG 模式中代码块末尾有多个尾随换行
- **WHEN** 用户切换到源码模式
- **THEN** CM6 文档中结束围栏前保留所有尾随换行
