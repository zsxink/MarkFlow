---
description: 行号计算规则 — 编辑行号相关代码时自动加载
globs: ["src/lib/editor.helpers.ts", "src/lib/source-editor.ts", "src/**/*line-number*"]
---

- monospace + `word-break: break-all` 下计算换行视觉行数的正确公式：
  - `charsPerLine = Math.floor(codeWidth / charWidth)` — 必须 floor，浏览器不能放半个字符
  - `visualLines = Math.ceil(textLength / charsPerLine)`
- 测量字宽用 `'x'.repeat(100)` 取平均（`measure.offsetWidth / 100`），比单字符更稳定
- 逻辑行显示行号，换行续行留空
