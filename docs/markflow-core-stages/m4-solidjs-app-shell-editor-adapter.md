# M4: SolidJS App Shell and Editor Adapter

> 状态：规划中。M3/M3.1 Core-backed Source Mode 已完成；当前仓库尚未引入 `solid-js` 或 `vite-plugin-solid` 依赖。  
> 最后复核：2026-07-29。

## 阶段目标

以增量替换方式将应用外壳迁移到 SolidJS，并建立稳定的 Editor Adapter 边界。

SolidJS 放在 M4 的原因：

- M1-M3 已经建立 Core-backed Source Mode，文档真相开始迁入 Core。
- M5 之后会进入 Core-backed 所见即所得、表格、FrontMatter、图片、导出等大量适配。
- 先把 UI 外壳和 Editor Adapter 稳定下来，可以避免后续功能在旧 UI 和新 UI 中重复迁移。

本阶段不改变“所见即所得必须长期保留”的产品要求。当前 ProseMirror WYSIWYG 可继续作为兼容路径存在。

## 技术方案

### 前置：当前实现基线与 Go / No-Go

M4 是后续规划，不是当前实现事实。执行 M4 前必须先确认以下基线：

- 当前前端仍是 TypeScript 模块化应用壳，核心路径分布在 `src/components/**`、`src/lib/editor*.ts`、`src/lib/coreSession.ts`、`src/lib/SourceSyncController.ts` 和 `src/store.ts`。
- `package.json` 当前没有 `solid-js`、`solid-js/store` 或 `vite-plugin-solid` 依赖；依赖引入必须通过 M4 独立 proposal/ADR 记录，而不是夹带在无关功能 PR 中。
- 首个 Solid slice 只能证明 App Service / Editor Adapter 边界可复用，不应同时重写保存、解析、WYSIWYG 或 Host Bridge。
- 引入 Solid 前必须保留旧入口或 feature flag，使每个 vertical slice 可以独立回退。
- M3/M3.1 的 Source Mode、archive sync gate、`npx openspec validate --all` 与 `scripts/check-archive-synced.sh` 必须保持通过。

Solid 的 fine-grained reactivity 和 store 适合承载 UI projection、session projection 和面板状态；它不改变 Core/Runtime 是文档真相 owner 的原则。Solid store 不得保存完整 Markdown 文本、持久化状态机或可独立回放的事务队列。

### 0. Document / Session Workspace Model

M4 必须先把前端状态模型从“单 active file path”升级为“window-scoped active session + session-indexed projections”。这是 M5-M8 继续接入 WYSIWYG、History、Assets、Search、Export 的前置条件。

核心规则：

- `sessionId` / `documentId` 是文档运行态主键；`path` 只是 `DocumentSource` 的属性，不能作为 UI、命令或异步任务的唯一身份。
- 每个窗口只保存自己的 `activeSessionId`；同一路径多窗口必须对应独立 session。
- revision、dirty、selection、viewport、pending queue、mode、size class、outline 和 diagnostics 都必须挂在 session projection 下。
- `activeFilePath` 只能作为兼容 getter 或文件树高亮投影，从 active session 的 `source.path` 派生。
- 所有 UI action、App Service、Editor Adapter、Host Bridge 调用都必须显式接收目标 `sessionId`，不能隐式读取全局 current session。
- 所有异步返回必须携带 `sessionId + revision + requestId`，应用到 UI 前再次校验目标 session 仍然匹配。

```typescript
interface AppWorkspaceState {
  windowLabel: string;
  clientId: string;
  activeSessionId: string | null;
  sessionsById: Record<string, SessionProjection>;
}

interface SessionProjection {
  sessionId: string;
  documentId: string;
  source: DocumentSourceProjection;
  mode: 'source' | 'wysiwyg' | 'preview';
  confirmedRevision: number;
  persistedRevision: number;
  pendingTransactionCount: number;
  dirty: boolean;
  sizeClass: 'normal' | 'large' | 'huge';
  selection: SelectionState | null;
  viewport: ViewportRange | null;
  panels: PanelState;
}
```

M4 不要求实现同窗口多标签页 UI，但状态模型不得封死该能力。即使产品短期仍是一个窗口一个活动文档，也必须让 Adapter / Service API 可以针对任意 session 执行 save、close、export、search 和 pending task cancellation。

### 1. SolidJS 应用外壳

采用 strangler/vertical slice，不做一次性替换。建议顺序：

1. Toast / Modal / Context Menu 等叶子组件。
2. Statusbar / Outline 等只读投影。
3. Toolbar / Settings 等 action surface。
4. Sidebar / File Tree 等复杂状态模块。
5. App lifecycle 和主外壳。

每个 slice 必须：

- 在旧入口旁可独立挂载和回退。
- 使用同一个 App Service / Editor Adapter，不复制业务状态。
- 完成 unit + E2E 后再迁下一 slice。
- 更新功能迁移矩阵证据。

Solid store 只保存 UI 状态和 session projection：

```typescript
interface AppUiState {
  windowLabel: string;
  activeSessionId: string | null;
  sessionsById: Record<string, SessionProjection>;
  sidebar: SidebarState;
}
```

禁止把完整 Markdown 文本作为长期权威状态存入 Solid store。

Solid 组件订阅 Core Client、Editor Adapter 或 Host Bridge 事件时，必须在组件 lifecycle 中注册清理逻辑，避免 session close、mode switch 或 slice rollback 后仍有旧 listener 回填状态。异步 effect 结果进入 store 前必须再次校验 `sessionId + revision + requestId`。

### 2. Editor Adapter

建立独立 TS 层：

```text
src/editor-adapter/
  codemirror/
  core-bridge/
  selection/
  ime/
  commands/
  render/
```

职责：

- CodeMirror lifecycle。
- Core patch 应用。
- patch batching、ack/resync/flush 状态机。
- selection / IME 映射。
- 快捷键入口。
- Source Mode extension 管理。
- 后续 WYSIWYG Render IR -> decorations/widgets。

不负责：

- Markdown 解析。
- Markdown 序列化。
- 文档历史真相。
- 保存逻辑。

### 3. 功能完整迁移

M4 是 UI 外壳迁移，不允许丢现有功能。验收以 `feature-migration-matrix.md` 为账本，不以页面“看起来能用”为准。

必须迁移并适配：

- 文件树浏览、新建、重命名、删除。
- 大纲显示与跳转。
- 主题与设置。
- 保存、另存、导出入口。
- 冲突提示。
- 图片、链接、图表相关入口。
- 当前 WYSIWYG 兼容入口。

### 4. Host 调用收敛

前端不直接到处调用 Tauri command。通过 Core Client / App Services / Host Bridge 封装：

```text
UI -> Editor Adapter / App Services -> Core Bridge -> Runtime -> Core / Host Bridge
```

为未来 Electron/Web/CLI 留边界。

Host Bridge 请求必须携带上下文：

```typescript
interface HostRequestContext {
  clientId: string;
  windowLabel: string;
  sessionId?: string;
  documentId?: string;
  requestId: string;
  capability: HostCapability;
}
```

要求：

- 文件、对话框、剪贴板、窗口、通知、shell、export 等 Host 能力统一走 Host Bridge。
- 与文档相关的 Host 请求必须带 `sessionId`；窗口相关请求必须带 `windowLabel`。
- Host Bridge 不读取或修改 Markdown 文本真相，只返回平台副作用结果。
- UI 组件不得直接调用 Tauri command，也不得根据 `activeFilePath` 自行决定保存、导出或资源目录。

## 交付物

- SolidJS 应用外壳。
- Document / Session Workspace store。
- 独立 Editor Adapter。
- Core Bridge / Host Bridge 基础封装。
- 现有 UI 功能完整迁移清单。
- 每个 vertical slice 的回归记录和回退开关。
- Source Mode Core 路径在 SolidJS 下运行。

## 验收标准

- 现有文件树、设置、主题、状态栏、大纲、保存、冲突提示、导出入口仍可用。
- Source Mode Core 路径在 SolidJS UI 下继续可用。
- 当前 ProseMirror WYSIWYG 兼容路径仍可打开和编辑普通文档。
- Solid store 不持有权威 Markdown 文本。
- revision、selection、viewport、dirty 和 pending 状态均按 `sessionId` 隔离。
- Editor Adapter 与 UI 组件解耦。
- 前端平台调用集中经过 Host Bridge，不在 UI 组件中散落 Tauri command。
- Host Bridge 请求带 `clientId/windowLabel/requestId`，文档副作用带 `sessionId`。
- Windows、macOS、Linux 至少完成打开、编辑、保存、设置、文件树 smoke。
- 功能迁移矩阵中所有 M4 项有测试或人工验收证据。
- 任一 Solid slice 失败可单独回退，不要求切回整套旧 UI。

## 测试要求

- Frontend unit tests：Solid store、toolbar action、sidebar state、session projection。
- Editor Adapter tests：CodeMirror lifecycle、selection mapping、core patch apply。
- E2E：文件树、打开文件、Source Mode 编辑保存、切换 A/B 文档后异步结果不串扰、WYSIWYG 兼容入口、设置持久化。
- Regression：主题、状态栏、大纲、冲突提示。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| UI 迁移范围过大 | M4 不重写 Core/WYSIWYG，只迁外壳和 Adapter |
| 一次性切换导致长期不可发布 | vertical slice 小步迁移，每步保持可发布 |
| 功能迁移漏项 | 建立现有功能清单逐项验收 |
| Solid store 变成新文档真相 | 明确 store 只保存 session/revision/selection/viewport/panel |
| 单 active session 假设延续到 M5-M8 | M4 先建立 session-indexed store 和显式 target session API |
| 依赖引入先于架构边界验证 | Solid 依赖 PR 必须附 ADR、vertical slice、回退开关和验证记录 |
