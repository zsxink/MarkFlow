# Proposal

## Why

所见即所得模式下任务列表勾选与未勾选项的文字颜色完全一致，只有复选框填充色不同，已完成项在视觉上依然抢眼，扫读时难以快速区分哪些还没做。

## What Changes

- 已完成任务项（`li[data-checked="true"]`）正文颜色比未勾选项淡一档：未勾选保持 `var(--fg)`，已勾选使用主题的较淡前景色（如 `var(--muted)`）
- 纯 CSS 实现，选择器落在 `src/styles/editor.css` 任务列表样式段，勾选状态变化由 NodeView 更新 `data-checked` 属性即时生效，无需 JS
- 只使用主题 token，不硬编码颜色，亮色 / 暗色主题均正确
- 光标进入已完成项编辑、选中文本时仍保持可读
- 不加删除线（保持文本完整可读，仅做颜色区分）
- 源码模式（CodeMirror）不受影响；样式不外溢到普通段落与普通列表

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `task-list-wysiwyg`: 新增 requirement——已勾选任务项正文 SHALL 使用淡于未勾选项的主题前景色形成视觉层次，且 SHALL 保持可读与主题兼容

## Impact

- 代码：`src/styles/editor.css` 任务列表样式段（约 1 条新增选择器规则）
- 测试：`src/__tests__/task-list-styles.test.ts` 样式契约测试扩展（已勾选颜色、未勾选不变、主题 token 约束）
- 不涉及 Rust、不修改 Tiptap 扩展 / NodeView / Markdown 转换链路、不新增依赖
