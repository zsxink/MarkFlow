# ADR：Typora 式投影与交互合同

## 状态

Accepted for planning。该 ADR 冻结 P4B/P6/P7 的需求边界；实现仍须按阶段完成 spike、测试和人工验收。

## 背景

当前 lossless Live Preview 只用 `Decoration.mark` 弱化 marker。P6 曾同时要求“marker 仍在 DOM 中但 0 宽占位”和 Typora 式隐藏，而主设计要求 `Decoration.replace`；两者在点击定位、selection、copy 和 accessibility 上不兼容。P4B 与 P6 也同时声称负责 marker hiding，造成重复实现风险。

## 决定

1. `EditorState.doc` 始终是唯一交互正文，Core confirmed snapshot 始终是持久化真相。
2. Marker hiding 统一由 P6 交付；P4B 只提供 owner registry、interaction harness、widget protocol、source fallback 和轻量 widgets。
3. 隐藏 marker 使用 `Decoration.replace`。需要光标作为一个单元跨越的 source range同时提供给 `EditorView.atomicRanges`；空 construct 可使用只读 placeholder/glyph，但 placeholder 不是正文。
4. Marker 状态统一为 `visible / dimmed / hidden / revealed`。Composition 是强制 revealed 或冻结安全投影的条件。
5. Plain-text copy/cut、drag source、save、History、screen-reader descriptor 和 export source 都从 CodeMirror/Core source range产生，不依赖 rendered DOM `textContent`。
6. Replacing decoration 若跨换行或改变垂直布局，必须由可影响布局的直接 decoration source/state field 提供；viewport-only view plugin 只用于不会改变布局结构的投影。
7. Source fallback 是每个 construct 的正常产品状态，不是异常兜底；unsupported、malformed、unsafe、stale 或 range 不可信时必须回退。
8. P6/P7 属于 Issue #254 umbrella change 的必达范围。最终执行顺序为 P4B → P6 → P7 → P5；P5 才负责最终发布与 legacy 清理。

## 结果

- 不再声称隐藏 marker 后 DOM 天然包含 Markdown source。
- P6 必须实现 explicit clipboard/a11y/navigation contracts，并以真实 WebView/IME 证据验收。
- P7 的 widget commit 只能返回 source transaction。
- P5 之前可以保留 legacy 版本回滚，但同一 lossless session 不得切换正文 owner。

## 否决方案

- CSS `opacity: 0`/零宽 marker：仍允许 caret 落入不可见字符，坐标和 accessibility 行为不稳定。
- 把 marker 从 CodeMirror document 删除：破坏 source truth、History 和 byte fidelity。
- 使用 widget DOM 或 ProseMirror tree 作为保存正文：重新引入双真相和 serializer round-trip。
