# M4: SolidJS App Shell and Editor Adapter

## 阶段目标

以增量替换方式将应用外壳迁移到 SolidJS，并建立稳定的 Editor Adapter 边界。

SolidJS 放在 M4 的原因：

- M1-M3 已经建立 Core-backed Source Mode，文档真相开始迁入 Core。
- M5 之后会进入 Core-backed 所见即所得、表格、FrontMatter、图片、导出等大量适配。
- 先把 UI 外壳和 Editor Adapter 稳定下来，可以避免后续功能在旧 UI 和新 UI 中重复迁移。

本阶段不改变“所见即所得必须长期保留”的产品要求。当前 ProseMirror WYSIWYG 可继续作为兼容路径存在。

## 技术方案

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

Solid store 只保存 UI 状态：

```typescript
interface AppUiState {
  activeSessionId: string | null;
  confirmedRevision: number;
  pendingTransactionCount: number;
  mode: 'source' | 'wysiwyg' | 'preview';
  selection: SelectionState;
  viewport: ViewportRange;
  sidebar: SidebarState;
  panels: PanelState;
}
```

禁止把完整 Markdown 文本作为长期权威状态存入 Solid store。

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

## 交付物

- SolidJS 应用外壳。
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
- Editor Adapter 与 UI 组件解耦。
- 前端平台调用集中经过 Host Bridge，不在 UI 组件中散落 Tauri command。
- Windows、macOS、Linux 至少完成打开、编辑、保存、设置、文件树 smoke。
- 功能迁移矩阵中所有 M4 项有测试或人工验收证据。
- 任一 Solid slice 失败可单独回退，不要求切回整套旧 UI。

## 测试要求

- Frontend unit tests：Solid store、toolbar action、sidebar state。
- Editor Adapter tests：CodeMirror lifecycle、selection mapping、core patch apply。
- E2E：文件树、打开文件、Source Mode 编辑保存、WYSIWYG 兼容入口、设置持久化。
- Regression：主题、状态栏、大纲、冲突提示。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| UI 迁移范围过大 | M4 不重写 Core/WYSIWYG，只迁外壳和 Adapter |
| 一次性切换导致长期不可发布 | vertical slice 小步迁移，每步保持可发布 |
| 功能迁移漏项 | 建立现有功能清单逐项验收 |
| Solid store 变成新文档真相 | 明确 store 只保存 session/revision/selection/viewport/panel |
