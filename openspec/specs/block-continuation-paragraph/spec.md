# block-continuation-paragraph Specification

## Purpose
定义特殊块（图片、引用、代码块）后自动创建续写段落的统一规则，确保用户在任何特殊块位于文档末尾时可直接继续写作。

## Agent Context
- **源码入口：** `src/lib/editor.ts`、`src/lib/editor.init.ts`、`src/lib/editor.extensions.ts`
- **关联规范：** `empty-line-preservation`、`enter-content-integrity`、`source-toolbar-cm6`
- **不变量：** 续写段落是编辑器编辑态，不出现在 Markdown 序列化中；不改变已有内容的块；多图片时仅创建一个续写段落。
- **验证：** `npm test -- src/lib/editor.test.ts`；`npx openspec validate block-continuation-paragraph --strict`。

## Requirements

### Requirement: 图片插入后末尾续写段落

当用户通过工具栏或粘贴在 WYSIWYG 模式插入图片，且插入后图片位于文档末尾时，系统 SHALL 在图片后自动添加一个普通空段落。

#### Scenario: 单张图片末尾插入
- **WHEN** 用户在文档末尾插入一张图片
- **THEN** 图片后追加一个普通 `paragraph` 节点
- **THEN** 用户可在图片下方直接输入新内容

#### Scenario: 文档中间插入图片不影响后续内容
- **WHEN** 用户在文档中间位置插入图片（前后皆有内容）
- **THEN** 不额外添加续写段落
- **THEN** 图片后的后续内容保持原样

### Requirement: 引用后末尾续写段落

当用户通过工具栏将末尾段落转换为 blockquote，且转换后该 blockquote 位于文档末尾时，系统 SHALL 在 blockquote 后自动添加一个普通空段落。

#### Scenario: 段落变为引用后保留续写入口
- **WHEN** 用户在文档末尾段落点击引用按钮
- **THEN** 该段落变为 blockquote
- **THEN** blockquote 后追加一个普通空段落
- **THEN** 光标焦点仍位于 blockquote 内部，供用户继续输入引用内容

#### Scenario: 已存在引用后不重复创建
- **WHEN** 文档末尾已经是 blockquote，用户再次点击引用按钮
- **THEN** blockquote 被取消（切换回段落），不创建续写段落
- **THEN** 文档末尾变为普通段落，用户可直接继续输入

### Requirement: 代码块后末尾续写段落

当用户通过工具栏将末尾段落转换为代码块，且转换后该代码块位于文档末尾时，系统 SHALL 在代码块后自动添加一个普通空段落。

#### Scenario: 段落变为代码块后保留续写入口
- **WHEN** 用户在文档末尾段落点击代码块按钮
- **THEN** 该段落变为 codeBlock
- **THEN** codeBlock 后追加一个普通空段落
- **THEN** 光标焦点仍位于 codeBlock 内部

#### Scenario: 已存在代码块后不重复创建
- **WHEN** 文档末尾已经是 codeBlock，用户再次点击代码块按钮
- **THEN** codeBlock 被取消（切换回段落），不创建续写段落
- **THEN** 文档末尾变为普通段落

### Requirement: 分隔线已有行为保持一致

分隔线（`setHorizontalRule`）命令已有末尾续写段落行为，本规范不做修改。图片、引用、代码块的续写段落行为 SHALL 与分隔线的行为保持对称。

#### Scenario: 分隔线末尾行为不变
- **WHEN** 用户在文档末尾插入分隔线
- **THEN** 分隔线后存在一个普通空段落（现有行为）
- **THEN** 本变更不修改此行为

### Requirement: 续写段落不在 Markdown 序列化中出现

末尾续写段落（空 paragraph 节点）SHALL 被 Markdown 序列化器忽略，不出现在 `getMarkdown()` 输出中。

#### Scenario: 空段落不序列化为 Markdown
- **WHEN** 文档末尾存在续写段落（空 paragraph）
- **THEN** `getMarkdown()` 输出的末尾不包含该空段落的任何内容或标记
- **THEN** 切换到源码模式后，源码末尾不出现空段落

#### Scenario: 续写段落被填充后正常序列化
- **WHEN** 用户在续写段落中输入了内容
- **THEN** 该段落不再是空段落
- **THEN** 在 Markdown 序列化中正常输出为一个普通段落
