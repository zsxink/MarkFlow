## Why

MarkFlow 已完成以 `markflow-core` 为文档真相、CodeMirror 为文本镜像、Runtime/Host 为副作用边界的架构迁移，但现有 Core-backed WYSIWYG 只达到基础 Markdown Live Preview，真实桌面验收仍显示源码，命令、History、IME、结构化块和视觉发布门禁也未闭环。二期建设必须把“架构迁移完成”和“Typora 级产品体验完成”分开，以用户真实可见、可编辑、可复制、可撤销和可保存的行为作为唯一退出标准。

## What Changes

- 将 Source 和 WYSIWYG 收敛为同一个 CodeMirror EditorView，通过 extension reconfiguration 切换模式，并共享 Core session、selection、viewport、History 和 patch pipeline。
- 建立本地 optimistic syntax projection 与 Core confirmed Render IR 协作的双层投影模型，修复 IPC、revision ack、stale render、degraded state 和 session 生命周期。
- 把 Render IR 扩展为可表达嵌套 block、block/inline marker ranges、content ranges、semantic tokens、widget descriptors 和安全 fallback 的结构化协议。
- 实现 Typora 级 marker folding/reveal：受支持语法在非活动区域隐藏，光标、选区或 IME composition 进入相关范围时局部揭示。
- 统一 Source/WYSIWYG 的工具栏、快捷键、菜单、Undo/Redo 和语义命令路由，以 Core 为唯一 History owner。
- 建立 composition-aware 输入管线和 Enter、Backspace、Delete、Tab、粘贴、拖放、列表延续、代码块退出等自然编辑行为。
- 实现图片、GFM 表格、Task List、代码块、FrontMatter、Mermaid/PlantUML、HTML comment 等结构化编辑 widget。
- 新增真实 Tauri invoke contract test、GUI E2E、视觉回归、CJK IME、无障碍、大文档、跨 session、跨平台和稳定观察门禁。
- **BREAKING**：完成产品验收后移除隐藏 ProseMirror 空壳、Tiptap 依赖、遗留命令 fallback 和仅服务旧编辑器的 CSS；源码模式成为所有未知或降级场景的可靠 fallback。

## Capabilities

### New Capabilities

- `markdown-semantic-projection`: 生产级 Markdown concrete syntax/semantic projection、lossless ranges、增量失效和 Render IR v2。
- `typora-live-preview`: marker folding/reveal、块级排版、同一 EditorView 模式切换和可见降级状态。
- `editor-input-integrity`: IME、selection、clipboard、自然输入规则、Core 单一 History 和输入事务完整性。
- `structured-block-editing`: 表格、图片、Task List、代码块、FrontMatter、图表和 HTML comment 的结构化 widget 编辑。
- `visual-release-gate`: 真实 GUI、视觉基准、IME、性能、跨平台和稳定观察的不可延期发布门禁。

### Modified Capabilities

- `core-backed-wysiwyg`: 从弱化 marker 的 MVP 提升为 Typora 级可编辑投影，并要求明确的 loading/rendered/degraded 状态。
- `codemirror-source-editor`: Source/WYSIWYG 使用同一 EditorView 和共享状态，不再通过销毁重建切换模式。
- `core-bridge-protocol`: 增加显式命名契约、Render IR v2、revision-confirmed、cancel 和真实 Tauri invoke 一致性要求。
- `source-mode-core`: Source 与 WYSIWYG 共享 Core commands、History、flush/resync 和失败语义。
- `keyboard-shortcuts`: 所有编辑模式下快捷键根据 active Core surface 路由，不再依据 `mode === source` 回落到 ProseMirror。
- `gfm-table-core`: Core table model 必须接入可操作的 WYSIWYG table widget 和 lossless table commands。
- `frontmatter-core`: FrontMatter model 必须接入结构化表单、源码切换和 unsafe fallback。
- `core-diagram-render-targets`: Mermaid/PlantUML 必须作为 session/revision-bound widget 呈现并支持源码揭示与取消。
- `image-storage-engine`: 图片资源事务必须接入替换式 WYSIWYG widget、路径解析、编辑和键盘操作。
- `e2e-test-coverage`: CI 必须运行真实桌面 WYSIWYG smoke，验证渲染语义而不只是文本存在。
- `regression-coverage`: 增加视觉、IME、selection、clipboard、History、性能和跨平台回归矩阵。

## Impact

- 前端：`src/lib/editor*`、`src/editor-adapter/**`、toolbar、keyboard、clipboard、widgets、styles、settings、status/degradation UI。
- Core：ParseIndex、StyleMap、Render IR、edit commands、History、table/frontmatter/diagram/image models 和 source-range mapping。
- Runtime/Tauri：Core Bridge DTO、command argument contract、render cancellation、asset URL、session/revision routing 和 telemetry。
- 测试与 CI：Vitest、Rust fixtures、真实 Tauri invoke harness、WebdriverIO、视觉截图基准、IME/manual smoke 和跨平台 workflows。
- 依赖：评估并引入生产级 Markdown parser/concrete syntax source map；最终移除 Tiptap/ProseMirror 产品依赖。
- 文档与治理：新增 markflow-core 二期总计划，拆分架构 gate 与产品 gate，禁止以 deferred acceptance 绕过 GUI/IME/跨平台退出条件。
