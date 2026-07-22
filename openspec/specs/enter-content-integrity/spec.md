# enter-content-integrity Specification

## Purpose
确保 WYSIWYG 模式按 Enter 后生成有效 Markdown，并在模式切换中保持内容完整性。

## Agent Context
- **源码入口：** `src/lib/editor.ts`、`src/lib/editor.source.ts` 与 `src/lib/editor.serializer.ts`。
- **关联规范：** `codemirror-source-editor`、`active-document-state`、`atomic-save`。
- **不变量：** Enter 前后的文本与嵌套结构必须可往返序列化；模式切换不得丢失内容；完整性检查失败不得静默覆盖用户内容。
- **验证：** `npm test -- src/lib/editor.test.ts src/lib/markdown.test.ts`；`npx openspec validate enter-content-integrity --strict`。
## Requirements
### Requirement: WYSIWYG Enter 产生有效的 Markdown

系统 MUST 确保在所见即所得模式下按 Enter 始终会产生 ProseMirror 文档状态，该状态可序列化为完整、有效的 Markdown，且不会丢失内容。

#### Scenario: 段落分割保留周围内容
- **WHEN** 用户以所见即所得模式在段落中间按 Enter
- **THEN** 分割点前后的所有内容均应保留在Markdown序列化中
- **THEN** 序列化的 Markdown 应包含与原始文档完全相同数量的非空白字符（不包括添加的换行符）

#### Scenario: 列表项拆分保留列表延续
- **WHEN** 用户在所见即所得模式的列表项中间按 Enter
- **THEN** 序列化为 Markdown 时应保留分割点后的剩余列表项
- **THEN** 序列化 Markdown 中的列表项总数应等于预输入计数 + 1（新项）

#### Scenario: Blockquote Enter 保留引用内容
- **WHEN** 用户在所见即所得模式下在块引用内按 Enter
- **THEN** 所有引用内容均应无损连载至Markdown
- **THEN** 块引用结构在往返后仍然有效（Markdown → ProseMirror → Markdown）

#### Scenario: 嵌套结构 Enter 保留层次结构
- **WHEN** 用户在所见即所得模式下的复杂嵌套结构（例如，块引用内的列表）内按 Enter
- **THEN** 完整的层次结构应保留在 Markdown 序列化中
- **THEN** 切换到源模式并返回应生成外观相同的文档（保留视觉保真度）

#### Scenario: 输入点附近的代码块不受影响
- **WHEN** 用户在 WYSIWYG 模式下在围栏代码块附近按 Enter
- **THEN** 序列化 Markdown 中代码块内容应保持完整且不变

### Requirement: 源开关完整性检查

当从 WYSIWYG 切换到源模式时，系统 MUST 执行内容完整性检查，以检测序列化截断。

#### Scenario: 交换机检测到截断
- **WHEN** `getMarkdown()` 输出包含的行或字符明显少于预期（基于 ProseMirror 文档节点计数）
- **THEN** 系统应通过 `logException` 记录警告
- **THEN** 系统应向用户显示警告提示
- **THEN** 未经用户确认，截断的内容不得覆盖源文本区域

#### Scenario: 正常切换，无警告
- **WHEN** `getMarkdown()`输出完整有效
- **THEN** 系统将正常更新源文本区域
- **THEN** 不显示任何警告

### Requirement: 往返保真

The system SHALL maintain content fidelity through WYSIWYG↔source mode switches.

#### Scenario: 多种模式切换保留内容
- **WHEN** 用户反复从所见即所得模式切换到源模式并返回
- **THEN** 每个模式切换应产生一致的内容
- **THEN** N次往返后，Markdown内容应与原始内容相同（空白和图像URL的模归一化）

#### Scenario: 编辑然后切换保留编辑
- **WHEN** 用户以所见即所得模式进行编辑，然后切换到源
- **THEN** 所有所见即所得编辑应反映在源文本区域内容中
- **WHEN** 用户在源模式下进行编辑然后切换到所见即所得
- **THEN** 所有源代码编辑均应反映在所见即所得编辑器内容中

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
