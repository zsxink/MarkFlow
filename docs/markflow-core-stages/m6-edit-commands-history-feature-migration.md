# M6: Core Edit Commands, History and Existing Feature Migration

> 状态：Phase 1-2 已完成；Phase 3-5 迁移中；Phase 6 StyleMap 与完整矩阵验收后续推进。
> 最后复核：2026-07-30。

## 阶段目标

将工具栏、快捷键、历史记录和现有编辑能力迁移到 Core/Editor Adapter，确保 Source Mode 与 WYSIWYG 行为一致。

本阶段强调：现有功能必须完整迁移与适配，不接受重构后功能缺口。

## 技术方案

### 1. EditCommand API

Core 提供语义命令：

```rust
pub struct EditCommandRequest {
    pub session_id: SessionId,
    pub base_revision: Revision,
    pub command: EditCommand,
}

pub enum EditCommand {
    ToggleStrong { selection: Selection },
    ToggleEmphasis { selection: Selection },
    ToggleStrikethrough { selection: Selection },
    ToggleInlineCode { selection: Selection },
    SetHeading { selection: Selection, level: u8 },
    ToggleBlockQuote { selection: Selection },
    ToggleList { selection: Selection, kind: ListKind },
    InsertCodeFence { position: ByteOffset, language: Option<String> },
    InsertLink { selection: Selection, href: String, title: Option<String> },
    InsertImage { position: ByteOffset, reference: String, alt: Option<String> },
}
```

输出：

```rust
pub struct CommandResult {
    pub session_id: SessionId,
    pub patch: TextPatch,
    pub selection_after: Selection,
    pub affected_ranges: Vec<SourceRange>,
}
```

所有命令必须显式指定目标 session。Toolbar、快捷键、上下文菜单、图片入口和链接编辑不得通过 `activeFilePath` 推断文档；它们必须从当前 focused editor view 或 App Workspace 的 `activeSessionId` 得到 `sessionId`，并在命令返回时校验 session 未切换。

Bridge / Editor Adapter 边界：

- 上述 `ByteOffset` 只允许作为 Core 内部 API 或 Core 测试 fixture 的表达；UI、Toolbar、快捷键和 IPC DTO 必须提交 revision-bound UTF-16 `Selection` / `Position`。
- Runtime/Core 负责把 UTF-16 selection 转换成 source byte offset，并在转换失败、revision stale 或 selection 落在不可编辑 widget draft 时拒绝命令。
- 前端不得缓存 byte offset 后跨 revision 复用；跨 revision 的命令必须重新基于当前 confirmed snapshot 映射。
- 命令请求必须携带 `commandId` 或 `transactionId`。同一 id 的重试必须幂等返回同一结果，或在请求内容不一致时返回稳定冲突错误。
- undo/redo、composition commit 和语义命令都必须记录 transaction id，方便协议测试确认没有重复提交或双 history 回放。

### 2. 上下文风格继承

命令必须使用 `StyleMap`：

- 在 `*` 列表中新增项沿用 `*`。
- 在 `+` 列表中 toggle list 使用 `+`。
- 在 `~~~` 附近插入代码块优先用 `~~~`。
- 在 CRLF 文档中插入多行 patch 使用 CRLF。

### 3. History 策略

M6 完成 History 单一 owner 切换：

- Core 是 undo/redo 的唯一语义 owner。
- 每个 `DocumentSession` 拥有独立 history stack；不存在跨 session 的全局 undo/redo。
- CodeMirror 不再保留可独立回放的第二套文档 history。
- Adapter 将输入、composition 和命令归组后提交 Core。
- 保存不清空 history；外部 reload 建立明确 boundary。
- undo/redo 前必须 flush 目标 session 的 pending patch。

```rust
pub struct HistoryEntry {
    pub session_id: SessionId,
    pub transaction_id: TransactionId,
    pub origin: EditOrigin,
    pub revision_before: Revision,
    pub revision_after: Revision,
    pub inverse_patch: TextPatch,
    pub label: HistoryLabel,
}
```

分组规则：

- 一次 IME composition 是一个 transaction。
- 连续普通输入按时间、origin 和相邻 range 合并。
- 语义命令、表格、FrontMatter 和资源事务独立成组。
- undo/redo 返回 patch 与 selection，不返回整篇文本。

### 4. Selection / IME

Editor Adapter 负责：

- CodeMirror offset -> Core byte offset。
- Core byte offset -> CodeMirror selection。
- UTF-8 / UTF-16 映射。
- composition 期间禁止不安全命令。
- composition draft、selection bookmark 和 command result 都按 `sessionId` 隔离；切换文档时未完成 composition 必须提交、取消或阻止切换。

### 5. 现有功能迁移

迁移并适配：

- Toolbar 格式命令。
- 快捷键。
- 链接插入/编辑。
- 图片插入入口。
- 代码块语言。
- Mermaid/PlantUML 入口。
- 大纲跳转。
- 状态栏统计。
- 复制粘贴行为。

每项必须更新 `feature-migration-matrix.md`，并附 unit/E2E/人工验收证据。

## 交付物

- Core edit command API。
- 常用格式命令。
- StyleMap 上下文继承。
- selection_after 映射。
- History 基础模型。
- 现有编辑功能迁移清单和完成记录。

## Phase 3-5 实施记录

- Bridge IPC：`execute_edit_command`、`undo_document`、`redo_document` 返回 patch-first DTO（UTF-16 patch、affected_ranges、selection_after、revision），同一 `session_id + frontend_txn_id` 的相同重试返回缓存结果，不同 payload 返回 `TRANSACTION_CONFLICT`。
- Editor Adapter：`FormatCommandLayer` 作为 Source Mode 语义命令 seam，命令/undo/redo 前 flush `SourceSyncController`，成功后应用返回 patch，正常路径不做整篇 resync。
- Toolbar/Keyboard：Core-backed Source Mode 的 Bold/Italic/Strike/InlineCode/H1/H2/Quote/List/CodeFence/Link 和 Undo/Redo 走 Core 主路径；Link 保留 dialog display text，CodeFence 非空选区包裹选中文本，WYSIWYG legacy fallback 保留。
- Deferred：StyleMap 上下文继承、TaskList、完整 Image 文件事务迁移、Copy/Paste、reference link 编辑与 IME smoke 不在本次 Phase 3-5 最低交付内，需后续 change 显式验收。

## 验收标准

- 加粗、斜体、行内代码、标题、引用、列表、代码块命令不依赖 ProseMirror。
- 同一命令在 Source Mode 和 WYSIWYG 下结果一致。
- 命令输出 patch，而不是整篇 Markdown。
- 命令会沿用上下文 marker/fence/EOL 风格。
- 撤销/重做后 Core revision 与 CodeMirror 内容一致。
- undo/redo 前 pending queue 已 flush，且不存在双回放。
- undo/redo、快捷键和 toolbar 命令只作用于当前 focused session。
- composition 一次提交可一次撤销，emoji/combining mark selection 恢复正确。
- 中文输入法 composition 期间不会触发破坏性命令。
- 非 ASCII selection 不发生 offset 错位。
- 现有编辑功能完成迁移与适配，不出现功能缺口。
- 功能迁移矩阵中所有 M6 项为 `已验收`。

## 测试要求

- Core unit tests：每个 edit command。
- Fixture tests：style inheritance。
- Editor Adapter tests：toolbar -> command -> patch。
- E2E：快捷键、链接、图片入口、代码块、撤销重做、A/B 文档 history 隔离。
- Protocol tests：pending flush、undo/redo、reload boundary、幂等 transaction。
- IME smoke：中文输入后执行格式命令。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| Selection offset 映射错误 | 建立中英文混排 fixture |
| History 双源混乱 | M6 强制 Core 单一 owner，Adapter 禁用可独立回放的 CodeMirror history |
| History 或命令串到其他文档 | 所有 command/history API 均携带 `sessionId`，返回前后双向校验 |
| 现有功能漏迁 | 建立迁移清单，每项必须有验收 |
