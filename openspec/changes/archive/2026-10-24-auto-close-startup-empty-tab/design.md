# Design

## Context

启动与手动新建都走 `newDocumentTab()`（`src/ui/documents/session.ts`），标签模型本身没有来源信息，因此当前无法区分「启动默认空标签」和「用户手动新建的空标签」。两条文档打开入口（文件树 `uiPorts.openDocument`、系统文件浏览器 `file-open-requested` 事件）最终都汇入 `openDocumentTab(path, prepare)`，这是唯一的收口点。

打开流程为：`suspendCurrent()` 把当前活动标签（通常是启动空标签）的上下文切出到 `tab.context` → 创建新标签并置为活动 → `resetEditorDocument` + `commit()` 应用内容 → `project()`。若打开中途抛错，会回滚恢复原标签。

## Goals / Non-Goals

**Goals:**

- 为标签增加最小来源标记，仅启动路径置位。
- 在 `openDocumentTab` 成功打开后回收仍为空的启动默认标签，复用现有 `closeInternal(id, false)` 后台关闭路径，不引入新的关闭逻辑。
- 覆盖文件树与系统文件浏览器两条入口（收口点一处实现即同时生效）。

**Non-Goals:**

- 不跨重启恢复标签，不做会话持久化。
- 不改动「新建标签」按钮行为与标签上限（20）逻辑。
- 不处理手动新建空标签的自动回收（明确排除）。

## Decisions

- **来源标记放在 `DocumentSession` 上（`startup: boolean`）而不是模块级单独变量**：标签列表本身是单真相源，标记跟随标签生命周期（关闭、全部关闭、销毁时自然消失），避免另一份需要同步的全局状态。
  - `newDocumentTab()` 统一创建 `startup: false`；`initDocumentSessions()` 创建后把该标签置为 `startup: true`。
- **在打开成功之后回收，而不是打开之前先关**：先关会把活动标签切换到空状态或邻居标签，再打开又要重新挂载，且打开失败时需要二次回滚。成功后回收时启动标签已处于后台（`suspendCurrent` 已切出），走 `closeInternal(startupId, false)` 的后台分支：不移除用户的活动焦点、释放其上下文、不进入 `closedPaths`（无路径），实现成本与风险最低。
- **「仍为空」的判定用脏状态而非内容扫描**：后台标签的脏状态在 `tab.context.projection.dirty`，活动标签在 `store.getState().dirty`（与 `getDocumentTabs()` 的既有判定一致）。启动标签一旦被输入即为脏，不满足条件就保留；无需遍历文档内容判断「空」。
- **回收动作放在 `runDocumentOperation` 串行边界内**（`openDocumentTab` 内部末尾），与其他文档操作天然串行，避免与切换/关闭竞争。

## Risks / Trade-offs

- [启动标签被编辑后打开文档，标记仍存在] → 回收条件同时要求 `path === null && !dirty`，脏标签自然跳过；无需清除标记。
- [Finder 一次提交多个文件] → 第一个文件打开成功即回收启动空标签，后续打开找不到带标记的空标签，循环天然幂等。
- [现有 E2E 断言「初始未命名标签保留」] → 按新行为更新对应 smoke 断言，冷启动光标清理场景改为直接断言新文档为活动标签。
- [`closeInternal` 内 `restore` 分支路径复杂] → 回收只发生在「新标签已成功成为活动标签」之后，启动标签必为后台标签，不触发关闭活动标签的恢复分支；单测覆盖该路径。

## Migration Plan

纯前端行为变更，无数据迁移。回滚即还原该分支提交。

## Open Questions

无。
