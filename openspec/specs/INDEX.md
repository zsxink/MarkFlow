# MarkFlow Agent 手册

本目录是 MarkFlow 的行为约束库。开始改代码前，先从下表定位任务，再阅读列出的模块规范；涉及全局边界时补读“产品与架构参考”。代码和测试是当前实现事实，规范定义需要保持的行为：两者不一致时，先确认预期再修改任一方。

## 快速任务路由

| 常见任务 | 必读模块规范 | 代码入口 | 最低验证 |
|---|---|---|---|
| 打开、保存、另存为、外部修改或文件冲突 | [sidebar](sidebar/spec.md)、[active-document-state](active-document-state/spec.md)、[autosave-reliability](autosave-reliability/spec.md)、[atomic-save](atomic-save/spec.md) | `src/components/sidebar.ts`、`sidebar.fileops.ts`、`sidebar.conflict.ts`、`src/lib/editor.state.ts`、`storage.ts` | `npm test`、`npm run build` |
| 文件树、工作区、监听、拖放或大目录 | [file-tree-architecture](file-tree-architecture/spec.md)、[background-task-lifecycle](background-task-lifecycle/spec.md)、[active-document-state](active-document-state/spec.md)、[safe-dom-construction](safe-dom-construction/spec.md) | `src/components/fileTree.ts`、`fileTree.core.ts`、`fileTree.state.ts`、`fileTree.dragdrop.ts` | `npm test`、`npm run benchmark:file-tree`（性能改动） |
| 所见即所得编辑、Markdown 完整性、模式切换或 URL | [enter-content-integrity](enter-content-integrity/spec.md)、[url-decoration](url-decoration/spec.md)、[editor-bottom-spacer](editor-bottom-spacer/spec.md)、[keyboard-shortcuts](keyboard-shortcuts/spec.md)、[frontmatter-visual-editor](frontmatter-visual-editor/spec.md) | `src/lib/editor.ts`、`editor.init.ts`、`editor.state.ts`、`urlDecorationPlugin.ts` | `npm test`、`npm run build` |
| 源码编辑器、语言高亮或大文档降级 | [codemirror-source-editor](codemirror-source-editor/spec.md)、[lazy-code-languages](lazy-code-languages/spec.md)、[document-size-tier](document-size-tier/spec.md)、[expensive-task-scheduling](expensive-task-scheduling/spec.md)、[frontmatter-visual-editor](frontmatter-visual-editor/spec.md) | `src/lib/editor.source.ts`、`codemirror-languages.ts`、`codemirror-highlight-limit.ts`、`fileSizeTier.ts`、`src/components/degradationBar.ts` | `npm test`、`npm run build` |
| 菜单、对话框、状态栏或工具栏交互 | [dialog-system](dialog-system/spec.md)、[context-menu](context-menu/spec.md)、[statusbar](statusbar/spec.md)、[keyboard-shortcuts](keyboard-shortcuts/spec.md)、[safe-dom-construction](safe-dom-construction/spec.md) | `src/components/ui/dialog.ts`、`ui/modal.ts`、`contextMenu.ts`、`toolbar.ts`、`statusbar.ts` | `npm test`、`npm run build` |
| 导出 HTML、Word 或 PDF | [rendered-document-export](rendered-document-export/spec.md)、[export-workspace-bypass](export-workspace-bypass/spec.md)、[safe-dom-construction](safe-dom-construction/spec.md) | `src/components/toolbar.ts`、`src/lib/documentExport.ts`、`storage.ts` | `npm test`、`npm run build` |
| 图片设置、存储规则、粘贴命名或首次保存 | [image-storage-engine](image-storage-engine/spec.md)、[image-naming](image-naming/spec.md)、[image-streaming](image-streaming/spec.md)、[settings-code-highlight](settings-code-highlight/spec.md) | `src/lib/imageUtils.ts`、`pathUtils.ts`、`storage.ts`、`src-tauri/src/commands/files_image.rs` | `npm test`、`cargo test` |
| 粘贴图片、网络图片或图表渲染 | [image-naming](image-naming/spec.md)、[image-streaming](image-streaming/spec.md)、[image-storage-engine](image-storage-engine/spec.md)、[safe-http-fetch](safe-http-fetch/spec.md)、[lazy-mermaid](lazy-mermaid/spec.md)、[plantuml-render](plantuml-render/spec.md) | `src/lib/editor.image.*.ts`、`imageUtils.ts`、`mermaid-lazy.ts`、`plantuml-lazy.ts` | `npm test`、`npm run build` |
| 类型、错误、日志、后台任务或安全边界 | [type-system](type-system/spec.md)、[error-handling](error-handling/spec.md)、[crash-logging](crash-logging/spec.md)、[background-task-lifecycle](background-task-lifecycle/spec.md)、[safe-http-fetch](safe-http-fetch/spec.md) | `src/types/`、`src/lib/error.ts`、`logger.ts`、`src-tauri/src/` | `npm test`、`npm run build` |
| 体积、字体、CI、回归测试、e2e 测试、DMG 打包外观或 archive 门禁 | [e2e-test-coverage](e2e-test-coverage/spec.md)、[bundle-budget](bundle-budget/spec.md)、[font-stack](font-stack/spec.md)、[dep-audit-ci](dep-audit-ci/spec.md)、[regression-coverage](regression-coverage/spec.md)、[archive-sync-gate](archive-sync-gate/spec.md)、[dmg-installer-appearance](dmg-installer-appearance/spec.md) | `vite.config.*`、`scripts/check-bundle-size.sh`、`scripts/`、`.github/`、`scripts/check-archive-synced.sh`、`e2e/` | `npm test`、`npm run test:e2e`（smoke 套件）、`npm run build` |

所有改动完成后运行 `npx openspec validate --specs`。路由没有覆盖的任务，先从 `src/main.ts` 和最接近的模块测试反查实际入口，再为受影响行为补充或更新模块规范。

## 产品与架构参考（非模块规范）

这些文件提供决策上下文，不替代下方的可执行模块规范。

| 文档 | 用途 | 何时阅读 |
|---|---|---|
| [product-spec.md](product-spec.md) | 用户、产品范围与核心体验 | 新功能、产品行为取舍 |
| [architecture.md](architecture.md) | 分层、模块边界、数据与 IPC 架构 | 跨模块或前后端改动 |
| [technical-design.md](technical-design.md) | 关键技术方案、实现约束与权衡 | 设计具体实现方案 |
| [development-flow.md](development-flow.md) | 分支、Issue、OpenSpec 与交付流程 | 开始任何需要提交的工作 |

## 可执行模块规范

每个目录中的 `spec.md` 都是可验证的行为约束；按任务域阅读，而不是从头到尾通读。

### 文档与编辑

- [active-document-state](active-document-state/spec.md) — 活动文档路径与共享状态。
- [autosave-reliability](autosave-reliability/spec.md) — 自动保存失败与未保存状态。
- [codemirror-source-editor](codemirror-source-editor/spec.md) — CodeMirror 源码模式与同步。
- [document-size-tier](document-size-tier/spec.md) — 文档大小分级与降级。
- [editor-bottom-spacer](editor-bottom-spacer/spec.md) — 两种编辑模式的底部留白。
- [enter-content-integrity](enter-content-integrity/spec.md) — Enter 与模式切换的内容完整性。
- [expensive-task-scheduling](expensive-task-scheduling/spec.md) — 高开销编辑任务的调度。
- [frontmatter-visual-editor](frontmatter-visual-editor/spec.md) — YAML frontmatter 安全可视化编辑与无损保留。
- [keyboard-shortcuts](keyboard-shortcuts/spec.md) — 全局快捷键与编辑器命令。
- [lazy-code-languages](lazy-code-languages/spec.md) — 语言包按需加载与回退。
- [settings-code-highlight](settings-code-highlight/spec.md) — 代码高亮开关与即时生效。
- [url-decoration](url-decoration/spec.md) — 裸 URL 的非侵入式装饰、打开与复制。

### 工作区与文件

- [atomic-save](atomic-save/spec.md) — 原子写入基础设施。
- [background-task-lifecycle](background-task-lifecycle/spec.md) — 文件监听等后台任务生命周期。
- [export-workspace-bypass](export-workspace-bypass/spec.md) — 导出绕过工作区路径限制。
- [file-tree-architecture](file-tree-architecture/spec.md) — 文件树架构、加载与增量更新。
- [image-naming](image-naming/spec.md) — 粘贴图片命名。
- [image-storage-engine](image-storage-engine/spec.md) — 图片存储规则、路径解析与暂存生命周期。
- [image-streaming](image-streaming/spec.md) — 图片传输、临时文件与并发控制。
- [rendered-document-export](rendered-document-export/spec.md) — HTML、Word、PDF 导出。

### 界面与渲染

- [context-menu](context-menu/spec.md) — 右键菜单 API 与交互。
- [dialog-system](dialog-system/spec.md) — 对话框结构、样式与创建方式。
- [font-stack](font-stack/spec.md) — 跨平台字体栈与分发。
- [lazy-mermaid](lazy-mermaid/spec.md) — Mermaid 按需加载与渲染状态。
- [plantuml-render](plantuml-render/spec.md) — PlantUML 设置、渲染与回退。
- [safe-dom-construction](safe-dom-construction/spec.md) — 用户内容的 DOM 安全边界。
- [sidebar](sidebar/spec.md) — 侧边栏、文件操作与冲突解决。
- [statusbar](statusbar/spec.md) — 编辑器统计、自动保存提示与状态栏操作。

### 可靠性、质量与安全

- [bundle-budget](bundle-budget/spec.md) — 构建产物与字体体积预算。
- [e2e-test-coverage](e2e-test-coverage/spec.md) — 端到端自动化测试覆盖范围。
- [crash-logging](crash-logging/spec.md) — 崩溃日志与敏感信息脱敏。
- [archive-sync-gate](archive-sync-gate/spec.md) — 归档变更的 spec 同步完整性校验与 CI 验证门禁。
- [dep-audit-ci](dep-audit-ci/spec.md) — 依赖审计与 CI 质量要求。
- [dmg-installer-appearance](dmg-installer-appearance/spec.md) — DMG 安装窗口背景、图标布局与产物断言。
- [error-handling](error-handling/spec.md) — 锁恢复、错误分类与前端异常。
- [regression-coverage](regression-coverage/spec.md) — 核心与高风险路径的回归覆盖。
- [safe-http-fetch](safe-http-fetch/spec.md) — HTTP、DNS、重定向与图片安全限制。
- [type-system](type-system/spec.md) — 共享类型的边界与使用。


### 其他能力

- [autosave-dirty-guard](autosave-dirty-guard/spec.md) — 确保自动保存仅在文档有实际变更时触发写入，跳过干净文档和进行中的保存，避免无效 I/O 和并发冲突。
- [block-continuation-paragraph](block-continuation-paragraph/spec.md) — 定义特殊块（图片、引用、代码块）后自动创建续写段落的统一规则，确保用户在任何特殊块位于文档末尾时可直接继续写作。
- [ci-openspec-validation](ci-openspec-validation/spec.md) — 校验 OpenSpec 规范并确保变更符合仓库要求。
- [ci-type-check](ci-type-check/spec.md) — 定义 CI 中独立的 TypeScript 类型检查步骤，确保类型安全在构建流程之外也能被检测。
- [code-block-serialization](code-block-serialization/spec.md) — 保留代码块源码末尾换行的序列化语义。
- [docx-export](docx-export/spec.md) — 定义 DOCX 导出的 OOXML 格式要求、语义映射规则、样式定义和导出入口。
- [empty-line-preservation](empty-line-preservation/spec.md) — 定义源码模式下用户输入空行的保留规则，确保保存和模式切换不会因图片归一化逻辑而静默删除用户明确输入的空行。
- [export-theme](export-theme/spec.md) — 定义统一导出文档模型与主题令牌，为 HTML/PDF/DOCX 提供唯一样式来源，确保三种导出格式视觉一致。
- [file-tree-incremental-update](file-tree-incremental-update/spec.md) — 定义文件树 DOM 增量更新机制，使用 rAF 批量提交变更，避免每次文件系统事件触发全量重建。
- [html-export](html-export/spec.md) — 定义自包含 HTML 导出能力，确保导出文档保留当前编辑器主题、内联所有资源，脱离 MarkFlow 后仍可完整显示。
- [issue-workflow](issue-workflow/spec.md) — 提供端到端的 Issue 自动化处理命令，将手动 7 步流程封装为单一入口。
- [katex-math-render](katex-math-render/spec.md) — 定义 KaTeX 数学公式的按需加载、语法识别与渲染管道，支持行内 `$..$` 与块级 `$$..$$` 公式的实时渲染。
- [m0-architecture-baseline](m0-architecture-baseline/spec.md) — Defines the executable M0 architecture baseline for MarkFlow Core before M1 Core Foundation begins.
- [multi-window-close-isolation](multi-window-close-isolation/spec.md) — 确保多窗口关闭请求事件精确投递到发起窗口，关闭权限按窗口隔离且一次性消费，防止窗口间关闭串扰。
- [paragraph-block-prefix-escape](paragraph-block-prefix-escape/spec.md) — 定义以「被转义的行首块级前缀」开头的合法段落的序列化保真，确保这类段落从源码进入 WYSIWYG 时不因序列化丢失反斜杠而触发往返校验误拦截，且真实块级结构不受影响。
- [pdf-export](pdf-export/spec.md) — 定义平台原生 PDF 生成能力，使用 WebView 原生 API 直接生成 PDF 文件，不依赖系统打印面板或 PDF 打印机。
- [plantuml-export](plantuml-export/spec.md) — 定义 PlantUML 图表的右键导出菜单，允许用户将已渲染的 PlantUML 图表保存为 SVG 或 PNG 文件，或复制 SVG 源码和 PNG 图像到剪贴板。
- [readme-sync](readme-sync/spec.md) — 定义 README 文档与产品功能特性之间的同步规则，确保 README 覆盖所有 P0 功能。
- [source-toolbar-cm6](source-toolbar-cm6/spec.md) — 定义源码模式下工具栏操作（图片、引用、代码块）使用 CodeMirror 6 API 执行 Markdown 插入的规则。
- [table-wysiwyg-interaction](table-wysiwyg-interaction/spec.md) — 定义 MarkFlow 在所见即所得（WYSIWYG）模式下创建与编辑 GFM 表格的交互契约——从 Markdown 输入自动成表、表格边界插入句柄、单元格右键菜单、行列增删与对齐编辑，以及编辑结果无损写回 Markdown。让表格在可视化编辑器中成为一等公民，与源码模式双向保真。
- [toolbar-layout](toolbar-layout/spec.md) — 定义工具栏按钮组容器和整体布局规范，确保 ARIA 分组不破坏视觉布局。
- [trailing-newlines-preservation](trailing-newlines-preservation/spec.md) — 在 ProseMirror Document 与磁盘文件之间，通过元数据层保留尾部换行符，保证打开文件不被误标记 dirty、保存往返无损。
- [ui-aria-attributes](ui-aria-attributes/spec.md) — 定义 MarkFlow 工具栏和 Toast 组件的无障碍（ARIA）属性规范。
- [vitest-coverage-threshold](vitest-coverage-threshold/spec.md) — 定义 vitest 覆盖率阈值配置，确保前端代码质量有最低保障。
- [write-file-permission](write-file-permission/spec.md) — 定义文档写入的原子性保证和文件树操作的工作区边界检查规则。
- [wysiwyg-markdown-reconciliation](wysiwyg-markdown-reconciliation/spec.md) — 定义原始 Markdown、WYSIWYG 文档和序列化结果之间的安全对账协议，使不完全受支持的语法可被保留，并在无法证明安全时阻止静默覆盖。
- [wysiwyg-markdown-round-trip](wysiwyg-markdown-round-trip/spec.md) — 定义 WYSIWYG 编辑器对受支持 Markdown 语法的双向保真边界，确保解析、编辑、序列化和模式切换不会静默丢失文本、结构或关键语法属性。

## 追踪与历史资料（非行为规范）

- [UI 修复经验](../../docs/knowledge/ui-fixes.md) — 已归档的排障背景与经验；实施具体行为时应以所属模块规范为准。
- [测试问题清单](../../docs/triage/test-issues.md) — 测试发现问题的待办追踪，不是验收标准。

## 索引维护与自检

新增、移除或重命名任一 `*/spec.md` 时，须在上方“可执行模块规范”中同步更新条目和任务路由。以下命令应无输出；有输出表示某个模块规范未被索引：

```bash
for f in openspec/specs/*/spec.md; do grep -q "](${f#openspec/specs/})" openspec/specs/INDEX.md || echo "Missing: $f"; done
```

随后运行：

```bash
npx openspec validate --specs
```
