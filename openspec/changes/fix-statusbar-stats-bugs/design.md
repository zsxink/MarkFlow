## Context

状态栏底部统计信息存在两个 bug：
1. **列数（line count）始终多 1** — `getCursorPos()` 中 `blockStart` 从 0 初始化，导致第一个 block 的 `line` 计数器多跳一次
2. **源码模式（textarea）下状态栏不更新** — `source-editor` 的 `input` 事件未派发 `editor-update` 自定义事件

## Goals / Non-Goals

**Goals:**
- 修复光标位置的列数（line）显示
- 修复源码模式下状态栏不能动态更新（字数、行数、光标位置）

**Non-Goals:**
- 不改变 WYSIWYG 模式的行为
- 不新增状态栏功能
- 不涉及任何 UI 样式变更

## Decisions

### Bug 1: `getCursorPos()` 行数多 1

**根因**：`blockStart` 初始化为 `0`，而第一个 block 的 `nodePos`（通常是 `1`）满足 `nodePos > blockStart`，导致第一个 block 触发 `line++`，从 1 变成 2。

**方案**：将 `line` 初始值从 `1` 改为 `0`，让第一个 block 正确自增到 `1`。返回值用 `Math.max(line, 1)` 兜底空文档场景。

```
// 修改前
let line = 1;
// 修改后
let line = 0;
return { line: Math.max(line, 1), col: from - blockStart + 1 };
```

### Bug 2: 源码模式状态栏不更新

**根因**：`source-editor` 的 `input` 事件处理函数只做了 dirty 检查和行号同步，没有触发 `editor-update` 事件，`statusbar.ts` 的 `updateStats()` 没有被调用。

**方案**：在源码 textarea 的 `input` 事件里添加 `document.dispatchEvent(new Event('editor-update'))`。

## Risks / Trade-offs

- 无风险：两个修改变更点独立且简单，改动范围小
- 引入 `editor-update` 后，`outline.ts` 的 `refreshOutline()` 也会被调用（它监听了同一事件），但不会造成问题因为源码模式下 outline 已经不可见或不同步
