# Design

## Context

启动和手动新建都使用 newDocumentTab，但交互历史不同。首次从文件树打开文件会经过 suspendCurrent → resetEditorDocument → commit，而不是标签恢复路径 attachEditorDocument。旧 DOM Selection 没有显式清理。Tiptap 自身的 blur 命令为 Safari 同时执行 blur 和 removeAllRanges，且通过 requestAnimationFrame 延后；该异步命令不适合文档切换边界。

原生鼠标复现已确认：启动默认文件侧栏后，直接单击文件行，再单击标题末尾，窗口截图中同时出现旧空段落短光标和标题高光标；此时 PM 与 DOM anchor/head 均为 10、DOM rangeCount 为 1，gapcursor/dropcursor 节点均为 0。旧 E2E 的 showFiles 按钮会先让编辑器失焦，掩盖这条路径。

## Goals / Non-Goals

**Goals:** 在旧 DOM 被替换前结束旧文档的浏览器输入状态，保留旧 EditorState 与历史，保持 PM/CM 和键盘控件的焦点策略。

**Non-Goals:** 禁用启动标签、重建编辑器实例、修改光标外观或引入定时重绘。

## Decisions

- 先提交 NodeView 草稿并保存模型状态，再同步清理旧编辑器拥有的 DOM 选区与焦点，最后替换共享视图的文档。浏览器 Selection 的清理不改变保存的 EditorState。
- 仅操作属于旧编辑面的 activeElement / DOM range，不干扰文件树、Frontmatter、对话框等外部输入框。
- 若焦点原本属于编辑面，按文档操作既有策略在最终目标模式可见后恢复；保持键盘标签控件焦点。任何错误回滚同样使用原始焦点意图。
- 不调用延迟的 commands.blur，避免其回调清空下一文档的新选区。
- 新建空标签的焦点直接通过视图同步恢复，避免启动时留下跨文档的 requestAnimationFrame focus；焦点落定后再完成串行文档操作。
- 自动化覆盖必须从启动空标签开始，置于其他编辑/模式切换之前；DOM 选区断言配合原生窗口截图，不能只凭模型位置宣称无视觉残留。

## Risks / Trade-offs

- [blur 事件影响模型选区] → 保存原始模型状态后清理，并验证对象、选择与 undo 均保持。
- [过度清除浏览器选区] → 对 anchor/focus 所属文档和编辑器根节点做范围限制，测试外部输入不受影响。
- [原生光标在 WebView 截图中不出现] → 使用操作系统窗口截图与真实鼠标步骤进行视觉复核，并如实区分本地可复现与未复现结果。
