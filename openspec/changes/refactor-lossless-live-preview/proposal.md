## Why

MarkFlow 当前把 ProseMirror 文档树重新序列化为 Markdown 后覆盖原文件，因此编辑正文也可能丢失文末空行、EOL、BOM、列表 marker、代码围栏等未触及字节；#189 的 `trailingNewlines` 元数据只能补偿单一症状，无法提供编辑后的 byte-to-byte 保真。

废弃的 `feat-v0.1.0-draft` 已证明“CodeMirror 文本镜像 + Rust Core + Render IR”方向可行，但其迁移横跨过多层级、验证偏重单测与 checklist，曾出现 WYSIWYG 打开只显示源码的问题。本变更以当前稳定 `feat-v0.1.0` 为基线，重新设计一条始终可运行、可回退、以真实桌面和字节哈希为门禁的渐进式重构路线。

## What Changes

- 引入最小 Rust `markflow-core` 文档会话：保存原始字节快照、逻辑文本、逐行 EOL 映射、revision 和局部 text patch；Core confirmed snapshot 成为保存、dirty 和冲突判断的唯一文档真相。
- 将现有 CodeMirror 6 源码编辑器演进为单一编辑 surface；Source 与 Live Preview 只切换 decorations/widgets 和交互扩展，不再在 CodeMirror 与 ProseMirror 之间全文序列化、销毁和重建正文。
- 通过带 revision、viewport 和精确 source/content/marker range 的 Render IR 实现 Live Preview；未知、错误或未验收语法必须原样显示源码并保持可编辑。
- 所有输入、工具栏命令、粘贴和 widget 操作最终生成局部文本 patch；保存路径禁止调用 ProseMirror serializer、`normalizeImageMarkdown()` 或其他隐式全文归一化。
- 建立双重保真合同：未编辑文档保存必须与输入逐字节一致；编辑后只允许用户意图覆盖的 byte range 和为该操作新增的字节发生变化，未触及区域保持原字节。
- 采用 feature flag 和纵向切片迁移：先接入无损 Core 与 CodeMirror 主链，再按语法 cohort 启用 Live Preview，最后才删除 ProseMirror；任一阶段失败均回退为同一 CodeMirror 文本的源码显示，不能回退到 serializer 保存。
- 将真实 Tauri WebView、CJK IME、模式切换、外部修改、自动保存和字节哈希纳入每阶段发布门禁，防止“测试通过但 Markdown 未渲染”的假完成。
- 吸收 MarkText/Muya 与 Vditor 的成熟交互经验：按结构闭包更新 block、按活动 source range reveal marker、以 position map 维护 selection，并为 Enter/Backspace、paste 与 Undo/Redo 建立统一 CodeMirror transaction 语义；明确拒绝 contenteditable DOM、DOM-string History 和模式切换全文序列化成为正文真相。
- **BREAKING**：`getMarkdown()/setMarkdown()`、`lastPersistedMarkdown`、`trailingNewlines` 和 ProseMirror Markdown serializer 不再是持久化接口；相关消费者必须迁移到 Core session/EditorSurfaceBinding。

## Capabilities

### New Capabilities

- `lossless-markdown-session`: 定义原始字节快照、逻辑文本、EOL/BOM 保留、revision-bound 局部 patch、confirmed save payload 与字节级验收合同。
- `codemirror-live-preview`: 定义单一 CodeMirror 编辑 surface、Render IR 投影、marker reveal、精确源码回退、模式切换及 ProseMirror 迁移门禁。
- `lossless-refactor-validation`: 定义每阶段 AI 自动验证、独立 Reviewer、人工验收、证据工作区与 Go/No-Go，不允许只凭聊天结论或单元测试宣布完成。

### Modified Capabilities

- `codemirror-source-editor`: Source/WYSIWYG 从两个编辑器间全文同步改为同一 CodeMirror 文档上的扩展重配置。
- `atomic-save`: 保存内容改由 Core confirmed snapshot 提供，并在原子写入前校验 revision 与外部文件 identity。
- `autosave-dirty-guard`: dirty/autosave 从规范化 Markdown 字符串比较改为 Core revision、persisted revision 与 pending patch 状态。
- `trailing-newlines-preservation`: 用 Core 原始字节/EOL 映射替代 `trailingNewlines` 计数补偿，覆盖编辑后文末空行保留。
- `empty-line-preservation`: 取消保存路径的图片空行等隐式归一化，未触及空行必须保持原样。
- `document-size-tier`: 大文档仍使用同一文本主链，但按 viewport 限制解析、decorations 和 widgets，失败时精确回退源码。
- `e2e-test-coverage`: 增加真实桌面 Live Preview 语义、字节哈希、模式切换、IME 和迁移 feature flag 验收。

## Impact

- 前端：`src/lib/editor.ts`、`editor.init.ts`、`editor.source.ts`、`editor.state.ts`、`editor.serializer.ts`、toolbar/keyboard、sidebar file operations、outline/stats/export、CSS 和 E2E page objects。
- Rust/Tauri：新增最小 `markflow-core` crate 或等价独立模块；新增 open/apply-patch/snapshot/save/close/render bridge；复用现有原子写入、文件 watcher、图片资源事务与错误模型。
- 数据流：磁盘字节 → Core session → CodeMirror optimistic mirror → revision-bound patch/Render IR → Core confirmed save payload → 原子写盘。
- 依赖：继续使用 CodeMirror 6；ProseMirror/Tiptap 在迁移期仅作为 feature-flagged 兼容视图，完成门禁后移除。Parser 依赖必须通过 source-range、未知语法和性能 spike 后再选定。
- 测试：新增 canonical byte fixtures、Core property/golden tests、Bridge contract tests、CodeMirror decoration/selection tests，以及真实 macOS/Windows/Linux WebView 的语义和 IME 证据。
- 交付：Issue #254。每个实施阶段使用独立 child Issue/change/PR；本 proposal 是架构和验收合同，不授权一次性大合并。
- 验证资产：AI 运行记录、人工验收表、Reviewer 报告和证据索引全部属于项目资产，保存在本 change 的 `validation/`；大型原始产物可进入 CI artifact。`/Users/xian/markflow-test` 只放人工使用 MarkFlow 打开的 `.md` 测试文档。
