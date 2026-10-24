# Spec Delta

## ADDED Requirements

### Requirement: 块级公式往返保真

行首 `$$..$$` 块级公式（含跨行内容）往返 Markdown → WYSIWYG → Markdown 后 MUST 保持 LaTeX 内容字节级无损：`\\`（LaTeX 换行符）、`&`（对齐符）、反斜杠命令、行首缩进与内部换行 MUST 原样保留，不得出现 `&amp;`、`\\begin` 等转义改写。定界符拼写 MAY 按固定规范形输出（内容含换行时 `$$\nlatex\n$$`、单行时 `$$latex$$`），规范化 MUST 幂等且不改变 LaTeX 内容。块级公式 MUST 参与语义指纹往返（parse → serialize → re-parse 指纹一致），含块级公式的文档 MUST 能通过准入进入可编辑 WYSIWYG。

#### Scenario: 跨行 align 环境字节级往返无损

- **WHEN** 文档包含 `$$\n\begin{align}\n  a &= b + c \\\n  d &= e + f\n\end{align}\n$$` 且未编辑即保存或切回源码
- **THEN** 输出字节与输入完全一致（`\\` 仍为双反斜杠、`&` 仍为裸 `&`、无 `&amp;`、无 `\\begin`）

#### Scenario: 编辑相邻内容后公式内容不被改写

- **WHEN** 用户在 WYSIWYG 中编辑块级公式之外的任意内容并保存
- **THEN** 磁盘源码中块级公式的 LaTeX 内容保持原样

#### Scenario: 单行双美元符规范化幂等

- **WHEN** 文档包含 `$$ x $$`（定界符内侧带空白）并往返一次
- **THEN** 输出为规范形 `$$x$$`（内容不含换行）；再往返一次输出不变
- **THEN** KaTeX 渲染内容与原文档一致

#### Scenario: 准入与保存边界不误判

- **WHEN** 含行首跨行块级公式的文档进入准入校验（parse → serialize → re-parse 指纹对比）
- **THEN** 校验通过，文档进入可编辑 WYSIWYG
- **WHEN** 文档未编辑即执行保存边界检查
- **THEN** 判定为未变更，不产生保存冲突或 dirty 误报
