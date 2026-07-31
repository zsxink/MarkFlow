# R1B：Command Router、单一 History 与输入事务内核

## 目标

所有编辑入口共享 Core command、Core History 和有界 pending transaction 协议。

## 范围

- OpenSpec tasks：`5.1-5.10`。
- 前置实施 `9.1-9.2` 的最小 composition id/protected range。
- 主要区域：format command layer、toolbar/menu/keymap、Core History、patch coordinator。

## 协议

```text
local tx -> queued -> sent -> acked
                  \-> rejected -> resync/recover
command/undo -> flush or bounded barrier -> execute -> apply selectionAfter
```

## 实现

1. 冻结 History/order ADR：pending、barrier、rebase、timeout、selectionAfter。
2. `EditorCommandRouter` 只依赖 active binding 和 CodeMirror selection，不依赖 mode。
3. toolbar、menu、shortcut、widget、input rule 全部调用同一路由。
4. 移除产品配置中的 CodeMirror 独立 History 和 Undo/Redo 截获。
5. 为 typing、composition、paste、semantic、table、asset、FrontMatter、diagram 定义 History label。
6. 所有 Core result 返回 revision-bound `selectionAfter`。
7. composition id/protected range 形成一个 History group。
8. 覆盖 immediate Undo before ack、ack/Undo、resync/Undo、timeout 和 retry idempotency。

## 验收

- 两模式和所有入口产生相同 command，一次意图只执行一次。
- composition 一次 Undo。
- barrier timeout 不撤销旧编辑、不改变 dirty/selection。
- rejected command 保持 text、selection 和 recoverable UI。
- 人工执行 `M-R1-06` 至 `M-R1-10`。

## 回滚

失败时禁用 semantic command 与 projection construct，保留文本 patch/save；不得启用第二 History。

## 前后依赖

- 前置：[R1A](./r1a-single-editor-surface.md)
- 后续：[R2A](./r2a-render-ir-v2.md)、[R2B](./r2b-live-preview.md)

