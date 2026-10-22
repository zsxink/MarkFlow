# Design

## Context

见 `proposal.md` — Why。当前实现事实：

- `src/lib/editor.init.ts` 注册 `TaskList` 与 `TaskItem.configure({ nested: true })`。Tiptap 3.30.5 的 `TaskItem` 使用 NodeView 构造 `<li data-checked>`，内部依次是 `label`（`contentEditable=false`，含原生 `input[type=checkbox]` 与一个视觉隐藏的说明 `span`）和承载编辑内容的 `div`（`contentDOM`）。
- `src/styles/editor.css` 的任务列表样式只有三条规则：`ul[data-type="taskList"] { list-style: none; padding-left: 0 }`、`li { display: flex; align-items: flex-start; gap: 8px }`、`input[type="checkbox"] { margin-top: 4px; accent-color: var(--accent) }`。
- 通用规则叠加：`.ProseMirror p { margin-bottom: 0.75em }`、`.ProseMirror li { margin-bottom: 0.25em }`、`.ProseMirror ul { margin-bottom: 1em; padding-left: 24px }`。任务项内部段落与任务项自身下边距叠加，连续任务项间距约 `1em`，反而大于段落间距 `0.75em`。
- 正文字号由设置写入 `.ProseMirror` 的内联 `font-size`（默认 18px），行高同理（默认 1.7）。因此任务列表的尺寸必须使用 `em` 才能跟随设置缩放。

## Goals / Non-Goals

**Goals:**

- 用纯样式（CSS）修复三处缺陷，不修改 Tiptap 扩展配置、NodeView 或 Markdown 转换链路。
- 让任务项内容区宽度在空内容时也是确定值，从而让插入光标可绘制。
- 尺寸与间距以 `em` 表达，随正文字号/行高设置缩放。
- 提供两层回归证据：源码级样式契约单测（快），原生 WebKit e2e 的实测 DOM 几何断言（真）。

**Non-Goals:**

- 不重写 checkbox 为自定义 `appearance: none` 视觉组件（会牵动可访问性、点击语义与主题绘制）。
- 不引入新的编辑器扩展、NodeView 覆盖或 Markdown 序列化改动。
- 不改动普通段落、无序列表、有序列表的既有间距规则。

## Decisions

**1. 任务项内容区用 `flex: 1 1 0` + `min-width: 0`，而非 `flex-grow: 1` 或 grid。**

`li` 已是 flex 容器，内容 `div` 目前没有 flex 属性，等价于 `flex: 0 1 auto`：宽度按内容收缩，空内容时宽度为 0。WebKit 对零宽度空块的插入光标不保证绘制，这正是"输入首字符后光标才出现"的机制。`flex: 1 1 0` 把 flex-basis 归零，剩余空间全部分给内容区，宽度恒等于 `容器宽 − 复选框宽 − gap`，与内容是否为空无关；`min-width: 0` 保留长单词/长 URL 时的收缩与换行能力，避免横向溢出。

替代方案：`display: grid; grid-template-columns: auto 1fr` 同样能保证非零宽度，但要重写 `align-items`、`gap` 与嵌套列表的排列语义，改动面更大；`flex-grow: 1` 配合 `flex-basis: auto` 在内容极长时仍会先撑开再压缩，行为不如 `1 1 0` 确定。

**2. 复选框尺寸用 `1em` 并 `flex: none`，保留原生控件。**

`width: 1em; height: 1em` 在默认 18px 正文下等于 18px，与正文 x-height/cap-height 比例协调；字号设置变化时自动缩放。`flex: none` 阻止复选框在 flex 收缩阶段被压扁。保留原生 `input[type=checkbox]` 意味着勾选语义、键盘可达性、`accent-color` 主题着色和点击切换逻辑（NodeView 的 `change` 处理）全部不变。垂直对齐用 `margin-top` 配合 `align-items: flex-start`：行盒高度为 `1.7em`，18px 方块居中需要约 `0.35em` 顶部偏移。

替代方案：`appearance: none` 自绘复选框可控性更强，但需要额外 `::after` 绘制勾选符号、处理深色/护眼主题的高对比与高 DPI 渲染，风险收益不匹配本次缺陷范围。

**3. 任务项内部段落边距在任务列表范围内归零，任务项之间用独立小间距。**

```css
.ProseMirror ul[data-type="taskList"] li > div > p { margin: 0 }
.ProseMirror ul[data-type="taskList"] li > div > p + p { margin-top: 0.4em }
.ProseMirror ul[data-type="taskList"] li { margin-bottom: 0.25em }
```

用子选择器限定到 `li > div > p`，而不是放宽为 `.ProseMirror li p`，避免影响普通列表内的段落。任务项之间最终间距 = `0.25em`（约 4.5px），显著小于段落间距 `0.75em`（约 13.5px）；任务项内部多段落仍保留 `0.4em` 的可读间隔。嵌套任务列表的 `ul` 在任务项内部，其 `margin-bottom: 1em` 也收窄到 `0.25em`，避免嵌套块在末尾撑出段落级空白。

**4. 验证用"源码契约单测 + 原生 e2e 几何实测"两层，而不是只靠截图。**

CSS 缺陷无法被 TypeScript 或 Markdown 往返测试覆盖，因此：

- 新增 `src/lib/task-list-styles.test.ts`，直接读取 `src/styles/editor.css` 并断言任务列表规则的关键声明存在且数值关系正确（复选框 `1em` + `flex: none`、内容区 `flex: 1 1 0` + `min-width: 0`、任务项内部段落 `margin: 0`、`li` 下边距小于 `.ProseMirror p` 下边距）。这是快速防回归门禁，但只证明"写了什么"，不证明"渲染成什么"。
- 新增 e2e 场景：在原生 WebKit 中加载含空任务项、非空任务项、嵌套任务项的任务列表文档，实测 `getBoundingClientRect()` —— 空任务项内容区宽度 > 0、复选框宽高约等于正文字号、相邻任务项间距小于相邻段落间距；并把光标放进空任务项后断言 DOM selection 落在内容区内且宽度可测，保存窗口截图作为绘制证据。

## Risks / Trade-offs

- [WebKit 零宽度空块不绘光标是浏览器行为推断，若根因不同则宽度修复可能不足] → e2e 同时断言"内容区宽度 > 0"与"空任务项聚焦后 DOM selection 在内容区内"，并在失败时保留原生截图；若宽度已非零但仍无光标，需继续排查焦点/绘制层，不能以输入字符后的状态作为通过依据。
- [`flex: 1 1 0` 让内容区宽度不再由内容决定] → `min-width: 0` 保证长内容正常折行；e2e 用非空任务项与嵌套任务项验证不出现横向溢出。
- [`1em` 复选框在高 DPI 下可能被浏览器按整数像素取整] → 断言使用容差（±2px）而非精确相等。
- [任务项间距收窄可能让含多段落的复杂任务项显得拥挤] → 任务项内部保留 `p + p` 间距，且只收窄任务列表范围内，普通段落不受影响。
- [样式选择器优先级冲突] → 新规则全部以 `ul[data-type="taskList"]` 限定，优先级高于通用 `.ProseMirror p` / `.ProseMirror li`，不依赖 `!important`。

## Open Questions

无。
