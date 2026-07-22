## Why

WYSIWYG 模式中在围栏代码块末尾按 Enter 新增的空行，切换到源码模式后丢失。这静默改变了代码块内容，且仅新增尾部空行时脏状态可能为 false，导致编辑无法正确保存。多次模式往返中尾部空行逐次减少。

## What Changes

- 修改自定义代码块序列化器（`editor.extensions.ts`），使结束围栏前的分隔换行与节点内容末尾换行分离编码，确保 0、1、多个尾随换行在序列化/往返中数量不变。
- 与 `parse.updateDOM` 的"移除一个围栏固有换行"规则成对验证，确保无尾随换行的代码块不会新增空行。
- 补充代码块序列化器的单元测试，覆盖 0、1、多个尾随换行场景。
- 增加一次模式切换回归测试，覆盖真实 `switchToSource()` 链路。

## Capabilities

### New Capabilities
- `code-block-serialization`: 围栏代码块的序列化/反序列化契约，确保尾随换行在 WYSIWYG ↔ Source 往返中数量不变。

### Modified Capabilities
- `enter-content-integrity`: 新增代码块尾随换行往返保真的验收标准。
- `codemirror-source-editor`: 新增 WYSIWYG → Source 切换时代码块尾随换行保留的验收标准。

## Impact

- `src/lib/editor.extensions.ts` — 自定义代码块序列化器（`codeBlock` 扩展的 `toMarkdown` 方法）
- `src/lib/editor.helpers.ts` — 完整性检查阈值可能需要调整
- `src/lib/editor.ts` — `switchToSource()` 调用链
- 测试文件：`src/lib/editor.serializer.test.ts`、`src/lib/editor.test.ts`
