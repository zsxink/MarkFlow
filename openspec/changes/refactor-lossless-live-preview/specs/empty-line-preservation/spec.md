## REMOVED Requirements

### Requirement: 图片归一化不压缩无关空行

**Reason**: 保存时对图片附近执行“恰好一个空行”的全文归一化仍会修改用户未触及字节，与 lossless 合同冲突。图片块能否正确渲染应由投影/parser 处理，不能通过静默改写源文件解决。

**Migration**: `normalizeImageMarkdown()` 从打开、dirty、模式切换和保存主链移除。需要整理图片分隔时，改为用户明确调用、限定 source range、可 Undo 的局部编辑命令。

## ADDED Requirements

### Requirement: 保存不得隐式归一化空行

系统 MUST 在普通保存、自动保存、模式切换和 reload 中逐字节保留所有未被用户 patch 覆盖的空行，包括图片、代码块、列表、引用和未知语法附近的空行。

#### Scenario: 图片附近存在多个空行
- **WHEN** 原文件在独立图片前后包含用户已有的多个空行
- **AND** 用户只编辑文档其他段落
- **THEN** 保存结果保持图片附近空行数量与 EOL 原样

#### Scenario: 代码围栏内外空行
- **WHEN** 文件在代码围栏内部和外部包含连续空行
- **AND** 用户修改围栏外的普通文本
- **THEN** 所有未触及空行逐字节保持

#### Scenario: 未知语法附近空行
- **WHEN** parser 不识别某段 Markdown
- **THEN** 该段及相邻未触及空行仍能打开、编辑和保存

### Requirement: 空行整理必须是显式局部命令

任何为图片、列表或 block 分隔而新增/删除空行的行为 SHALL 由用户明确触发，并生成范围有限、可预览、可 Undo 的 CodeMirror transaction。

#### Scenario: 用户执行图片分隔整理
- **WHEN** 用户对选定图片执行“整理块间距”命令
- **THEN** 系统展示或明确限定将修改的 source range
- **THEN** 只对该 range 生成局部 patch
- **THEN** 文档其他空行不变

#### Scenario: 插入新图片
- **WHEN** 用户通过图片命令插入新引用
- **THEN** 命令可按当前上下文为新引用插入必要分隔
- **THEN** 不扫描或规范化已有图片和全文空行
