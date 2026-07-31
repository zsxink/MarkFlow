# R3B：GFM Table 与 Image Widgets

## 目标

完成 lossless table editing 和 revision-bound resource transaction。

## 范围

- OpenSpec tasks：`8.2-8.6`，以及 `8.12` 的 Table/Image 部分。
- 主要区域：Core table model/commands、Host asset URL、image transaction、widget UI。

## Table 实现

1. Core descriptor 提供 row/cell identity、range、alignment 和 StyleMap。
2. frontend 不重新 split pipes。
3. cell edit 只 patch cell content；结构命令只允许限定 table block rewrite。
4. 实现 row/column insert/delete、alignment、Tab/Shift+Tab、arrows、Enter、Escape。
5. malformed/unsupported table exact source fallback。

## Image 实现

1. Host 按 active document 解析 safe asset URL。
2. replace/copy/delete/retry/open/reveal 使用 prepare/commit/rollback resource transaction。
3. 支持 alt/title/path、broken state、取消和窗口关闭。
4. 阻止 unsafe URL、path traversal、symlink escape 和 wrong-session commit。

## 验收

- 未影响 cell、pipes、padding、markers 和 EOL byte-for-byte。
- 资源失败不留下无效引用或孤儿文件。
- A/B session、relative path 和 stale result 隔离。
- 人工执行 `M-R3-03` 至 `M-R3-08`。

## 回滚

Table/Image 分别按 feature flag 和 block fallback，不撤销已确认 Core transaction。

## 前后依赖

- 前置：[R3A](./r3a-task-code-widgets.md)
- 后续：[R3C](./r3c-frontmatter-diagram-html.md)

