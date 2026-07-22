## ADDED Requirements

### Requirement: 代码块尾随换行往返保真

系统 MUST 确保围栏代码块在 WYSIWYG ↔ Source 模式切换时，节点内容末尾的换行符数量不变。

#### Scenario: 代码块尾随换行在往返中保留
- **WHEN** 用户在 WYSIWYG 模式中在代码块末尾按 Enter 新增一个空行
- **THEN** 切换到源码模式后，结束围栏前保留该空行
- **THEN** 切换回 WYSIWYG 模式后，代码块末尾仍有一个空行

#### Scenario: 多个尾随换行在往返中保留
- **WHEN** 代码块末尾有多个空行（如 2 个）
- **THEN** 经过 WYSIWYG → Source → WYSIWYG 往返后，空行数量不变

#### Scenario: 无尾随换行的代码块不受影响
- **WHEN** 代码块末尾没有空行
- **THEN** 经过 WYSIWYG → Source → WYSIWYG 往返后，代码块末尾仍没有空行
