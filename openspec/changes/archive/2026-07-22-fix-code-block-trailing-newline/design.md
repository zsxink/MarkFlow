## Context

围栏代码块在 WYSIWYG ↔ Source 模式切换时，尾随换行丢失。根因是自定义代码块序列化器（`editor.extensions.ts`）使用 `ensureNewLine()` 将"围栏分隔所需换行"与"节点内容末尾换行"合并编码，导致 `line` 和 `line\n` 两种 ProseMirror 节点内容序列化结果相同。

同时，`parse.updateDOM` 会移除 markdown-it 围栏 token 固有的一个尾随 `\n`，该规则本身合理，但与序列化侧的合并编码共同导致尾随换行丢失。

## Goals / Non-Goals

**Goals:**
- 围栏代码块中 0、1、多个尾随换行在 WYSIWYG ↔ Source 往返后数量不变。
- 不含尾随换行的代码块不会凭空增加空行。
- 只新增尾部空行也会正确标记文档为已修改。

**Non-Goals:**
- 不改变其他节点类型（段落、列表、引用等）的序列化行为。
- 不改变代码块内部内容的序列化（仅影响尾随换行）。
- 不改变 `parse.updateDOM` 的"移除一个围栏固有换行"规则本身。

## Decisions

### Decision 1: 序列化时始终写入独立的分隔换行

**方案：** 将序列化逻辑从：
```
state.text(node.textContent, false);
state.ensureNewLine();
state.write("```");
```
改为：
```
state.text(node.textContent, false);
state.write("\n");
state.write("```");
```

**理由：** `ensureNewLine()` 只在输出不以换行结尾时补一个换行，因此 `line` 和 `line\n` 两种节点内容序列化结果相同。改为始终写入 `\n` 作为围栏分隔换行，使节点内容末尾的换行独立编码。

**效果：**
- `line` → `"```bash\nline\n```"`（无尾随换行，正确）
- `line\n` → `"```bash\nline\n\n```"`（保留一个尾随换行，正确）
- `line\n\n` → `"```bash\nline\n\n\n```"`（保留两个尾随换行，正确）

### Decision 2: parse.updateDOM 规则不变

`parse.updateDOM` 移除 markdown-it 围栏 token 固有的一个尾随 `\n` 的规则保持不变。该规则与序列化侧的独立分隔换行配合后，无尾随换行的代码块不会新增空行，有尾随换行的代码块正确保留。

### Decision 3: 使用 sub agents 进行开发、复核、验证

开发、复核、验证阶段使用独立的 sub agent 并行执行，确保质量。

## Risks / Trade-offs

- **[风险]** 序列化变更可能影响其他代码块类型（如 Mermaid 代码块）→ 验证所有 `codeBlock` 扩展的序列化路径。
- **[风险]** `parse.updateDOM` 的尾随换行移除规则与序列化变更需要成对验证 → 在测试中覆盖 0、1、多个尾随换行的往返场景。
- **[风险]** 完整性检查阈值（20%）不会捕获少一个尾随换行 → 无需调整阈值，该问题由序列化修复解决。
