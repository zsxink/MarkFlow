# M5: Core-backed WYSIWYG Editing MVP

## 阶段目标

建立 Core-backed 所见即所得编辑模式，作为 MarkFlow 长期 WYSIWYG 的新主路径。

本阶段目标不是一次性复刻所有 ProseMirror 能力，而是证明新架构可以做到：

- 所见即所得模式长期存在。
- 底层 Markdown 文本仍是唯一真相。
- Source/WYSIWYG 切换不改文档。
- WYSIWYG 不依赖整篇 serializer 保存。

## 技术方案

### 1. 模式定义

新 WYSIWYG 使用 CodeMirror + Render IR：

```text
Core confirmed TextBuffer
  -> ParseIndex / Render IR
  -> Editor Adapter applies to CodeMirror optimistic mirror
  -> WYSIWYG editing surface
```

当前 ProseMirror WYSIWYG 在 M5 仍保留为兼容路径，直到新 WYSIWYG 完成功能覆盖。

### 2. Render IR

Core 输出 viewport 范围内的渲染结构：

```rust
pub struct RenderDocument {
    pub revision: Revision,
    pub viewport: UiRange,
    pub blocks: Vec<RenderBlock>,
}
```

IPC 中 `viewport` 和 block range 使用 revision-bound UTF-16 range，不直接发送 Rust byte offset。

首批 block：

- heading
- paragraph
- blockquote
- bullet list
- ordered list
- task list
- code fence
- image

首批 inline：

- strong
- emphasis
- inline code
- link
- image reference

### 3. Editor Adapter 渲染

Editor Adapter 将 Render IR 转成：

- heading decorations
- emphasis decorations
- marker reveal decorations
- blockquote/list visual indentation
- code block visual style
- image preview widget

M5 优先弱化 marker，不强制折叠 marker。替换 decoration 会改变光标和选区体验，只能在专项光标、复制和无障碍测试通过后逐步启用。

### 4. Marker Reveal

规则：

- 光标不在范围内：marker 弱化。
- 光标进入范围：显示 marker。
- selection 覆盖范围：显示 marker。
- IME composition 范围附近：不隐藏 marker。

### 5. Large Document 策略

超过 1MB：

- WYSIWYG 可用，但只渲染 viewport。
- 图片、图表 widget 默认按需。
- inline parse 可按 viewport 或 idle task。
- UI 显示 Large Document 状态。
- Huge 文档保持同一模式入口，但进一步限制自动图片/图表 widget 和预取缓冲区。

### 6. Widget 安全与可访问性

- unknown、stale 或解析失败范围始终显示源码。
- widget 不得成为唯一可操作入口，必须有键盘路径。
- widget event 不能绕过 Core command 直接修改文档。
- 图片/图表内容设置大小、超时和取消预算。
- copy/paste、screen reader 文本和 selection 穿越 widget 有明确行为。

## 交付物

- Render IR。
- `get_render_blocks` command。
- WYSIWYG CodeMirror extension。
- marker reveal 基础逻辑。
- 图片 preview widget。
- Large Document viewport rendering 策略。

## 验收标准

- Source Mode 与新 WYSIWYG 来回切换，文档 byte-for-byte 不变。
- 新 WYSIWYG 不调用 ProseMirror serializer。
- 标题、加粗、斜体、行内代码、链接、列表、引用、代码块可以直接编辑文本。
- 图片能预览，并能定位回原始 Markdown range。
- 代码 fence marker 和长度不会因切换改变。
- 超过 1MB 文档的 WYSIWYG 不做全文 widget 渲染。
- Unknown block 以源码形式显示，不阻止编辑。
- widget 可用键盘进入/退出，复制文本不会静默丢失隐藏 marker。
- stale Render IR 不会应用到新 revision。
- raw HTML、恶意链接或图表输出不会在编辑 WebView 中执行脚本。
- 当前 ProseMirror WYSIWYG 兼容路径仍可访问。

## 测试要求

- Core tests：Render IR source range。
- Editor Adapter tests：decorations、marker reveal、mode switch。
- E2E：Source/WYSIWYG 往返、图片预览、代码块、列表。
- Large Document smoke：超过 1MB 文档打开、滚动、输入、保存。
- IME smoke：composition 期间不丢字、不错位。
- Accessibility smoke：键盘、焦点、selection、screen reader fallback。
- Security regression：raw HTML、SVG event handler、javascript URL、超大 widget payload。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 新 WYSIWYG 体验不如旧 WYSIWYG | M5 保留旧兼容路径，逐块补齐 |
| Marker 隐藏导致光标错位 | M5 先弱化 marker，不做复杂折叠 |
| 大文件 widget 卡顿 | 超过 1MB 只渲染 viewport，重型 widget 按需 |
