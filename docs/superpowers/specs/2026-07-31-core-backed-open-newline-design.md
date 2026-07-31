# Core-backed Markdown 打开换行修复设计

## 背景

markflow-core 重构后，打开多行 Markdown 文件时，源码模式显示为丢失换行的纯文本，所见即所得模式也无法按 Markdown 块结构渲染。Core 的 lossless 测试证明文件字节、逻辑换行、BOM 和末尾换行仍被正确保留；问题位于前端文件打开与编辑器初始化边界。

## 目标

- Core Session 是文档正文的唯一真源。
- 源码模式显示 Core 逻辑文本，完整保留内部换行和空行。
- Core-backed WYSIWYG 使用同一份 Core 逻辑文本，并通过当前 revision 的 Render IR 渲染块结构。
- 模式切换、重新加载和保存不依赖 legacy ProseMirror/Markdown serializer 生成正文基线。
- 保留文件打开中的图片生命周期、活动路径、只读状态和 outline 等现有副作用。

## 非目标

- 不处理非数字 workspace sessionId 被 WYSIWYG Render IR 适配器拒绝的问题；该问题单独跟踪。
- 不重构编辑命令、保存协调器或 markflow-core 文本模型。
- 不删除仍被其他 legacy 路径使用的 `setMarkdown()`。

## 架构

打开或重新加载文件时，Host/Core 打开文档并建立 `DocumentSession`。前端以 Core 返回的 `logicalText`、`sessionId` 和 `revision` 初始化活动编辑器：

- Source：`logicalText` 直接进入 SourceEditorAdapter/CodeMirror。
- WYSIWYG：同一 `logicalText` 进入 Core-backed CodeMirror，并使用 `sessionId + revision` 请求 Render IR。

Core-backed 文件打开链路不得先调用 legacy `setMarkdown()`，也不得从 ProseMirror 或 Markdown serializer 回读正文。`setMarkdown()` 仅保留给明确的 legacy 路径。

## 数据流

```text
磁盘字节
  -> Core open_document / DocumentSession
  -> logicalText + sessionId + revision
  -> 当前编辑模式
       -> SourceEditorAdapter(logicalText)
       -> Core WYSIWYG CodeMirror(logicalText) + Render IR(sessionId, revision)
```

模式切换前先 flush 当前适配器的 pending patches；随后从 Core 读取最新 revision/text，再初始化目标模式。重新加载复用相同的 Core 打开/刷新路径。

## 失败策略

- Core 打开或刷新失败时，不用部分状态覆盖当前编辑器。
- Render IR 请求失败时保留 Markdown 源码显示，不压平或清空内容。
- 使用现有日志和用户错误提示，不引入新的错误通道。

## 测试要求

- 使用精确字符串断言 `"# Title\n\nParagraph\n"`，不能只断言包含文本。
- 文件打开/重新加载测试证明 Core-backed 路径不以 legacy `setMarkdown()` 为正文真源。
- 源码与 WYSIWYG 初始化测试证明两种模式收到同一份含内部空行的 Core 文本。
- 模式切换测试证明 flush 后从 Core 重新水合，且不调用 legacy serializer。
- Core 现有 lossless/newline 测试保持通过。

## 验收标准

1. 打开多行 Markdown 后，源码模式显示原始 Markdown 的内部换行和空行。
2. 所见即所得模式按标题、段落、列表等块结构渲染，同时底层文本保留换行。
3. Source/WYSIWYG 切换、重新加载和保存不丢失或改写换行。
4. 文件与图片生命周期相关行为不回归。
