# Proposal

## Why

WYSIWYG 模式下 fenced 代码块是「哑块」：复制源码只能手动框选（易带入高亮 span 或漏选），改语言只能切源码模式手改 fence 标记，编辑器内没有任何入口。#415 要求补齐主流编辑器（Typora/Obsidian）的「右上角复制 + 语言切换」体验；UI 已通过三方案原型评审，定稿方案 C「幽灵轻量」。

## What Changes

- 普通代码块 NodeView 右上角新增幽灵工具条（悬停块淡入、菜单打开时常驻）：无边框纯文字语言标签（小写原样，无语言显示「纯文本」）+ 复制图标按钮。
- 复制按钮一键写入块内源码纯文本（`navigator.clipboard.writeText`），成功反馈为图标短暂变 ✓（1.2s 还原）；不产生文档事务、不弄脏文档、不进撤销历史。
- 语言标签点击打开下拉：搜索过滤 + lowlight common 常用语言候选（当前语言打勾）+ 自定义输入兜底（未列出语言原样接受，高亮退化为纯文本），底部提示「未列出的语言将展示为纯文本」。
- 语言切换经 `tr.setNodeAttribute` 更新 language attr，块内立即按新语言重新高亮；与 `update()` 重建逻辑兼容，不丢光标、不无限重建。
- mermaid/plantuml 图表块行为不受影响（不挂工具条，或仅保持现有渲染编辑行为）。
- 工具条样式写在编辑器侧样式文件，不进导出主题。

## Capabilities

### New Capabilities

- `code-block-toolbar`: WYSIWYG 普通代码块右上角悬浮工具条的交互行为——复制反馈、语言下拉切换、不干扰正文编辑与图表块。

### Modified Capabilities

（无。语言 attr 的往返无损已由 `code-block-serialization` 覆盖，本变更不改其要求。）

## Impact

- `src/editor/extensions/code-block.ts`：NodeView 内构建工具条 DOM、复制与语言切换事件、`stopEvent` 补拦截；可能拆出工具条子模块避免文件超行数上限。
- `src/styles/editor.css`：工具条与下拉样式（含三主题 token）。
- 新增语言候选常量（以 lowlight `common` 为准，与源码模式 CodeMirror 语言表区分）。
- 测试：`src/editor/extensions/__tests__/` 新增 NodeView 渲染/复制反馈/语言切换 attr 更新用例。
- 不新增 Tauri 权限、不动导出主题、不改序列化器。
