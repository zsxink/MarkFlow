# 调试记录：代码块行号显示异常

> 2026-06-02 — 花了大量时间才修好，记录完整根因链条

## 现象

启用代码块行号后，5 行代码显示为 `1 空 2 3 4 5`（中间多一个空行）。

## 根本原因链条

1. **CSS 缺失 `flex: 1`**：`.code-show-line-numbers pre` 用了 `display: flex`，但 `<code>` 没有 `flex-grow: 1`。默认 `flex-grow: 0` 导致 `<code>` 宽度 = min-content。code block 有 `word-break: break-all`，min-content ≈ 1 字符宽（~8px）。

2. **错误的 `clientWidth` 连锁失败**：`computeVisualLineNumbers` 读取 `codeEl.clientWidth` ≈ 8px → `charsPerVisualLine` ≈ 1 → 每行 ~30 字符被算成 ~30 个视觉行 → 大量空白行号。

3. 尝试了多种 JS 方案（除法估算、getClientRects、TreeWalker、纯逻辑行），都绕不开 CSS 布局问题。

## 修复

- **CSS**：`.ProseMirror.code-show-line-numbers pre code { flex: 1; min-width: 0; }`
- **算法**：`Math.floor(codeWidth / charWidth)` + `Math.ceil(len / charsPerLine)`

## 教训

- Flexbox 中缺 `flex-grow` 会导致 `clientWidth` 不是实际可用宽度 — **布局问题先查 CSS**
- 不要跳过 CSS 直接修 JS，这次最终是加一行 CSS 解决的
- `charsPerLine` 必须用 `Math.floor` 取整：浮点数 87.5 实际只能放 87 个字符，不取整会导致 `ceil(175/87.5)=2`（错），取整后 `ceil(175/87)=3`（对）
