# MarkFlow Core 二期：Typora 级所见即所得编辑器建设计划

> 状态：提案完成，待实施
> Issue：#247
> 方案评审 Issue：#250
> OpenSpec charter：`archive/2026-07-31-typora-grade-live-preview-phase2`
> 目标分支：`feat/issue-247-typora-grade-live-preview`
> 文档日期：2026-07-31

## 文档导航

本文件是二期建设总纲。实施前还必须阅读：

- [方案 Review 与可行性分析](./01-review-and-feasibility.md)
- [多阶段详细实施计划](./02-multi-stage-implementation-plan.md)
- [验收标准与人工验收手册](./03-acceptance-and-manual-test-plan.md)
- [OpenSpec 任务与能力追踪矩阵](./04-traceability-matrix.md)

评审结论为“有条件可行”：现有 Core 文档真相、revision、patch、History、模型与
CodeMirror 投影基础足以支撑二期，但 parser/source-map 选型、单一 History 的 pending
transaction 协议、IME 前置门禁、P0 widget 范围和发布证据环境必须在对应阶段开工前冻结。
二期不得作为一个 119 项任务的单分支直接实施。

## 1. 执行摘要

MarkFlow Core 一期已经完成文档真相、patch、revision、保存、导出和 Host 边界重构，但现有 Core-backed WYSIWYG 只具备基础 Markdown Live Preview。真实桌面验收仍可能显示源码，工具栏、快捷键、History、IME、结构化块和视觉测试也没有形成完整产品闭环。

二期不推翻 `markflow-core`，也不恢复 ProseMirror serializer。二期建设的核心是：

```text
markflow-core
  = 唯一 Markdown 文档真相、语义模型、命令、History、保存输入

CodeMirror
  = 唯一可编辑文本视图、selection、viewport、IME、输入镜像

Editor Adapter
  = Typora 级投影、marker folding/reveal、widgets、状态协调
```

最终产品提供两个同等可靠的模式：

- 所见即所得模式：支持语法 marker 隐藏、活动上下文揭示、结构化块编辑和自然输入。
- 源码模式：完整 Markdown、行号、语法高亮、折叠、搜索替换和精确文本控制。

两种模式共享同一个 CodeMirror EditorView、Core session、document、selection、History、patch pipeline 和保存路径。

## 2. 一期成果与二期起点

### 2.1 一期可复用能力

- Core session、document identity、revision 和 confirmed snapshot。
- UTF-8 byte offset 与 UTF-16 UI range 转换。
- CodeMirror patch batching、ack、flush、resync 和 backpressure。
- Runtime save、FileIdentity、atomic write、conflict gate 和 Host context。
- ParseIndex、StyleMap、基础 Render IR、Export IR 和 diagnostics。
- Core edit commands、Undo/Redo 和 History 基础。
- GFM table model、FrontMatter model、image transaction、diagram targets。
- Source/WYSIWYG byte-preserving 和 serializer removal 基础。

### 2.2 当前产品缺口

- Tauri direct command 参数 naming 未通过真实 dispatcher contract test。
- Render 失败静默显示源码，状态栏仍可能显示 WYSIWYG。
- marker 仅设置透明度，没有 replace、fold 和 atomic range。
- Source/WYSIWYG 销毁和重建 CodeMirror，不是同一编辑视图。
- 工具栏和快捷键可能依据 `mode === source` 错误回落到隐藏 ProseMirror。
- patch ack 不主动驱动 projection refresh。
- 旧 Render IR range 可能在文本变化后继续参与 decoration 构建。
- Render IR 缺少嵌套、block markers、表格、FrontMatter、HTML 和完整 inline 语义。
- 当前 inline parser 不能覆盖完整 CommonMark/GFM。
- CodeMirror 和 Core 存在双 History 风险。
- IME、clipboard、selection、widgets 和自然编辑行为未闭环。
- E2E 只验证文本存在，没有验证真实渲染语义，也未进入 required CI。
- 架构完成、产品体验完成和发布完成曾被混为同一状态。

## 3. 产品愿景

### 3.1 所见即所得体验

用户阅读文档时看到接近最终排版的内容；编辑某个结构时，只揭示完成编辑所需的局部 Markdown。

| 内容 | 非活动状态 | 活动状态 |
| --- | --- | --- |
| 标题 | 隐藏 `#`，显示标题排版 | 揭示当前标题 prefix |
| 粗体、斜体、删除线 | 隐藏 delimiter | 揭示当前 inline delimiter |
| 行内代码 | 显示代码样式 | 揭示反引号 |
| 链接 | 仅显示 label | 显示 destination 编辑入口 |
| 引用 | 显示 quote rail | 揭示当前行 `>` |
| 列表 | 显示 bullet/number | 揭示当前 item marker |
| Task List | 显示 checkbox | 可切换并揭示 source |
| 代码块 | 隐藏 fence，显示语言和高亮 | 编辑 code，按需揭示 fence |
| 图片 | 图片替换源码 | 选中后编辑、替换或揭示源码 |
| 表格 | 可导航 grid | 编辑 cell/row/column/alignment |
| FrontMatter | 摘要或结构化表单 | 表单或 block source submode |
| Mermaid/PlantUML | 安全预览 | 编辑源码、刷新和诊断 |
| HTML comment | 折叠提示 | 揭示 source |
| unknown/unsafe | 精确源码 fallback | 直接编辑源码 |

### 3.2 源码模式

源码模式必须是完整产品能力，而不是降级后的只读视图：

- 完整 Markdown 文本。
- 行号、当前行、语法高亮。
- bracket matching、folding。
- search/replace。
- precise selection 和 multi-cursor。
- soft wrap、字体和代码高亮设置。
- 所有 Core commands、History、save、diagnostics、outline 和 export。
- 结构化 widget 的精确 source reveal。

### 3.3 不变量

- Markdown 文本是唯一文档真相。
- 未编辑内容不得被 serializer 或 formatter 重写。
- Source/WYSIWYG 切换不得改变字节。
- Mode、projection、widget 和 diagnostics 不是保存输入。
- 所有用户编辑最终进入 Core patch 或 semantic command。
- Core/Render 失败时，用户仍能编辑和进入 Source Mode。
- Unknown syntax 不阻止打开、输入、保存和导出安全 fallback。

## 4. 总体架构

```text
┌───────────────────────────────────────────────────────────────┐
│ Host: filesystem, dialogs, clipboard, network, windows        │
└──────────────────────────────┬────────────────────────────────┘
                               │ scoped capability
┌──────────────────────────────▼────────────────────────────────┐
│ Runtime: session, patch, save, conflict, cancellation         │
└──────────────────────────────┬────────────────────────────────┘
                               │ confirmed revision
┌──────────────────────────────▼────────────────────────────────┐
│ markflow-core                                                  │
│ text + concrete syntax + ParseIndex + StyleMap                 │
│ commands + History + models + Render IR v2 + Export IR         │
└──────────────────────────────┬────────────────────────────────┘
                               │ patch/ack/render
┌──────────────────────────────▼────────────────────────────────┐
│ EditorSurfaceBinding                                          │
│ CodeMirror document + selection + viewport + composition      │
│ Source extensions | Live Preview extensions                   │
└──────────────────────────────┬────────────────────────────────┘
                               │ descriptors
┌──────────────────────────────▼────────────────────────────────┐
│ Editor Adapter + Structured Widgets                           │
│ projection, folding, reveal, table, image, code, form, diagram│
└───────────────────────────────────────────────────────────────┘
```

## 5. 核心技术设计

### 5.1 单一 CodeMirror EditorView

每个活动文档只创建一个 EditorView。模式通过 compartments 重配置：

```text
base: theme, font, read-only, update listener
input: Core command keymap, composition, clipboard
source: line numbers, full syntax, source folding, search
preview: semantic decorations, marker replacement, widgets
```

模式切换不调用：

- `view.destroy()`；
- document replace；
- serializer；
- ProseMirror `setContent`；
- whole-document sync。

切换时保留：

- document 和 revision；
- selection 和 focus；
- scroll anchor 和 viewport；
- pending patches；
- dirty state；
- History depth；
- widget/source anchor。

### 5.2 双层投影

本地 optimistic projection：

- 使用 CodeMirror Markdown/Lezer syntax tree。
- 同一 UI turn 内响应输入。
- 只处理可安全确定的 token 和 composition 邻域。
- 不提交结构化语义，也不成为 document truth。

Core confirmed projection：

- 使用生产 semantic parser 和 Render IR v2。
- 提供完整 marker/content/source ranges。
- 提供 table/frontmatter/image/diagram descriptors。
- 绑定 session、document、revision、request、source hash。
- 只在 identity 全部匹配时应用。

### 5.3 Production Markdown concrete syntax

R0 比较：

- `markdown-rs`；
- `pulldown-cmark`；
- tree-sitter Markdown；
- existing ParseIndex + concrete syntax layer。

选择标准：

- CommonMark/GFM coverage；
- exact source range；
- nested and malformed syntax；
- delimiter/trivia/EOL preservation；
- incremental/viewport ability；
- 1/10/50 MiB performance；
- dependency health、license、binary size；
- unknown fallback。

任何 candidate 若只能通过 serializer 重建 Markdown，则不可采用。

### 5.4 Render IR v2

Render IR v2 至少包含：

- schema version；
- session/document/revision/request；
- source hash 和 viewport；
- nested block identity；
- source/content/marker ranges；
- semantic tokens；
- StyleMap metadata；
- widget descriptor；
- invalidated ranges；
- fallback reason；
- size class。

所有 UI range 使用 revision-bound UTF-16；Core 内部保持 byte offset。

### 5.5 Projection state machine

```text
idle -> loading -> optimistic -> rendered
                     │             │
                     └-> composing-┘

loading/optimistic/rendered -> stale -> loading
loading/optimistic/rendered -> degraded -> loading/rendered
```

degraded 必须：

- 保留 text 和输入。
- 移除不安全旧 projection。
- 显示稳定错误。
- 提供 retry 和 Source Mode。
- 记录无文档内容的结构化日志。
- 不静默模拟 WYSIWYG 成功。

### 5.6 Ack-driven render refresh

```text
CM transaction
  -> patch batch
  -> Core ack revision N
  -> revisionConfirmedEffect
  -> invalidate/map old projection
  -> Render IR request N
  -> identity check
  -> apply confirmed projection
```

render refresh 不得依赖下一次键入、selection 或 scroll。

### 5.7 Marker folding/reveal

实现手段：

- `Decoration.mark`：semantic style。
- `Decoration.replace`：隐藏 marker 或替换 source。
- folding：隐藏大范围 fence/metadata。
- atomic ranges：保护光标和删除行为。
- transaction mapping：跟随 doc changes。
- active context plugin：cursor、selection、composition。
- input handler：Enter、Backspace、Delete、Tab。

composition range 及邻近 delimiter 不得被 replace。

### 5.8 Command Router 和 History

所有入口统一：

```text
toolbar / menu / shortcut / widget / input rule
  -> active EditorSurfaceBinding
  -> CodeMirror selection
  -> Core command
  -> patch + selectionAfter + History metadata
  -> CodeMirror transaction
```

禁止使用 `mode === source` 判断是否走 Core。只要 active surface 是 Core surface，Source 和 WYSIWYG 都走同一路径。

CodeMirror 独立 History 从产品配置移除。History group 包含：

- typing burst；
- IME composition；
- paste/drop；
- semantic formatting；
- structured block command；
- asset transaction；
- FrontMatter command；
- diagram source commit。

### 5.9 IME 和输入完整性

compositionstart：

- 创建 compositionId。
- 记录 source range。
- 冻结相交 marker replacement。

compositionupdate：

- 更新 optimistic mirror。
- 不等待 IPC。
- 不应用冲突 confirmed projection。

compositionend：

- 生成单一 Core transaction。
- 创建一个 History group。
- ack 后重新 reconcile projection。

必须覆盖：

- 中文拼音；
- 日文；
- 韩文；
- emoji/surrogate pair；
- combining marks；
- RTL；
- inline syntax；
- list/table/code/widget 边界。

### 5.10 Selection 和 Clipboard

Clipboard MIME：

```text
application/x-markflow-markdown
text/html
text/plain
Files
```

Copy：

- internal Markdown 保存 exact source。
- HTML 使用 sanitized semantic output。
- plain text 使用用户可见内容。
- 不重复 hidden marker 或 accessibility fallback。

Paste：

- internal Markdown 优先。
- external HTML 经过 sanitizer 和 deterministic Markdown conversion。
- files/images 进入 asset transaction。
- plain text 保持文本。

Selection 必须跨 marker fold、inline、widget、多个 block 和模式切换保持可预测。

## 6. Structured Widgets

### 6.1 统一协议

每个 widget 必须绑定：

```text
sessionId + documentId + revision + blockId + sourceRange
```

统一生命周期：

- mount；
- update；
- focus；
- commit Core command；
- cancel；
- reveal source；
- destroy。

draft 只属于 widget interaction，不是 document truth。identity 变化时 draft 必须取消或明确迁移。

### 6.2 GFM Table

- Core 提供 row/cell identity、range、alignment、StyleMap。
- frontend 不重新 split pipes。
- cell edit 只 patch cell content。
- structural command 可重写 table block。
- Tab、Shift+Tab、arrows、Enter、Escape 完整。
- malformed/unsupported table 使用 source fallback。

### 6.3 Image

- Host 解析 safe asset URL。
- 相对路径绑定 active document。
- resource transaction prepare/commit/rollback。
- preview、broken state、alt/title/path。
- replace、copy、delete、retry、open location、source reveal。
- local/network/security policy 保持。

### 6.4 Task List

- checkbox widget 可键盘操作。
- toggle 走 Core command。
- 保留 marker case 和 spacing。
- Undo 恢复状态和 focus。

### 6.5 Code Fence

- fence 隐藏。
- code content 仍位于 CodeMirror document。
- language selector 走 Core command。
- lazy language highlighting。
- 保留 fence char/length/indent/info/EOL/trailing newline。
- empty trailing line 退出行为确定。

### 6.6 FrontMatter

- safe model 显示 typed form。
- nested fields、arrays、dates、booleans、numbers。
- field command 局部 patch。
- comments、quotes、order、indent、EOL 保留。
- unsafe model 显示 diagnostics 和 source。

### 6.7 Mermaid/PlantUML

- sandbox、timeout、cancel。
- revision-bound result routing。
- preview、error、refresh、copy/export、source reveal。
- large document lazy rendering。

### 6.8 HTML

- HTML comment 默认折叠。
- raw HTML 默认 inert。
- 若启用 preview，必须 sandbox。
- script、event handler、unsafe URL 不执行。

## 7. 分阶段实施计划

### R0：正确性和证据重置

交付：

- parser spike 和 ADR。
- canonical fixtures。
- Tauri naming fix 和真实 invoke tests。
- projection state/degraded UI。
- Core WYSIWYG command routing。
- ack-driven refresh。
- stale decoration removal。
- architecture/product capability matrix。
- direct Tauri args camelCase wire convention。
- release-gate ADR 和 performance/visual/IME/widget/observation manifests。
- 现有 WYSIWYG toolbar/shortcut/menu/Undo/Redo 路由止血修复。

退出条件：

- Render IR、flush、save、close 在真实桌面成功。
- 日志无 missing argument、save failure、session leak。
- render failure 可见且可恢复。
- Source Mode 始终安全可用。

### R1：单一编辑视图和单一 History

交付：

- EditorSurfaceBinding。
- compartments。
- Source/WYSIWYG reconfigure。
- EditorCommandRouter。
- Core single History。
- stable selectionAfter。

退出条件：

- 100 次模式切换不改变 bytes、selection、scroll、dirty、History。
- 两个模式下 toolbar/shortcut/menu 结果一致。
- Undo/Redo 跨模式一致。
- 不调用隐藏 ProseMirror。

### R2：Render IR v2 和基础 Typora 投影

交付：

- production concrete syntax。
- Render IR v2。
- optimistic + confirmed reconciliation。
- heading/inline/link/quote/list/task/code/thematic marker folding。
- atomic ranges 和自然 cursor。
- per-construct composition-neighborhood 和 selection mapping fixtures。

退出条件：

- 支持语法非活动 marker 可见数量为零。
- active context 正确 reveal。
- doc edit 后 confirmed projection 自动刷新。
- selection/copy/source reveal 无错位。
- 任一 folding construct 在 composition/selection fixture 通过前保持实验、默认关闭。

### R3：结构化块

交付：

- table、image、task、code、FrontMatter、diagram、HTML widgets。
- Core commands 和 asset transactions。
- keyboard/focus/accessibility。

退出条件：

- 每个 widget 可进入、编辑、提交、取消、Undo、退出和 reveal source。
- unsupported/unsafe model lossless fallback。
- A/B session 和 stale result 隔离。

### R4：输入、性能、安全和无障碍

交付：

- composition transaction。
- clipboard/drag-drop。
- Enter/Backspace/Delete/Tab rules。
- 1/10/50 MiB budget。
- security regression。
- accessibility smoke。

退出条件：

- CJK IME 无丢字、重复、重排。
- composition 一次 Undo。
- copy/paste representations 正确。
- performance budgets 全部通过。
- raw HTML/SVG/URL/path/diagram 安全 gate 通过。

### R5：真实产品发布和 legacy cleanup

交付：

- required desktop E2E。
- visual regression。
- macOS/Windows/Linux smoke。
- current-build observation。
- ProseMirror/Tiptap cleanup。
- final docs/spec sync/archive。

退出条件：

- 所有 P0/P1 有自动、GUI、visual、IME、platform、observation evidence。
- 独立 agent 复核通过。
- 无 required task deferred 或 unverified。
- legacy dependency removal 后全 gate 通过。

## 8. 验收标准

### 8.1 功能验收

- Source 和 WYSIWYG 都可打开、编辑、保存、导出。
- WYSIWYG 支持标题、inline、link、quote、list、task、code、table、image、FrontMatter、diagram。
- unknown/unsafe syntax exact source fallback。
- toolbar、shortcut、menu、widget command 一致。
- Source reveal 精确定位。

### 8.2 数据完整性

- 无编辑模式往返 byte-for-byte。
- 未影响范围 byte-for-byte。
- EOL、BOM、trailing newline、fence、StyleMap 保留。
- save 只使用 Core confirmed document。
- stale result 不修改当前 session。
- asset transaction 失败不留下不存在的引用。

### 8.3 视觉验收

- 支持语法 inactive marker 数量为零。
- active range 只揭示最小 source。
- light/dark baseline 通过。
- cursor movement 不导致 unrelated layout jump。
- 200% zoom 无 overlap/clipping。
- degraded 明确可见。

### 8.4 输入验收

- CJK IME 1,000 次连续 fixture 无丢字。
- emoji/surrogate/combining mark 正确。
- Enter/Backspace/Delete/Tab 按规范。
- composition 一个 Undo group。
- selection 跨 fold/widget 正确。
- copy/paste MIME 正确。

### 8.5 性能验收

- local input commit p95 `<= 16 ms`。
- normal projection p95 `<= 50 ms`。
- large projection p95 `<= 100 ms`。
- mode reconfigure p95 `<= 50 ms`。
- `>1 MiB` 不全文创建 widgets。
- `10 MiB` 可输入、滚动、保存、切 Source。
- async widget 无 unbounded layout shift。
- 基准 manifest 固定 reference hardware/software、build profile、fixture、测量边界、warm-up、样本数、重复次数和噪声策略。

### 8.6 安全验收

- raw HTML script 不执行。
- SVG event handler 不执行。
- `javascript:`/unsafe data URL 拒绝。
- asset path traversal/symlink escape 拒绝。
- diagram sandbox/timeout/cancel。
- oversized widget payload 有界。
- logs 不记录文档内容和 secrets。

### 8.7 无障碍验收

- keyboard-only 完成所有 widget workflow。
- focus 不被 widget trap。
- accessible names/roles 正确。
- screen reader 不重复朗读 hidden marker。
- Source Mode 始终可达。
- high contrast/reduced motion 支持。

## 9. 测试与 CI 门禁

### 9.1 Core

- parser conformance。
- source/content/marker ranges。
- nested/malformed syntax。
- StyleMap。
- commands/History。
- Unicode/UTF-16。
- table/frontmatter/image/diagram models。
- large document benchmarks。

### 9.2 Adapter

- optimistic/confirmed reconciliation。
- ack refresh。
- stale decoration。
- marker replace/reveal。
- atomic ranges。
- mode reconfigure。
- composition。
- selection/clipboard。
- widget lifecycle。

### 9.3 Bridge

- real Tauri dispatcher invoke。
- all command casing。
- DTO version。
- stable errors。
- cancel/stale/session/window routing。

### 9.4 Desktop E2E

- canonical WYSIWYG fixture。
- semantic DOM/widget assertions。
- visible marker assertions。
- commands/History。
- save disk bytes。
- A/B document。
- degraded recovery。
- logs fail suite。

### 9.5 Visual

- light/dark。
- inactive/active/composing。
- selection。
- every widget。
- Source Mode。
- degraded state。
- reviewed expected/current/diff artifacts。
- manifest 固定 OS/WebView/font/theme/scale/viewport/animation/pixel threshold/changed-pixel ratio/masks。

### 9.6 Platform

- macOS：Chinese IME、GUI、widgets、save/export。
- Windows：IME、GUI、widgets、save/export。
- Linux：GUI、widgets、save/export。
- stability observation：current implementation logs。
- observation：同一 release candidate 连续 7 天、累计 20 小时，每个平台每个 canonical workflow 至少 3 次。

## 10. Required Gate

通用 gate：

```bash
npm audit --omit=dev --audit-level=high
npm test
npx tsc --noEmit
scripts/check-capabilities.sh
npm run validate:openspec
bash scripts/check-archive-synced.sh
npm run build
bash scripts/check-bundle-size.sh
```

Rust/Tauri：

```bash
(cd src-tauri && cargo test)
(cd src-tauri && cargo fmt --all -- --check)
(cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings)
```

Core：

```bash
(cd markflow-core && cargo test)
(cd markflow-core && cargo clippy --all-targets -- -D warnings)
```

二期新增 required gate：

```bash
npm run test:e2e
npm run test:e2e:regression
# visual regression command 由 R0 ADR 固定
# performance benchmark command 由 R0 ADR 固定
```

GUI、visual、IME、platform、observation gate 不能因为 CI 环境不足被勾选；必须保持 blocker。

## 11. 发布与回滚

### 11.1 Feature flags

按 construct 控制：

- Render IR v2。
- single EditorView。
- marker folding。
- table widget。
- image widget。
- FrontMatter widget。
- diagram widget。
- raw HTML policy。

flag 只能回退到 exact source projection，不得回退 serializer save 或 DOM truth。

### 11.2 Rollback

- R0/R1：Source Mode default，关闭 preview。
- R2：按 construct 回退 source。
- R3：按 block 回退 source。
- R4：关闭危险 projection，保留 text/save。
- R5：回滚发布 artifact，不恢复 ProseMirror truth。

### 11.3 Legacy removal

只有 R5 完成后删除：

- hidden ProseMirror shell；
- Tiptap/ProseMirror dependencies；
- old extensions/plugins/state；
- legacy command fallback；
- editor-only legacy CSS。

Export 若继续使用 `.ProseMirror` class 作为输出 CSS namespace，应先重命名为中性 export root，不能误删有效 export style。

## 12. 风险管理

| 风险 | 控制 |
| --- | --- |
| parser 不 lossless | semantic parser + concrete source map，round-trip gate |
| local/Core projection 分歧 | local 仅 optimistic，Core identity match 后确认 |
| marker folding 破坏 IME | composition-aware freeze，per-construct gate |
| single History 感知延迟 | optimistic transaction + Core transaction identity |
| widget 成为第二 truth | draft revision-bound，commit only through Core |
| async layout shift | stable dimensions、visible-only result |
| IR v2 payload 增大 | viewport、delta invalidation、cancel、benchmark |
| huge document widget 成本 | lazy/opt-in/degraded，Source 保留 |
| platform IME 差异 | required platform evidence |
| visual baseline 噪声 | pin font/theme/scale/viewport/animation |
| 再次错误归档 | machine-readable evidence + archive blocker |

## 13. 项目治理

- 已归档的 `typora-grade-live-preview-phase2` 是二期 program charter，不直接作为单一实施分支执行。
- R0 开始前将 R0-R5 拆为 child Issue、branch 和 OpenSpec change；每个 requirement/task ID 只归属一个 child，实施证据写入 child change。
- 已归档 umbrella checklist 只作为 WBS；实施状态写入独立 tracking 文档，不能回写 archive。
- 每个里程碑建立真实 GitHub Issue、独立分支和 OpenSpec change。
- proposal/apply 前必须先创建分支。
- 每个 capability 的状态分为：未开始、实现中、自动验证、GUI 验证、平台验证、已验收。
- “架构已完成”不得自动推出“产品已验收”。
- 未执行的 required gate 必须标记 blocker。
- archive 前先 sync specs。
- archive/merge 前必须独立 agent 静态复核并执行 `npm test`、`npx tsc --noEmit` 和相关 GUI gate。
- 归档结果必须与 feature 分支一起进入 PR。

## 14. 交付物

- Parser ADR 和 comparison report。
- Canonical Markdown/IME/large-document fixtures。
- Render IR v2 protocol 和 DTO。
- Single EditorSurfaceBinding。
- Typora Live Preview extensions。
- EditorCommandRouter 和 Core single History。
- Structured widgets。
- Desktop E2E 和 visual baselines。
- Performance/security/accessibility reports。
- Platform smoke evidence。
- Updated capability matrix。
- ProseMirror/Tiptap removal report。
- Synced OpenSpec main specs 和 archived changes。

## 15. 完成定义

只有同时满足以下条件，二期才能标记完成：

1. 支持语法在 WYSIWYG 非活动区域不显示 Markdown marker。
2. Source/WYSIWYG 共享同一 EditorView、Core session 和 History。
3. 所有编辑命令、IME、selection、clipboard、widgets 和 save 通过 Core。
4. Table、Image、Task、Code、FrontMatter、Diagram 达到结构化编辑验收。
5. Unknown 和 unsafe syntax lossless source fallback。
6. 数据完整性、性能、安全和无障碍指标通过。
7. Required desktop E2E 和 visual regression 通过。
8. macOS、Windows、Linux smoke 通过。
9. 当前实现的稳定观察期通过。
10. 独立 agent 复核无阻塞。
11. ProseMirror/Tiptap 产品依赖清理后全 gate 仍通过。
12. Specs 已同步并通过 archive sync gate。

任何一项未满足，都只能描述为“二期实施中”，不得描述为“Typora 级所见即所得已完成”。

## 16. OpenSpec 文档

- [Proposal](../../openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2/proposal.md)
- [Technical Design](../../openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2/design.md)
- [Implementation Tasks](../../openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2/tasks.md)
- [Delta Specifications](../../openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2/specs/)
