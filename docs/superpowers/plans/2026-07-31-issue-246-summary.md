# Issue #246 处理总结：修复打开 Markdown 后换行丢失

> 截至 2026-07-31，经用户要求停止。本文件汇总排查过程、结论、已完成的代码改动和待办事项。

## 1. 问题背景

markflow-core 重构后，打开多行 Markdown 文件时：

- 源码模式显示为丢失内部换行/空行的纯文本；
- 所见即所得模式无法正确按 Markdown 块结构初始化渲染。

## 2. 排查结论（已确认根因）

- **`markflow-core` 没有丢失换行。** Tauri `read_file` 和 `DocumentSession::open_bytes`/`TextBuffer` 都精确保留逻辑换行、BOM、行尾类型和末尾换行；Core lossless 测试通过。
- **前端打开/重新加载链路把 Core 的精确文本降格了。** 问题出在 `openFileInEditor()` / `reloadActiveDocumentFromDisk()` 仍经过 legacy `setMarkdown()`：
  - `setMarkdown()` 会剥离末尾换行，只把处理后的字符串作为编辑器基线；
  - 模式切换从 `getSourceContent()` 读取正文，继承了这个被压平/截断的结果；
  - 具体表现：`# Title\n\nParagraph\n` 被降格为 `# Title\n\nParagraph`。
- **已排除的独立问题：** WYSIWYG 适配器对非数字 workspace `sessionId` 直接拒绝 Render IR 请求。已确认与本次换行回归无关，单独跟踪，未混入本次修复。

## 3. 方案（用户已批准）

**Core Session 作为文档正文唯一真源。**

- 源码模式使用 Core 精确逻辑文本初始化，保留内部换行、空行和末尾换行。
- Core-backed WYSIWYG 使用同一份文本初始化，并通过当前 session/revision 的 Render IR 渲染块结构。
- 模式切换先 flush 再按 Core 重新水合，不从 legacy serializer 回读正文。
- `setMarkdown()` 仅保留给明确 legacy 路径。
- 保留图片生命周期、活动路径、只读、outline、日志等副作用。

设计文档：`docs/superpowers/specs/2026-07-31-core-backed-open-newline-design.md`
执行计划：`docs/superpowers/plans/2026-07-31-core-backed-open-newline.md`

## 4. 已创建的工作项

- GitHub Issue：`#246`（fix/kind=bug）
- 分支：`fix/issue-246-markdown-newline-loss`（从 main 创建）

## 5. 已完成代码改动

### commit `74bb2d5` — test: 覆盖打开文件换行保留（closes #246）

新增/调整失败回归测试（未改生产代码）：

- `src/components/sidebar.fileops.test.ts`：
  - 引入精确 fixture `# Title\n\nParagraph\n`；
  - 新增 Core-backed 打开/重新加载精确文本水合测试（`openCoreSession` 返回 `text`、`setSourceContent`、`markDocumentPersisted`，且不调用 legacy `setMarkdown`）；
  - 保留图片存储授权、废弃草稿清理等生命周期断言。
- `src/lib/editor.modeSwitch.test.ts`：
  - 用同一 fixture 精确断言 Core-backed WYSIWYG 与 Source 初始化收到的文本；
  - 断言 Core-backed 路径不调用 legacy `editor.storage.markdown.getMarkdown()`。

### commit `dcdb3a6` — fix: 修复 Core-backed Markdown 打开换行丢失

生产代码（针对以上失败测试的最小修复）：

- `src/lib/editor.ts`：Source ↔ Core WYSIWYG 模式切换改用 `getCurrentSourceMarkdown()` 而非 `getSourceContent()`，保留末尾换行。
- `src/components/sidebar.fileops.ts`：
  - 新增 `shouldUseCoreBackedHydration()`（Core-backed flag 且当前模式支持 Core-backed）；
  - 新增 `hydrateCoreBackedMarkdown(content)`：清空 `assetToOriginalMap` → `setSourceContent(content)` → `markDocumentPersisted(content)`；
  - `openFileInEditor()` 与 `reloadActiveDocumentFromDisk()` 在 Core-backed 分支中走 `openCoreSession()` → 用返回的精确 `text` 水合，替代 legacy `setMarkdown(content)`；保留 huge/large 只读与降级提示、`get_file_stats`、`resetEditorScroll`、`refreshOutline`、`showToast` 等副作用。

### 针对性测试结果

```bash
npm test -- src/components/sidebar.fileops.test.ts src/lib/editor.modeSwitch.test.ts src/lib/coreSession.test.ts src/lib/editor.state.test.ts
```

结果：68 项全部通过，`# Title\n\nParagraph\n` 在两种模式初始化中保持不变。

## 6. 独立审查发现（尚未处理）

Task 2 的独立 reviewer 结论为 **SPEC: FAIL / QUALITY: CHANGES_REQUIRED**：

1. **Critical** — `src/components/sidebar.fileops.ts:84`：Core-backed 水合写了 CodeMirror 文本，但 `trailingNewlines` 状态可能与新文档不匹配。若上一文档末尾有换行而新文档没有，后续模式切换或保存会用过期的新行数凭空补行，保存出错误 Markdown。
   - 状态：修复 subagent 已开始处理，但修复尚未提交/验证。
2. **Minor** — `src/components/sidebar.fileops.test.ts` 新增测试只断言 mock 调用，未覆盖真实的 trailing-newline 记账逻辑。

## 7. 未提交/未完成项（停止时的状态）

- **工作区未提交改动：** `src/components/sidebar.fileops.ts` 包含尚未完成的 `getDocumentState().trailingNewlines = ...` 一行（reviewer Critical 发现的第一版修复），尚未测试或提交。
- **设计/计划/总结文档：** `docs/superpowers/plans/`、`docs/superpowers/specs/2026-07-31-core-backed-open-newline-design.md` 尚未纳入任何 commit（保持 untracked）。
- **Task 2 修复第 1 轮未完成：** 针对 Critical + Minor 的修复 subagent 已被停止。
- **Task 3 未执行：** 全量前端测试、Core lossless 回归、`npm run build`、`git diff main...HEAD --check`、E2E 验证都未运行。

## 8. 后续建议

1. 完成 `trailingNewlines` 同步修复，并增加“旧文档状态不污染新文档”的回归测试（先失败再修复）。
2. 重跑 Task 2 scoped re-review。
3. 执行 Task 3 全量验证：Core lossless 测试、`npm test`、`npm run build`、diff 范围检查。
4. 决定设计/计划/总结文档是否随 PR 提交。
5. 通过后按项目规范创建 PR 并合并，`closes #246`。

## 9. 关键文件索引

- 修复源码：`src/components/sidebar.fileops.ts`、`src/lib/editor.ts`
- 回归测试：`src/components/sidebar.fileops.test.ts`、`src/lib/editor.modeSwitch.test.ts`
- Core 换行契约：`src/lib/coreSession.ts`、`markflow-core/src/document/session.rs`、`markflow-core/src/document/text_buffer.rs`
- 设计文档：`docs/superpowers/specs/2026-07-31-core-backed-open-newline-design.md`
- 执行计划：`docs/superpowers/plans/2026-07-31-core-backed-open-newline.md`
- SDD 台账与报告：`.superpowers/sdd/2026-07-31-core-backed-open-newline/`
- 本总结：`docs/superpowers/plans/2026-07-31-issue-246-summary.md`
