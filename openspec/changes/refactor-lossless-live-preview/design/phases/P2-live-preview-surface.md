# P2：单一 CodeMirror Surface 与基础 Live Preview

## 1. 目标

让 lossless 文档使用单一 EditorView，在 Source 与基础 Live Preview 间无正文 transaction 切换，并真实呈现基础 Markdown 语义。Core IR 不可用时仍可编辑和保存。

## 2. 输入与依赖

- P1B Go；
- `EditorSurfaceBinding` 与 patch pipeline 稳定；
- `design/03-editor-live-preview-and-interactions.md`；
- Muya/Vditor 行为矩阵；
- [P2 验证记录](../../validation/phases/P2.md)。

## 3. 实施范围

- 一个 EditorView 与 base/mode/theme/readOnly/projection compartments；
- heading、strong、emphasis、strike、inline code、link、quote、list、fence 本地 decorations；
- marker 默认弱化和 active range reveal；
- projection invalidation closure；
- CM selection/affinity/ChangeDesc mapping；
- outline/stats/status/search/settings 接 active binding；
- projection debug state 与 source fallback；
- 不默认隐藏 marker，不实现复杂 widgets，不依赖 Core IR。

## 4. AI Coding 验证

AI 必须验证：

- Source↔Live Preview 100 次切换，EditorView identity 不变；
- 每次 mode transaction `docChanged=false` 且不进 History；
- selection、direction、scroll anchor、focus、composition、dirty、revision 不变；
- 每个基础 construct 的语义 class/decoration 与底层 source 字符同时存在；
- marker 在 inactive/active/range/composition 下状态正确；
- local projection 只失效目标 closure；
- malformed/unknown 精确 source fallback；
- projection exception、timeout、stale result 不影响输入和保存；
- CJK/emoji/ZWJ selection mapping；
- keyboard Home/End/Arrow/Shift+Arrow/Select All/copy；
- light/dark/sepia、zoom 200%、read-only；
- Large/Huge 文档降级；
- unit、adapter、desktop semantic E2E、visual snapshot 全部输出证据。

运行通用 gate：`npm test`、`npx tsc --noEmit`、`npm run build`、Rust tests、smoke/regression E2E。

## 5. 独立 Reviewer 验证

- 检查 projection extension 不 dispatch doc changes；
- 检查 mode switch 不重建 EditorView；
- 检查 source fallback 可局部清理 stale widget/decoration；
- 检查 selection 未从 DOM textContent 反推；
- 检查基础投影不等待 Core IPC；
- 重跑真实 desktop semantic E2E，确认不是只断言“文本存在”。

## 6. 人工验证

人工需要：

1. 打开一份覆盖基础 constructs 的文档；
2. 确认标题、粗体、斜体、链接、引用、列表、代码块有明显语义；
3. 点击和键盘进入每种 marker，确认源码可编辑且光标不跳；
4. 鼠标拖选跨多个 constructs 并复制，确认复制 Markdown source 正确；
5. 中文 IME 在 marker 邻域输入、撤销、重做；
6. Source/Live Preview 连续切换，观察 selection、scroll、focus；
7. 在三主题、缩放、窄窗口下观察布局；
8. 注入/触发 projection failure，确认回退源码并仍可保存；
9. 打开 malformed Markdown，确认不是空白或错误富文本；
10. 对编辑体验给出 Accept/Reject 与具体问题编号。

## 7. 必须证据

- EditorView identity/mode transaction trace；
- semantic DOM/decorations assertions；
- selection/IME video；
- visual baselines；
- projection failure artifact；
- byte hash before/after；
- Reviewer 与人工结果。

## 8. Go/No-Go

Go：真实 UI 呈现语义；单 surface 不变；切换不改变正文/History；IME/selection 基线通过；失败可 Source fallback。

No-Go：只显示源码却宣称 Live Preview；光标频繁跳动；marker 隐藏导致不可编辑；projection 改正文；Core IR 故障使基础视图不可用。

## 9. 回滚

关闭 `codemirrorLivePreview`，保留同一 lossless Source/Core session。不得回滚到 serializer 保存。若整个 lossless binding 有问题，按 P1B owner 规则关闭并重开 legacy session。
