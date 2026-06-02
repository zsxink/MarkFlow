# MarkFlow project guidance

- When debugging bugs, regressions, runtime failures, or user-reported issues in MarkFlow, check the runtime logs first before making code changes.
- The app writes logs under its app config directory in the `logs/` subdirectory.
- On this machine, the current runtime log directory is `C:/Users/xian/AppData/Roaming/MarkFlow/logs`.
- Use the logs to narrow the failing flow, affected module, and recent error context before reproducing or patching.

## Debugging record: code block line numbers

2026-06-02 — 花了大量时间才修好的行号问题，教训如下：

### 现象
启用代码块行号后，行号显示异常：5行代码显示 `1 空 2 3 4 5`（中间多一个空行）。

### 根本原因链条
1. **CSS 缺失 `flex: 1`**：`.code-show-line-numbers pre` 用了 `display: flex`，但 `<code>` 元素没有 `flex-grow: 1`。在 flex 布局中，`flex-grow: 0`（默认值）导致 `<code>` 的宽度 = min-content。而 code block 有 `word-break: break-all`，min-content 宽度≈1字符宽（~8px）。
2. **错误的 `clientWidth` 导致连锁失败**：`computeVisualLineNumbers` 读取 `codeEl.clientWidth` ≈ 8px，除以字宽后，`charsPerVisualLine` ≈ 1.0。每行 ≈30字符 → 被算成 ≈30个视觉行 → 大量空白行号。
3. 此后尝试了各种方案（除法估算、getClientRects、TreeWalker遍历文本节点、兜底纯逻辑行），**都绕不开 CSS 布局问题**。

### 修复
- **CSS**：加 `.ProseMirror.code-show-line-numbers pre code { flex: 1; min-width: 0; }`
- **算法**：用 100 字符测量平均字宽（`measure.offsetWidth/100`），`Math.floor(codeWidth / charWidth)` 算每行可容纳字符数（必须取整，因为浏览器不能放半个字符），`Math.ceil(len / charsPerLine)` 算视觉行数。逻辑行显示行号，换行续行留空。

### 教训
- **Flexbox 中缺 `flex-grow` 会导致 `clientWidth` 不是实际可用宽度**。布局问题先查 CSS。
- **不要跳过 CSS 直接修 JS**。这次先尝试了各种 JS 方案，最后是加一行 CSS 解决了。
- 测量字宽时用多个字符（`'x'.repeat(100)`）取平均，比单个字符更稳定。
- **`charsPerLine` 必须用 `Math.floor` 取整**：`codeWidth / charWidth` 是浮点数（如 87.5），但浏览器实际只能放置整数字符（max=87）。不取整会导致 `ceil(175 / 87.5) = 2`（错误，应为 3），取整后 `ceil(175 / 87) = 3`（正确）。这是第二个根因。
- `Math.ceil(len / charsPerLine)` + `charsPerLine = Math.floor(codeWidth / charWidth)` 是 monospace + `word-break: break-all` 下计算 wrapping 视觉行数的正确公式。

## Debugging record: source editor layout

2026-06-02 — 源码编辑器三个布局问题及修复：

### 问题 1：WYSIWYG 模式下源码编辑器始终可见
- **现象**：切换到所见即所得模式后，源码编辑器仍显示在底部。
- **根因**：`.source-editor-wrapper` 设了 `display: flex`，覆盖了浏览器对 `[hidden]` 属性的默认 `display: none`。CSS 作者样式表优先级 > UA 样式表。
- **修复**：加 `.source-editor-wrapper[hidden] { display: none; }`。
- **教训**：**任何显式设置 `display` 的元素都不能依赖 `hidden` 属性隐藏**。要么加 `[hidden]` 选择器覆盖，要么用 class 切换代替 `hidden`。

### 问题 2：行号占用编辑器宽度 + 滚动条位置不一致
- **现象**：显示/隐藏行号时 textarea 宽度变化；源码模式滚动条在 textarea 内部，WYSIWYG 滚动条在 `.editor-area` 右边缘。
- **根因**：gutter 作为 flex 兄弟元素挤占 textarea 空间；textarea `height: 100%` + 内部滚动，滚动条不在最右侧。
- **修复**：
  - Gutter 改为 `position: absolute; right: 100%`，放在 `.editor-container` 的左侧 padding 区域（48px），不占 textarea 宽度。
  - Textarea 改为 `overflow: hidden` + `min-height: calc(100vh - 248px)`，通过 JS `autoGrowSourceEditor()` 动态设高度，让 `.editor-area` 滚动（和 WYSIWYG 一致）。
- **教训**：**行号等辅助元素应绝对定位在 padding 区域**，不要与主内容共享流式布局。需要统一滚动条位置时，让内容自增长、由外层容器滚动。

### 问题 3：行号与实际行不对齐
- **现象**：行号漂移，越往后偏差越大。
- **根因**：gutter 用 `<div>` 元素渲染每行行号，非显示行用空 `<div></div>`。**空的块级元素没有内联内容 → 没有 line box → 高度为 0**，导致后续行号全部上移。
- **修复**：改为 `gutter.textContent = numbers.join('\n')` + CSS `white-space: pre`。纯文本换行符的每一行都有正确的 line-height，和 textarea 完全一致。这与代码块行号（`editor.helpers.ts` 中 `computeVisualLineNumbers`）使用相同方案。
- **教训**：
  - **空 `<div></div>` 高度为 0**，不等于"一行的高度"。需要占位高度时，要么放内容（`&nbsp;`），要么用纯文本 + `white-space: pre`。
  - **对齐行号的最可靠方案是纯文本换行**，而非逐行 DOM 元素。两个元素用相同字体 + 相同 line-height + 相同换行方式，行高自然一致。
