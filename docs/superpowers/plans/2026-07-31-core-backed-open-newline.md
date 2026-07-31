# Core-backed Markdown Open Newline Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Issue #246，使文件打开、重新加载和模式切换始终从 Core Session 的精确逻辑文本初始化 Source 与 Core-backed WYSIWYG，保留 Markdown 内部换行和块结构。

**Architecture:** Core Session 是正文唯一真源。Core-backed 文件打开链路绕过 legacy `setMarkdown()`/ProseMirror serializer 基线；Source 消费 Core logical text，WYSIWYG 消费同一文本并通过当前 session/revision 的 Render IR 渲染。

**Tech Stack:** TypeScript, Vitest, CodeMirror 6, Tauri v2, Rust, markflow-core

## Global Constraints

- 工作分支必须是 `fix/issue-246-markdown-newline-loss`，不得在 `main` 修改。
- 使用 TDD：先加入可稳定失败的精确字符串测试，再修改实现。
- Core Session 必须是 Core-backed 打开、重新加载和模式切换的唯一正文真源。
- 源码模式必须精确保留内部换行、空行和末尾换行。
- WYSIWYG 必须使用同一 Core 文本并通过 Render IR 渲染，不得从 legacy serializer 回读正文。
- 保留图片生命周期、活动文件路径、只读状态和 outline 等现有副作用。
- 不处理非数字 workspace sessionId 契约问题，不进行无关重构。
- 测试命令使用项目的 npm scripts；Rust 测试使用 `cargo test -p markflow-core`。

---

### Task 1: 建立文件打开与双模式换行回归测试

**Files:**
- Modify: `src/components/sidebar.fileops.test.ts`
- Modify: `src/lib/editor.modeSwitch.test.ts`
- Modify only if needed for an exact Core DTO assertion: `src/lib/coreSession.test.ts`

**Interfaces:**
- Consumes: `openFileInEditor(path)`, `reloadActiveDocumentFromDisk()`, `setMarkdown(content)`, `createSourceEditor(...)`, `createCoreWysiwygEditor(...)`, `openCoreSession(...)` 的现有接口。
- Produces: 能稳定证明 `"# Title\n\nParagraph\n"` 在文件打开及 Source/WYSIWYG 初始化中未被压平的回归测试。

- [ ] **Step 1: 在 fileops 测试中加入多行文件打开场景**

让 `readFile` 或 Core open mock 返回精确文本：

```ts
const markdown = '# Title\n\nParagraph\n';
```

断言打开/重新加载完成后，Core-backed 水合入口收到完整字符串，并断言现有副作用仍执行：活动路径更新、图片存储授权、废弃草稿清理以及既有只读/outline 行为。不得使用 `toContain` 替代精确字符串断言。

- [ ] **Step 2: 在 modeSwitch 测试中加入双模式精确水合场景**

使用同一 `markdown` fixture，断言：

```ts
expect(coreWysiwygText).toBe('# Title\n\nParagraph\n');
expect(sourceText).toBe('# Title\n\nParagraph\n');
```

同时断言 Core-backed 路径未调用 legacy `editor.storage.markdown.getMarkdown()`，且不会以 legacy `editor.commands.setContent()` 的序列化结果重新建立正文。

- [ ] **Step 3: 运行测试并确认至少一个新增断言失败**

Run:

```bash
npm test -- src/components/sidebar.fileops.test.ts src/lib/editor.modeSwitch.test.ts src/lib/coreSession.test.ts
```

Expected: 新增回归测试因打开/重新加载仍经过 legacy `setMarkdown()` 或目标编辑器未从 Core 精确文本初始化而失败；现有测试保持通过。

- [ ] **Step 4: 提交失败测试**

```bash
git add src/components/sidebar.fileops.test.ts src/lib/editor.modeSwitch.test.ts src/lib/coreSession.test.ts
git commit -m "test: 覆盖打开文件换行保留\n\ncloses #246"
```

只添加实际修改的文件。

---

### Task 2: 让 Core-backed 打开与重新加载从 Core 精确文本水合

**Files:**
- Modify: `src/components/sidebar.fileops.ts:191-315`
- Modify: `src/lib/editor.ts:106-154,159-281,334-443`
- Modify only if required to expose existing exact text without transformation: `src/lib/coreSession.ts:243-330`
- Test: `src/components/sidebar.fileops.test.ts`
- Test: `src/lib/editor.modeSwitch.test.ts`

**Interfaces:**
- Consumes: 当前 Core session state 中的 `sessionId`, `revision`, `text`，现有 Source/Core WYSIWYG 创建与 flush API。
- Produces: 一个最小 Core-backed hydration 分支；legacy `setMarkdown(content)` 继续只服务明确的 legacy 路径。

- [ ] **Step 1: 标出当前 Core-backed 与 legacy 打开条件**

复用项目已有的 Core session/workspace 状态判断，不新增第二套模式标志。确保判断依据与现有 mode-switch Core 路径一致。

- [ ] **Step 2: 修改首次打开流程**

在 `openFileInEditor()` 中保留图片生命周期和活动路径副作用，但对于 Core-backed 文档：

1. 以现有 Core open API 建立/取得会话；
2. 从 Core DTO/session state 取得未经过前端 serializer 的精确 `text`；
3. 根据当前模式把该文本传入 Source 或 Core WYSIWYG 创建/刷新路径；
4. 不调用 legacy `setMarkdown(content)` 作为正文基线。

legacy 路径仍可调用现有 `setMarkdown(content)`，避免扩大改动范围。

- [ ] **Step 3: 修改重新加载流程**

让 `reloadActiveDocumentFromDisk()` 对 Core-backed 文档复用同一 Core refresh/open 后的精确文本水合路径。失败时保持当前编辑器内容，不用部分状态覆盖 UI。

- [ ] **Step 4: 保持模式切换 flush 顺序**

确认 Source → WYSIWYG 与 WYSIWYG → Source 都先 flush pending patches，再从 Core 最新 revision/text 初始化目标模式；不得从 ProseMirror/Markdown serializer 读取正文。

- [ ] **Step 5: 运行针对性测试**

```bash
npm test -- src/components/sidebar.fileops.test.ts src/lib/editor.modeSwitch.test.ts src/lib/coreSession.test.ts src/lib/editor.state.test.ts
```

Expected: 全部通过，精确文本 `# Title\n\nParagraph\n` 在 Source 与 WYSIWYG 初始化中保持不变，现有文件/图片生命周期测试通过。

- [ ] **Step 6: 提交实现**

```bash
git add src/components/sidebar.fileops.ts src/lib/editor.ts src/lib/coreSession.ts src/components/sidebar.fileops.test.ts src/lib/editor.modeSwitch.test.ts src/lib/coreSession.test.ts src/lib/editor.state.test.ts
git commit -m "fix: 修复打开 Markdown 后换行丢失\n\ncloses #246"
```

只添加实际修改的文件。

---

### Task 3: 验证 Core、前端和构建回归

**Files:**
- Modify only if a regression test exposes a real gap: files already listed in Tasks 1-2
- Record results in the subagent report; do not create unrelated evidence files

**Interfaces:**
- Consumes: Tasks 1-2 的实现与测试。
- Produces: issue #246 的完整验证结果。

- [ ] **Step 1: 运行 Core lossless/newline 测试**

```bash
cargo test -p markflow-core snapshot_records_bom_and_trailing_newlines
cargo test -p markflow-core fixtures_roundtrip_byte_for_byte
```

Expected: 两项通过，证明修复未改变 Core 的 lossless 行为。

- [ ] **Step 2: 运行完整前端测试**

```bash
npm test
```

Expected: 全部 Vitest 测试通过。

- [ ] **Step 3: 运行构建**

```bash
npm run build
```

Expected: TypeScript 与 Vite 构建成功，无新增类型错误。

- [ ] **Step 4: 检查变更范围**

```bash
git diff main...HEAD --stat
git diff main...HEAD --check
```

Expected: 仅包含 issue #246 的测试、打开/重新加载水合实现及本计划/设计文档；`git diff --check` 无输出。

- [ ] **Step 5: 如 Task 3 产生必要修复则提交**

```bash
git add <only-the-files-fixed-for-verification>
git commit -m "fix: 完善 Markdown 换行回归修复\n\ncloses #246"
```

若无代码变化则不创建空提交。
