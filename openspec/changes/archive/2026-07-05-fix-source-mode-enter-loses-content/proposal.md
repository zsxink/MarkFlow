## Why

在所见即所得（WYSIWYG）模式下按下回车时，ProseMirror 内部生成的新节点结构与 tiptap-markdown 序列化器不兼容，导致切换到源码模式后部分内容丢失。WYSIWYG 视图中的内容仍在（但位置偏移，实际已损坏），而文本区域的内容已不完整。这是一个数据丢失 bug，严重影响编辑体验。

## What Changes

- 修复 WYSIWYG 模式下回车键导致节点分裂后，tiptap-markdown `getMarkdown()` 序列化输出不完整的问题
- 确保 WYSIWYG 和源码模式之间的内容同步始终保真（round-trip fidelity）
- 添加节点结构兼容性保护措施，防止特定节点类型（列表、表格、代码块等）内的回车操作导致序列化截断
- 定位并修复 ProseMirror 文档中因回车分裂产生的无效/损坏节点结构

## Capabilities

### New Capabilities
- `enter-content-integrity`: 确保在 WYSIWYG 模式下所有场景中按下回车不会导致内容丢失，序列化到 Markdown 时输出完整

### Modified Capabilities
<!-- No existing spec modifications needed — this is a bug fix within the existing editing capability -->

## Impact

- `src/lib/editor.ts`：可能涉及 `switchToSource()`/`switchToWysiwyg()` 同步逻辑、`getMarkdown()` 调用链
- `src/utils/keyboard.ts`：Enter 键处理逻辑（如需要拦截或修补特定场景）
- `tiptap-markdown` 扩展配置（`Markdown.configure(...)`）：可能涉及自定义序列化规则
- 影响范围：所有使用 WYSIWYG 编辑并切换到源码模式的用户操作流程
