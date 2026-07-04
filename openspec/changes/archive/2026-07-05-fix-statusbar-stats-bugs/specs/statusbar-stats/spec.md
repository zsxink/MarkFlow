## ADDED Requirements

### Requirement: 状态栏实时统计正确

#### Scenario: WYSIWYG 模式下列数显示正确
- **WHEN** 用户在 WYSIWYG 模式编辑，光标位于第一行
- **THEN** 状态栏显示 "行 1, 列 N"（N 为光标在段落内的字符偏移，从 0 开始）

#### Scenario: WYSIWYG 模式下行数显示正确
- **WHEN** 用户输入了 3 个段落
- **THEN** 状态栏显示 "3 行"

#### Scenario: 源码模式下状态栏动态更新
- **WHEN** 用户在源码模式编辑
- **THEN** 状态栏随输入实时更新字数、行数、光标位置
