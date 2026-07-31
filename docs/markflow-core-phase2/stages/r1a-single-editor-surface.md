# R1A：单一 EditorSurfaceBinding

## 目标

每个活动文档只有一个 CodeMirror EditorView，Source/WYSIWYG 只通过 compartments 重配置。

## 范围

- OpenSpec tasks：`4.1-4.8`。
- 主要区域：editor lifecycle、source editor adapter、mode switch、active document consumers。

## 设计

```text
EditorSurfaceBinding
  identity: generation/session/document/revision
  view: EditorView
  pipeline: patch/ack/resync
  compartments: base/input/source/preview/theme/readOnly
  projection: state/request registry
  lifecycle: attach/switch/detach/dispose
```

## 实现

1. 抽取 stable base、input、source、preview、theme、read-only compartments。
2. mode switch 改为 compartment reconfigure，不 destroy/recreate EditorView。
3. 保持 selection、scroll anchor、focus、viewport、pending patch、dirty 和 revision。
4. statusbar、outline、stats、settings、search、export 全部读取 active Core surface。
5. A/B、same-path multi-session、window destroy 更新 binding generation。
6. legacy ProseMirror 暂留 flag 后，但不得参与 active Core surface 的 read/write/save。

## 验收

- 单文档生命周期只创建一个 EditorView。
- 100 次切换保持 bytes、selection、scroll、focus、dirty、revision、History。
- pending patch 中切换安全。
- A/B、关闭、重开、窗口销毁无 request/session 泄漏。
- 人工执行 `M-R1-01` 至 `M-R1-05`。

## 回滚

single-surface flag 可暂时关闭；回滚不得恢复 serializer save 或 DOM truth。

## 前后依赖

- 前置：[R0C](./r0c-projection-correctness.md)
- 后续：[R1B](./r1b-command-history.md)

