## Context

切换文档时，`openFileInEditor` 调用 `setMarkdown(content)` 更新编辑器内容，但未重置 `.editor-area` 的 `scrollTop`。ProseMirror 的 `setContent` 不会冒泡滚动事件到父容器，导致旧文档的滚动位置被保留。

## Goals / Non-Goals

**Goals:**
- 每次打开新文档时，编辑器滚动容器回到顶部
- 修复不应引入副作用或影响其他滚动行为

**Non-Goals:**
- 不改变文档切换的其他行为
- 不引入滚动位置记忆功能

## Decisions

**在 `openFileInEditor` 中重置滚动位置（不在 `setMarkdown` 中）**

- 方案 A：在 `setMarkdown` 中重置 — 覆盖所有调用方，但会破坏 `reloadActiveDocumentFromDisk` 保持阅读位置的合理行为
- 方案 B：在 `openFileInEditor` 中重置 ✅ — 仅在切换文档时重置，精确匹配用户意图

选择方案 B：`setMarkdown` 也用于外部修改重新加载（`reloadActiveDocumentFromDisk`），此时用户期望保持滚动位置。将重置逻辑放在 `openFileInEditor` 中，只在切换到**不同文档**时触发。

实现方式：
1. 提取 `resetEditorScroll()` 工具函数到 `src/lib/editor.ts`
2. 在 `openFileInEditor` 的 `setMarkdown(content)` 之后调用 `resetEditorScroll()`
3. 使用 `behavior: "auto"` 避免滚动动画

```typescript
// src/lib/editor.ts
export function resetEditorScroll() {
  document.getElementById('editor-area')?.scrollTo({ top: 0, behavior: 'auto' });
}
```

```typescript
// src/components/sidebar.fileops.ts — openFileInEditor 内
setMarkdown(content);
resetEditorScroll();
refreshOutline();
```

## Risks / Trade-offs

- [风险] 未来新增文档切换入口需记得调用 `resetEditorScroll()` → 当前所有入口均经过 `openFileInEditor`，风险可控
