# 调试记录：源码编辑器布局问题

> 2026-06-02 — 三个布局问题及修复

## 问题 1：WYSIWYG 模式下源码编辑器始终可见

- **现象**：切到所见即所得模式后，源码编辑器仍显示在底部
- **根因**：`.source-editor-wrapper` 设了 `display: flex`，覆盖了 `[hidden]` 的默认 `display: none`
- **修复**：加 `.source-editor-wrapper[hidden] { display: none; }`
- **教训**：任何显式设置 `display` 的元素都不能依赖 `hidden` 属性隐藏

## 问题 2：行号占用编辑器宽度 + 滚动条位置不一致

- **现象**：显示/隐藏行号时 textarea 宽度变化；滚动条位置不统一
- **根因**：gutter 作为 flex 兄弟挤占 textarea 空间；textarea 内部滚动
- **修复**：gutter 改为 `position: absolute; right: 100%` 放在 padding 区域；textarea 改 `overflow: hidden` + JS `autoGrowSourceEditor()` 动态设高，由外层 `.editor-area` 滚动
- **教训**：辅助元素应绝对定位在 padding 区域，不与主内容共享流式布局

## 问题 3：行号与实际行不对齐

- **现象**：行号漂移，越往后偏差越大
- **根因**：gutter 用 `<div>` 渲染行号，空 `<div></div>` 没有内联内容 → 没有 line box → 高度为 0
- **修复**：改为 `gutter.textContent = numbers.join('\n')` + `white-space: pre`
- **教训**：对齐行号的最可靠方案是纯文本换行，两个元素同字体 + 同 line-height + 同换行方式，行高自然一致
