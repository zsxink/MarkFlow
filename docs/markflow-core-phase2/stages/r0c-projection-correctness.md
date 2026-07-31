# R0C：Projection 正确性止血

## 目标

现有 Core WYSIWYG 即使失败，也不得显示错误状态、静默伪装成功或应用 stale range。

## 范围

- OpenSpec tasks：`3.1-3.10`。
- 主要区域：CodeMirror WYSIWYG extension、SourceSyncController、Core Bridge、status/log/E2E page object。

## 实现

1. 定义 `ProjectionState`：idle、loading、optimistic、rendered、composing、stale、degraded、disposed。
2. 把 patch ack/resync 转换为 `revisionConfirmedEffect`。
3. doc change 后立即 map 或清除旧 decorations。
4. identity 加入 binding generation、session、document、revision、viewport、source hash、request id。
5. session/revision/viewport/mode/window 改变时 cancel 或 obsolete 请求。
6. 实现 degraded bar、Retry、Source Mode 和 non-repeating notification。
7. 修复现有 toolbar/shortcut/menu/Undo/Redo Core routing 止血路径。
8. 在 DOM test attribute、结构化日志和 page object 暴露 projection 状态。

## 自动验收

- ack 后无需再次键入或滚动即可刷新。
- 旧 revision 或其他 document 的 IR 永不应用。
- render failure 保持 text 可编辑且 Source 可达。
- recovery 不重复 toast，旧 decoration 已移除。
- stopgap command routing 有 unit 与 desktop evidence。

## 人工验收

执行 `M-R0-07` 至 `M-R0-10`。

## 退出与回滚

- 退出：stale、degraded、recovery、A/B routing 全部通过。
- 回滚：关闭 Core WYSIWYG projection，Source Mode 作为默认；不回退 Core save/history。

## 前后依赖

- 前置：[R0B](./r0b-parser-bridge-spike.md)
- 后续：[R1A](./r1a-single-editor-surface.md)

