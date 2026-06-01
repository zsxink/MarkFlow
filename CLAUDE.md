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
- **算法**：用 100 字符测量平均字宽（`measure.offsetWidth/100`），`codeWidth / charWidth` 算每行可容纳字符数，`Math.ceil(len / charsPerLine)` 算视觉行数。逻辑行显示行号，换行续行留空。

### 教训
- **Flexbox 中缺 `flex-grow` 会导致 `clientWidth` 不是实际可用宽度**。布局问题先查 CSS。
- **不要跳过 CSS 直接修 JS**。这次先尝试了各种 JS 方案，最后是加一行 CSS 解决了。
- 测量字宽时用多个字符（`'x'.repeat(100)`）取平均，比单个字符更稳定。
- `Math.ceil(len / charsPerLine)` 是 monospace + `word-break: break-all` 下计算 wrapping 视觉行数的正确公式。
