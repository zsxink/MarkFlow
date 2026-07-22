## ADDED Requirements

### Requirement: 特殊块后自动创建续写段落

系统 SHALL 在 WYSIWYG 模式下，当图片插入、引用转换或代码块转换操作使该块成为文档末尾节点时，自动在该块后创建一个普通空段落作为续写入口。

#### Scenario: 文档末尾插入图片后创建续写段落
- **WHEN** 用户在文档末尾插入图片
- **THEN** 图片后自动存在一个普通空段落
- **THEN** 用户可在图片下方直接继续输入
- **THEN** 该空段落不出现在 Markdown 序列化输出中

#### Scenario: 文档末尾转换引用后创建续写段落
- **WHEN** 用户在文档末尾段落按引用按钮，该段落被转换为 blockquote
- **THEN** blockquote 后自动存在一个普通空段落
- **THEN** 光标仍位于 blockquote 内部，用户继续输入引用内容
- **WHEN** 用户按向下方向键或回车到 blockquote 末尾
- **THEN** 光标可进入续写段落，用户继续输入普通内容

#### Scenario: 文档末尾转换代码块后创建续写段落
- **WHEN** 用户在文档末尾段落按代码块按钮，该段落被转换为 codeBlock
- **THEN** codeBlock 后自动存在一个普通空段落
- **THEN** 光标仍位于 codeBlock 内部，用户继续输入代码
- **WHEN** 用户向下移动光标或通过其他方式离开 codeBlock
- **THEN** 光标可进入续写段落

#### Scenario: 特殊块后已有内容不额外插入
- **WHEN** 特殊块后已有其他内容节点（段落、列表、标题等）
- **THEN** 系统不得额外插入续写段落

#### Scenario: 连续多图片仅创建一个续写段落
- **WHEN** 用户一次性插入多张图片（如粘贴多张剪贴板图片）
- **THEN** 所有图片插入完成后，仅在最后一张图片后创建一个续写段落
- **THEN** 各图片之间不被续写段落分隔

### Requirement: WYSIWYG 空段落不污染 Markdown

WYSIWYG 编辑器中作为续写入口的末尾空段落 SHALL NOT 通过 `&nbsp;`、零宽字符或额外 HTML 等方式编码进 Markdown。空段落 SHALL 是编辑器编辑态的一部分，而非文档内容。

#### Scenario: 空段落不被序列化
- **WHEN** WYSIWYG 文档以空段落结尾
- **THEN** 调用 `getMarkdown()` 的输出末尾不含该空段落的任何标记
- **THEN** 切换到源码模式后，源码末尾不出现空段落对应的文本

#### Scenario: 空段落加载后消失
- **WHEN** 从 Markdown 加载文档到 WYSIWYG
- **THEN** 加载后的文档末尾不存在空段落（除非原始 Markdown 本身包含空内容）
