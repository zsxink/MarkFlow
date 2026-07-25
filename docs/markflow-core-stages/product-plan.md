# MarkFlow Core 重构产品方案

> 状态：方案已校准，待 M0 技术基线冻结
> 更新日期：2026-07-25
> 主题：将 MarkFlow 从富文本树驱动的 Markdown 编辑器，重构为 Lossless Markdown Engine 驱动的本地优先写作工具。
> 配套文档：`technical-plan.md`、`feature-migration-matrix.md`

## 1. 背景

MarkFlow 当前采用 Tiptap/ProseMirror 承担所见即所得编辑、文档结构表达和 Markdown 序列化。这个架构能较快做出富文本编辑体验，但它天然会把 Markdown 原文转换成富文本节点树，再由 serializer 重新生成 Markdown。

这导致 MarkFlow 在向专业 Markdown 编辑器演进时遇到结构性限制：

- 尾部空行需要额外元数据补回。
- FrontMatter、HTML Comment、代码围栏样式、列表 marker、表格对齐等原文细节无法作为一等信息保存。
- 源码模式与所见即所得模式之间存在双真相：CodeMirror 保存文本，ProseMirror 保存语义树。
- 大文件会在 Rust String、IPC、JS string、ProseMirror doc、serializer 输出之间产生多份副本。
- 光标映射、输入法、快捷键行为受到 WebView、contenteditable 和 ProseMirror 事务模型共同影响。

新的产品方向是：**Markdown 原文成为唯一真相，UI 成为原文的交互式投影。**

## 2. 产品目标

### 2.1 Lossless Markdown Engine

编辑后尽可能保持源文件格式不变。

MarkFlow 不再追求“输出统一风格 Markdown”，而是优先保护用户已有文件风格。未编辑区域应保持 byte-for-byte 不变；被编辑区域也应尽量沿用上下文风格。

必须保留的格式包括：

- BOM、编码策略、LF/CRLF/Mixed 换行风格。
- 文件末尾空行数量。
- FrontMatter 原文。
- HTML 注释。
- 无序列表 marker：`-`、`*`、`+`。
- 有序列表 marker：`.`、`)`，以及是否自动递增。
- 引用前缀风格与嵌套缩进。
- 代码围栏 marker：反引号或波浪线，以及围栏长度。
- 表格列对齐、冒号位置、pipe padding。
- 链接、图片、裸 URL、引用式链接的原始表达。

### 2.2 高性能 Editor Core

超大 Markdown 文件依然流畅。

MarkFlow 应支持从普通文章到超大技术文档、日志式 Markdown、AI 生成长文档的连续编辑。大文件体验不应依赖“禁用能力”作为唯一降级手段，而应通过核心架构控制资源使用。

目标体验：

- 打开大文件时快速进入可读状态。
- 滚动、输入、选择、搜索不因全文渲染阻塞。
- 解析和诊断可分层、分片、增量完成。
- 图片、图表、表格等重型预览按需渲染。
- 保存时不需要重新序列化整篇语义树。

### 2.3 跨平台一致的编辑体验

Windows、macOS、Linux 的光标、输入法、快捷键行为一致。

产品层面不应让用户感知不同平台 WebView/contenteditable 的差异。核心编辑行为应基于稳定的文本 patch 和 selection model，而不是富文本 DOM 状态。

重点一致性范围：

- 光标移动、选区扩展、单词边界。
- 中文、日文、韩文输入法 composition。
- Markdown 快捷键。
- 撤销/重做。
- 复制、粘贴、拖拽图片。
- 行列号、字数统计、大纲跳转。

### 2.4 可演进的扩展边界

核心保持精简，但**插件系统不进入近期实施范围**。

本轮重构优先完成 Lossless Markdown Engine、高性能编辑内核、所见即所得编辑体验、FrontMatter 结构化编辑、表格所见即所得编辑、现有功能完整迁移。Core 可以预留内部扩展点，但不承诺第三方插件 SDK、动态加载、插件市场或稳定 ABI。

近期扩展边界：

- Mermaid、PlantUML、FrontMatter、GFM Table 等先作为内置能力或内部 provider。
- Core API 保持模块化，避免能力散落到 UI 或 Host。
- 等 Core、UI、Host 边界稳定后，再单独规划插件系统。

## 3. 产品定位

重构后的 MarkFlow 不是传统富文本编辑器，也不是纯源码编辑器，而是：

> 一个以 Markdown 源文件为核心的本地优先 Live Preview 编辑器。

它应接近 Typora/Obsidian Live Preview 的自然编辑感，但更强调工程级保真、可扩展和大文件性能。

## 4. 最终架构愿景

MarkFlow 的最终形态不是“一个 Tauri 应用”，而是“一个 Markdown 编辑器内核 + 多宿主产品”。

```text
┌────────────────────────────────────┐
│           UI（SolidJS）             │
├────────────────────────────────────┤
│      Editor Adapter（TS）           │
├────────────────────────────────────┤
│ Core Bridge / Client                │
│ IPC / WASM / Native Binding         │
├────────────────────────────────────┤
│ markflow-runtime / App Service      │
│ Session / Task / Save / Sync        │
├─────────────────┬──────────────────┤
│ markflow-core   │ Host Adapter     │
│ Buffer / Parser │ Tauri / CLI / Web│
│ History / IR    │ FS / OS / Print  │
└─────────────────┴─────────┬────────┘
                            │
              Windows / macOS / Linux
```

最重要的产品边界是：**把 Tauri 当成平台适配器，而不是应用框架。**

### 4.1 分层职责

| 层 | 职责 | 不负责 |
| --- | --- | --- |
| UI（SolidJS） | 布局、工具栏、侧边栏、设置、状态栏、弹窗、主题 | Markdown 解析、保存、历史记录 |
| Editor Adapter（TS） | CodeMirror 接入、Live Preview 装饰、widgets、selection/IME 映射、快捷键入口 | 文档真相、Markdown 序列化 |
| Core Bridge | 连接 UI 与 Runtime；桌面走 IPC，Web 走 WASM/Worker，CLI 直接调用 | 业务规则、平台能力实现 |
| markflow-runtime | Session Registry、任务调度与取消、保存编排、外部修改和资源事务 | Markdown 语法、DOM、具体平台 API |
| markflow-core（Rust） | Buffer、Parser、Patch、History、Search、Export IR、Diagnostics、内部扩展点 | 文件 IO、网络、DOM、WebView、窗口、菜单、系统对话框 |
| Host Adapter | 文件系统、窗口、菜单、剪贴板、通知、权限、外部打开 | Markdown 编辑模型 |
| Platform | Windows、macOS、Linux、Browser 的实际系统能力 | 应用语义 |

### 4.2 未来产品形态

同一个 `markflow-core` 应支撑多种产品形态：

```text
MarkFlow Desktop
= SolidJS + CodeMirror + markflow-runtime + TauriHost + markflow-core

MarkFlow Web
= SolidJS + CodeMirror + markflow-runtime.wasm + WebHost + markflow-core.wasm

MarkFlow CLI
= CliHost + markflow-runtime + markflow-core

未来 Electron 版
= SolidJS + CodeMirror + markflow-runtime + ElectronHost + markflow-core
```

这个分层要求 MarkFlow 长期积累的文档能力沉淀在 `markflow-core`，会话和副作用编排沉淀在 `markflow-runtime`，而不是沉淀在 Tauri command、WebView DOM 或某个前端框架的 store 中。

### 4.3 文档真相与编辑镜像

“Markdown 原文是唯一真相”不代表前端不能持有文本。CodeMirror 必须保留一份低延迟可编辑镜像，否则每次按键都等待 IPC 会破坏输入体验。

产品定义如下：

- Core confirmed snapshot 是保存、解析、历史和导出的权威状态。
- CodeMirror document 是当前窗口的乐观编辑镜像。
- 前端修改必须以小 patch 同步到 Core，并获得 revision 确认。
- 保存、切换文档、reload、undo/redo 前必须完成 pending patch 同步。
- revision 冲突时必须重同步，禁止把前端未确认文本直接写盘。
- 同一 session 同一时刻只能有一个保存 owner。
- 同一路径在多个窗口打开时使用独立 session，通过 file identity 检测保存冲突；本轮不实现跨窗口实时协同编辑。

## 5. 编辑模式

### 5.1 Source Mode

完整显示 Markdown 源码。适合精确编辑、排查格式、修改复杂表格或特殊语法。

能力：

- CodeMirror 6 文本编辑。
- Markdown 语法高亮。
- 行号、折叠、搜索、替换。
- 插件诊断标记。
- 与 Live Preview 共享同一份文本模型。

### 5.2 WYSIWYG / Live Preview Mode

长期保留的一等编辑模式。底层仍是 Markdown 文本，界面弱化或隐藏语法标记，让用户以所见即所得方式编辑。

产品要求：**MarkFlow 必须一直支持所见即所得编辑模式。** 当前 ProseMirror WYSIWYG 可以在迁移期作为兼容路径存在，但终态的所见即所得应由 Core-backed Live Preview 和 Editor Adapter 实现，而不是由 ProseMirror serializer 承担文档真相。

示例行为：

- `## 标题` 渲染成二级标题，光标进入标题时显示 `##`。
- `**粗体**` 平时显示为粗体，选中或光标进入时显示标记。
- `![alt](path)` 平时显示图片，选中后显示源码或图片控制条。
- 代码块显示语法高亮，但保留原始 fence 风格。
- 表格显示为可编辑表格 UI，底层操作生成 Markdown table patch。
- FrontMatter 支持结构化编辑 UI，同时保留原始文本、字段顺序、注释和换行风格。
- HTML Comment 可半透明显示或折叠，但保存原文。

关键要求：Live Preview 不生成整篇 Markdown，只对原文做局部 patch。

### 5.3 Preview Mode

只读渲染模式。用于阅读、导出前确认和分享效果检查。

Preview Mode 可以使用 HTML 渲染管线，不参与编辑真相。

## 6. 用户价值

### 6.1 对写作者

- 不再担心保存后原文格式被编辑器重写。
- 可以继续使用自己熟悉的 Markdown 风格。
- 所见即所得体验保留，降低写作干扰。

### 6.2 对开发者

- README、规范文档、开源项目文档不会被 MarkFlow 格式化成另一种风格。
- FrontMatter、注释、表格、代码块、链接引用等工程细节可靠保留。
- 大文件、长规范、生成式文档可正常打开和编辑。

### 6.3 对长期维护

- Markdown 引擎、编辑模型、搜索、历史、导出等长期资产沉淀在 Core。
- Tauri、Electron、Web、CLI 都可以复用 Core 能力。
- 未来插件系统可以在清晰边界上单独设计，而不需要重构文档内核。

## 7. 产品原则

### 7.1 Text Is Truth

Markdown 原文是唯一真相。任何 UI 状态、预览、导出、统计、大纲都从原文或 core 派生。

### 7.2 Preserve Before Beautify

默认保留用户原格式。格式化、规范化、重排必须是显式命令，不能作为保存副作用出现。

### 7.3 Local First

文档、资源、设置和内部扩展配置优先本地。MarkFlow 不要求云服务参与核心编辑。

### 7.4 Progressive Enhancement

大文件或未知语法下，编辑必须可用。高级渲染可以延迟、降级或禁用，但文本不能不可编辑。

### 7.5 Core Stable, UI Replaceable

核心能力不绑定具体前端框架。未来 UI 可以从 Vanilla TS 迁移到其他框架，Core 仍可复用。

### 7.6 Host Is Replaceable

Tauri 是第一个 Host Adapter，不是 MarkFlow 的应用边界。Core 不依赖 Tauri；UI 不把 Tauri command 当成业务模型；Host 只提供文件、窗口、剪贴板、菜单、权限等平台能力。

## 8. 核心功能范围

### 8.1 P0

- Core 文档会话：打开、编辑、保存、关闭。
- 原文保真：BOM、EOL、尾空行、未编辑区域 byte-for-byte 不变。
- 基础 Markdown 解析索引：标题、段落、列表、引用、代码块、表格、链接、图片。
- Render IR：供 UI 渲染 Live Preview 和 Preview。
- Text Patch API：所有编辑命令返回 patch。
- Source Mode 与 Live Preview 共享同一文本模型。
- 保存内容只来自 Core confirmed snapshot；Runtime 负责编排，Host 负责原子写入。
- 保真 fixture 测试集。

### 8.2 P1

- 所见即所得模式继续可用，并开始由 Core-backed Live Preview 承担主路径。
- 表格所见即所得编辑命令。
- FrontMatter 结构化编辑。
- 图片路径解析、复制、迁移、引用更新收拢到 Core。
- 大纲、字数、行列、诊断从 Core 输出。
- Mermaid/PlantUML 渲染收拢为内置 renderer。
- 大文件按大小分级，超过 1MB 进入 Large Document 策略。
- 跨平台输入法与快捷键测试矩阵。

### 8.3 P2

- 现有功能完全迁移与适配。
- 导出统一 IR。
- Host Adapter 边界稳定。
- 外部 CLI 或库模式：`markflow-core` 可脱离 Tauri 测试和复用。

## 9. 非目标

短期不追求：

- 完整替代 Pandoc。
- 多人实时协作。
- 同一文档多窗口实时同步；多窗口仍可独立打开并通过外部修改冲突保护数据。
- 云同步。
- 任意 Markdown 方言 100% 兼容。
- 在第一阶段移除全部 ProseMirror 代码。
- 本轮重构内实现第三方插件 SDK、动态插件加载或插件市场。
- 本轮交付 Web 或 Electron 产品；只要求 Core 和 Runtime 不封死这些入口。
- 首期支持所有历史文本编码；首期完整支持 UTF-8 与 UTF-8 BOM。
- 将任意复杂 YAML 都强制转换为结构化表单。
- 将像素列宽等非 Markdown 信息写入 GFM table。

### 9.1 首期兼容边界

| 能力 | 首期承诺 | 安全回退 |
| --- | --- | --- |
| 编码 | UTF-8、UTF-8 BOM | 非 UTF-8 或无效 UTF-8 只读打开或显式转码，不静默覆盖 |
| EOL | LF、CRLF、Mixed | 未编辑行逐行保留；新增行继承上下文 |
| FrontMatter | `---` YAML 顶层 mapping 与安全基础类型 | TOML/JSON、自定义 delimiter、duplicate key、anchor/tag、复杂 YAML、损坏语法回退源码 |
| 表格 | GFM pipe table | HTML table、非 GFM 或损坏 table 以源码显示 |
| 未知语法 | 保留、可编辑、可保存 | 不保证高级预览或结构化命令 |

## 10. 成功指标

### 10.1 保真指标

- 未编辑文件打开后立即保存，输出与输入 byte-for-byte 相同。
- 修改一个段落后，未触及区域 byte-for-byte 相同。
- Fixture 覆盖 FrontMatter、HTML Comment、CRLF、尾空行、marker、fence、table alignment。

### 10.2 性能指标

- M0 在统一基准机上冻结 p95 指标；指标不得以“可控”“流畅”等主观描述代替。
- 超过 1MB 的 Markdown 文件进入 Large Document 策略，按大小限制解析、渲染和诊断预算。
- 超过 10MB 进入 Huge 预算；仍保留 Source 与 WYSIWYG 入口。
- 输入延迟稳定，不因全文重新解析或重新渲染明显卡顿。
- 滚动时只渲染可视范围和邻近缓冲区。
- 保存不依赖整篇 ProseMirror serializer。

建议初始预算：

| 场景 | 进入可输入状态 p95 | 本地输入提交 p95 | Core patch ack p95 |
| --- | ---: | ---: | ---: |
| <= 1MB | <= 500ms | <= 16ms | <= 30ms |
| 10MB | <= 2s | <= 33ms | <= 50ms |
| 50MB | <= 5s | <= 50ms | <= 100ms |

如果 M0 基准测试证明指标不现实，必须记录测试机、实测值和调整理由。

### 10.3 体验指标

- Source Mode 与 Live Preview 切换不改变文档内容。
- 所见即所得编辑模式长期存在，且不依赖整篇 Markdown serializer 作为保存真相。
- 中文输入法 composition 不产生损坏 Markdown。
- 常用快捷键在三大平台行为一致。

## 11. 阶段计划与验收标准

### M0: Architecture Baseline

目标：确认重构边界，建立“Core 是产品内核，Host 是平台适配器”的共识。

范围：

- 明确最终分层：SolidJS UI、Editor Adapter、Core Bridge、markflow-runtime、markflow-core、Host Adapter、Platform。
- 明确 Tauri 只作为 Host Adapter。
- 明确 Markdown 原文是唯一真相。
- 明确所见即所得编辑模式必须长期保留。
- 明确插件系统不进入本轮实施范围，只保留内部扩展点。
- 完成 parser、buffer/position、IPC patch、FrontMatter lossless CST、`bekoedit-markdown` 对照验证五类技术 spike。
- 冻结现有功能迁移矩阵、性能基线和跨平台测试矩阵。
- 以 ADR 固化 Core/Runtime/Host、坐标、EOL、History owner 等决策。

验收标准：

- 产品方案与技术方案均写入 `docs/`。
- 文档中不再把 Tauri 描述为核心应用框架。
- OpenSpec proposal 可以直接引用本阶段文档作为背景。
- 团队确认首个实施阶段不重写 UI，而是先建立 Core Foundation。
- 五类 spike 有可运行代码或 benchmark 结果，不只给出调研结论。
- `bekoedit-markdown` 使用 MarkFlow lossless fixture 和 1/10/50MB fixture 完成差异测试，并通过 ADR 决定仅参考、引入依赖或维护 fork。
- `docs/markflow-core-stages/feature-migration-matrix.md` 覆盖当前 P0/P1 功能。
- Rust/TS 测试不依赖公网 DNS 或其他不确定外部状态。

### M1: Core Foundation

目标：建立 `markflow-core` 的最小可用文档内核，先证明“打开、保存、未编辑不变”。

范围：

- 新建 `markflow-core` crate 或先在 Rust 侧建立等价 core 模块。
- 实现 `DocumentSession`、`OriginalSnapshot`、`LineIndex`、`TextPatch` 基础模型。
- 支持打开 UTF-8 Markdown 文件，记录 BOM、逐行 EOL、尾空行、原始 hash。
- 建立 LF 逻辑文本、源字节、UTF-16 UI offset 之间的 PositionMap。
- 支持应用基础文本 patch。
- 支持从 confirmed session 生成 `SavePayload`，由 Runtime/Host 原子写入。
- 建立 lossless fixture 测试集。

验收标准：

- Fixture 中未编辑文件 open -> save 后 byte-for-byte 一致。
- 覆盖 LF、CRLF、尾空行、FrontMatter、HTML Comment、不同 list marker、不同 code fence、table alignment。
- 单段落编辑后，未触及区域 byte-for-byte 一致。
- Mixed EOL fixture 的未编辑行保持各自行尾。
- Core 单元测试可脱离 Tauri 运行。
- 当前应用功能不回退，旧 ProseMirror WYSIWYG 路径仍可作为兼容路径工作。

### M2: Parse Index, StyleMap and Large Document Policy

目标：Core 能理解 Markdown 基础结构、捕获原文风格，并建立按文件大小触发的大文件策略。

范围：

- 实现 block scanner：heading、paragraph、blockquote、list、task list、code fence、table、image、link reference、FrontMatter、HTML Comment。
- 输出 source range、block id、outline、基础 diagnostics。
- 建立 `StyleMap`：bullet marker、ordered marker、fence style、quote prefix、table alignment、EOL policy。
- 定义 Large Document 策略：Markdown 文件超过 1MB 时，解析、渲染、诊断进入预算模式。
- 与第三方 Markdown parser 做对照测试，但不暴露第三方 AST 为产品 API。

验收标准：

- Core 输出的大纲与当前可见文档标题一致。
- 每个 block 都能映射回原文 byte range。
- 对 fixture 中的 marker、fence、table alignment 能正确识别并记录。
- 超过 1MB 的 fixture 被识别为 Large Document。
- Large Document 默认不启动全量重型渲染和全量诊断。
- Parser 不改写文档内容。
- 解析失败或未知语法不会阻止文本编辑。

### M3: Core-backed Source Mode

目标：让 Source Mode 率先接入 Core session，保存内容不再来自前端 serializer。

范围：

- Tauri Bridge command 接入 Runtime session registry。
- 打开文件时创建 `DocumentSession`。
- CodeMirror 文本变更转换为 `TextPatch` 并提交给 Core。
- Editor Adapter 使用乐观镜像、patch batching、revision ack 和 resync 协议。
- Runtime 先 flush pending patch，再取得 Core `SavePayload`，最后调用 Host Adapter 原子写入。
- 保存前存在 pending patch 时必须先 flush；失败时不得写入前端镜像。
- 状态栏的行列、字数、大纲逐步从 Core 获取。
- 超过 1MB 的文档打开后进入 Large Document UI 状态。

验收标准：

- Source Mode 中编辑并保存，不经过 ProseMirror `getMarkdown()`。
- CRLF 文件保存后仍保持 CRLF。
- 尾部空行保存后保持数量。
- FrontMatter 和 HTML Comment 不被重排或删除。
- 超过 1MB 的文档仍可打开、输入、保存。
- revision mismatch 可以自动 resync，且不会静默覆盖任一侧修改。
- 旧 WYSIWYG 模式仍可打开和编辑普通文档。
- 保存冲突和外部修改检测继续可用。

### M4: SolidJS App Shell and Editor Adapter

目标：以增量替换方式迁移应用外壳到 SolidJS，并稳定 Editor Adapter 边界，为后续 WYSIWYG、表格、FrontMatter 适配减少重复工作。

范围：

- UI 外壳迁移到 SolidJS：Toolbar、Sidebar、File Tree、Outline、Statusbar、Settings、Toast、Context Menu。
- 采用 strangler/vertical slice 迁移；每个 slice 可独立回归，禁止一次性重写全部外壳。
- 建立独立 Editor Adapter TS 层，负责 CodeMirror lifecycle、selection/IME 映射、快捷键入口、Core patch 应用。
- Solid store 只保存 session id、revision、selection、viewport、panel state，不保存权威 Markdown。
- 现有功能保持完整迁移与适配，不因 UI 迁移丢功能。

验收标准：

- 现有文件树、设置、主题、状态栏、大纲、保存、冲突提示、导出入口仍可用。
- Solid store 不持有权威 Markdown 文本。
- Editor Adapter 与 UI 组件解耦。
- Source Mode Core 路径在 SolidJS UI 下继续可用。
- Windows、macOS、Linux 至少完成基础 smoke。

### M5: Core-backed WYSIWYG Editing MVP

目标：建立 Core-backed 所见即所得编辑模式，作为长期 WYSIWYG 的新主路径。

范围：

- Source Mode 与 WYSIWYG / Live Preview 共享同一个 CodeMirror document。
- Core 输出 Render IR。
- Editor Adapter 根据 Render IR 添加 decorations 和 block widgets。
- 首批支持标题、粗体、斜体、行内代码、链接、图片、列表、引用、代码块。
- 光标进入语法范围时显示原始 Markdown marker。
- 保留当前 ProseMirror WYSIWYG 作为过渡兼容路径，直到新 WYSIWYG 覆盖现有功能。

验收标准：

- Source Mode 与 WYSIWYG / Live Preview 来回切换，文档内容 byte-for-byte 不变。
- 标题、强调、列表、引用、代码块可以在新 WYSIWYG 中直接编辑。
- 图片能以 widget 方式预览，选中后能定位到原始 Markdown range。
- 代码 fence 样式不因切换模式改变。
- 新 WYSIWYG 不调用 ProseMirror serializer。
- 旧 WYSIWYG 仍可作为兼容路径访问，功能不回退。

### M6: Core Edit Commands, History and Existing Feature Migration

目标：将工具栏、快捷键、历史记录和现有编辑能力迁移到 Core/Editor Adapter，确保 Source Mode 与 WYSIWYG 行为一致。

范围：

- Core 提供 `ToggleStrong`、`ToggleEmphasis`、`ToggleStrikethrough`、`ToggleInlineCode`、`SetHeading`、`ToggleBlockQuote`、`ToggleList`、`InsertCodeFence` 等命令。
- 命令输出 `TextPatch` 和 `selection_after`。
- M6 退出时 Core 成为 undo/redo 单一 owner；CodeMirror 不保留可独立回放的第二套文档历史。
- Editor Adapter 负责 selection/IME 映射，不负责 Markdown 语义。
- 迁移现有工具栏、快捷键、图片插入、图表入口、链接编辑等编辑功能。

验收标准：

- 工具栏常用格式命令不依赖 ProseMirror command。
- 命令在 Source Mode 与 WYSIWYG 下结果一致。
- 在 `*` 列表中新增项沿用 `*`；在 `~~~` 上下文插入代码块优先沿用 `~~~`。
- 撤销/重做不会破坏 Core revision。
- undo/redo 前会 flush pending patch，IME composition 形成单一 transaction group。
- 中文输入法 composition 期间不会触发破坏性格式命令。
- 现有编辑功能完成迁移与适配，不出现功能缺口。

### M7: Tables, FrontMatter, Assets, Search and Diagnostics

目标：覆盖 MarkFlow 的专业编辑能力，特别是表格所见即所得和 FrontMatter 结构化编辑。

范围：

- 表格所见即所得编辑：插入行列、删除行列、更新单元格、列对齐、保持 Markdown table style。
- FrontMatter 结构化编辑：基于 lossless CST 做局部字段 patch；字段顺序、注释、空行、EOL 保持。
- 复杂或不安全 YAML 返回 `structured_edit_safe = false`，结构化 UI 自动回退源码。
- 图片路径解析、复制、迁移、相对路径生成收拢到 Core assets。
- 搜索索引进入 Core，支持超过 1MB 文档的分页搜索。
- Diagnostics 输出坏链接、缺失图片、重复标题、FrontMatter 问题、表格结构问题。
- Mermaid/PlantUML 渲染收拢为内置 renderer，不做插件系统。

验收标准：

- 表格可在 WYSIWYG 中直接编辑。
- 表格首期范围为 GFM pipe table；正确处理 escaped pipe、inline code 和空 cell。
- 单 cell 内容编辑只修改该 cell 的 content range；其余 pipe、padding、alignment marker 和换行逐字节不变。
- 行列结构或 alignment 操作最多重写当前 table block，不得改写 block 外字节，并保留未受影响 cell 的内容值和既有 marker 风格。
- FrontMatter 可通过结构化 UI 编辑，保存后保留原字段顺序、注释和换行风格。
- duplicate key、anchor/tag、复杂 block scalar 或损坏 YAML 不得被结构化 UI 静默重写。
- 图片迁移成功后 Markdown 引用按原有相对/绝对策略更新。
- 搜索结果能映射到 CodeMirror selection。
- Diagnostics 能按 viewport 或文档范围输出，不阻塞输入。
- 图表渲染失败不影响源码可读和可编辑。

### M8: Export IR, Host Portability and Full Migration

目标：完成导出统一、Host Adapter 边界稳定和现有功能全量迁移，移除旧 ProseMirror 保存真相链路。

范围：

- Core 输出 Export IR。
- HTML/PDF/DOCX 导出基于 Export IR 或 Render IR，而不是实时编辑 DOM。
- Tauri command 统一收敛为 Host Adapter 能力。
- CLI 形态可以复用 Core 做解析、检查、导出。
- 现有功能完成全量迁移与适配。
- 移除 `tiptap-markdown` 保存路径和 ProseMirror serializer 主路径。
- 旧路径删除前至少经过一个稳定发布观察周期，且功能迁移矩阵全部通过。
- 保留所见即所得编辑模式；移除的是旧编辑内核的文档真相职责，不是 WYSIWYG 产品能力。

验收标准：

- P0/P1 文档语义、编辑命令、历史、搜索、解析和 Export IR 由 Core 提供。
- session、同步、保存、资源和导出工作流由 Runtime 编排，平台副作用只经 Host Adapter。
- Editor Adapter/SolidJS 不持有第二份权威 Markdown。
- Source Mode 和 WYSIWYG 下导出结果一致。
- 项目中不存在“从 ProseMirror serializer 保存 Markdown”的主路径。
- Host Adapter 边界清晰，未来 Electron/Web/CLI 不需要重写 Core。
- Core 可通过非 Tauri 入口运行基础解析、搜索、检查和导出测试。
- Core Bridge DTO 有协议版本、稳定错误码、capabilities 和兼容测试。
- 跨平台 smoke 覆盖 Windows、macOS、Linux 的打开、编辑、保存、快捷键、输入法基础路径。

### 11.1 交付量级与并行方式

以下为 M0 前的工程量级估算，不是发布日期承诺：

| 阶段 | 估算 | 可并行工作 |
| --- | ---: | --- |
| M0 | 2-3 人周 | 五类 spike、功能盘点、基准测试 |
| M1 | 3-5 人周 | Core model、fixture、property test |
| M2 | 4-6 人周 | parser/index、StyleMap、benchmark |
| M3 | 4-7 人周 | Runtime、IPC、Adapter、save/conflict E2E |
| M4 | 6-10 人周 | Solid vertical slices、Host/App Services 收敛 |
| M5 | 8-12 人周 | Render IR、Live Preview、widget、IME/selection |
| M6 | 6-10 人周 | commands、Core History、功能迁移 |
| M7 | 12-18 人周 | 表格、FrontMatter、Assets、Search/Diagnostics |
| M8 | 6-10 人周 | Export IR、Host contract、观察期和旧链路移除 |

总量级约 51-81 人周。三名能分别覆盖 Rust Core、Editor Adapter/UI、QA/平台的核心开发者，在依赖顺利且避免并行改同一编辑链路的情况下，约为 6-10 个自然月。M0 结束后必须基于 spike 和功能矩阵重新估算。

M7 和 M8 使用独立子里程碑，避免大阶段长期不可发布：

- M7A：GFM Table。
- M7B：FrontMatter。
- M7C：Assets transaction。
- M7D：Search、Diagnostics、Diagram renderer。
- M8A：Export IR。
- M8B：Host/Bridge contract。
- M8C：稳定观察期与 Legacy Removal。

每个子里程碑独立通过验收，不要求等整个 M7/M8 完成后一次发布。

## 12. 阶段推进原则

- 先 Core，后所见即所得重建。当前 WYSIWYG 在迁移期保留，避免用户体验断档。
- SolidJS 放在 M4：Source Mode Core 路径稳定后迁 UI 外壳，WYSIWYG 和高级功能随后接在新 Adapter 上。
- 先保真，后美化。WYSIWYG 的视觉完善不能牺牲原文稳定性。
- 插件系统本轮不做。所有图表、FrontMatter、表格、导出先作为内置能力或内部 provider。
- 大文件按大小触发策略：超过 1MB 进入 Large Document 模式。
- 每个阶段必须有可重复 fixture 或 e2e 验收，不能只靠人工体验判断。
- 每个阶段使用 Go / No-Go 门禁；未达到数据保真、revision 一致性或功能矩阵要求时不得进入下一阶段。
- 新旧引擎允许 shadow compare，不允许同时写盘。
- 旧 serializer 删除前必须经过稳定观察期和跨平台 release gate。
- 每个阶段或子里程碑使用独立 Issue、分支和 OpenSpec change；不创建覆盖 M0-M8 的单一巨型 change。
- 每个合入点按项目规则完成独立 agent 复核、自动化测试和回退说明。

### 12.1 灰度与回退

每个文档 session 明确记录 `legacy-prosemirror`、`core-source` 或 `core-live-preview` engine：

- 同一时刻只有一个保存 owner。
- 允许新旧 parser 做 shadow compare，不允许两条路径同时写盘。
- 新引擎按开发开关、文档或用户逐步灰度。
- 回退旧 WYSIWYG 前，必须从 Core confirmed snapshot 重新加载。
- revision mismatch、resync、fallback、parse/render latency 只记录脱敏本地诊断，不记录正文和 FrontMatter 值。

## 13. 已确认决策

- 插件系统先不做，只保留内部扩展点。
- 所见即所得编辑模式必须长期支持。
- 超过 1MB 的 Markdown 文档进入 Large Document 策略。
- FrontMatter 需要支持结构化编辑。
- 表格需要支持所见即所得编辑。
- SolidJS 放在 M4，位于 Core-backed Source Mode 之后、Core-backed WYSIWYG 之前。
- 现有功能必须完整迁移与适配，不接受重构后功能缺口。
