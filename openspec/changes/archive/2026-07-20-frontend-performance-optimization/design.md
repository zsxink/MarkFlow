## Context

MarkFlow 的文件树组件（`fileTree.core.ts`）在处理文件系统变更事件时，`applyFileTreeEvents` 已实现增量更新，但 `refreshFileTree()` 每次调用都执行 `container.innerHTML = ''` 全量重建 DOM。当用户展开包含数百个文件的大目录时，每次文件系统变更都会触发全量重建，导致明显卡顿。此外，多个组件的事件监听器在组件销毁时未清理，存在内存泄漏风险。

## Goals / Non-Goals

**Goals:**
- 文件树变更事件使用 `requestAnimationFrame` 批量提交，16ms 窗口内的多次变更合并为一次 DOM 操作
- 添加 `pendingMutations` 队列机制，积累变更后一次性 apply
- 保留 `refreshFileTree` 作为 fallback（首次加载、workspace 切换）
- 检查并修复 `fileTree.core.ts`、`toolbar.ts`、`settings.ts`、`editor.ts` 的事件监听器内存泄漏
- 确认 bundle 体积无回涨，mermaid 已正确 lazy load

**Non-Goals:**
- 不重构文件树整体架构（模块拆分已完成）
- 不引入虚拟滚动（当前文件树规模不需要）
- 不修改 ProseMirror/CodeMirror 编辑器核心逻辑
- 不新增外部依赖

## Decisions

### 决策 1：使用 rAF 队列而非 requestIdleCallback

**选择**：`requestAnimationFrame` + 16ms 窗口积累

**备选方案**：
- `requestIdleCallback`：浏览器支持不一致（Safari 不支持），且空闲回调可能延迟太久
- `setTimeout(fn, 0)`：无法保证在下一帧渲染前执行，可能导致视觉闪烁

**理由**：rAF 保证在浏览器渲染前执行，16ms 窗口足以积累高频变更（文件保存、批量重命名），且浏览器支持一致。

### 决策 2：增量更新仅用于事件触发的变更

**选择**：`applyFileTreeEvents` 中的 DOM 变更使用 rAF 队列，`refreshFileTree` 保持全量重建

**理由**：`refreshFileTree` 用于首次加载和 workspace 切换，此时整个文件树状态需要重置，增量更新无意义。事件触发的变更（文件创建、删除、重命名）是高频操作，增量更新收益最大。

### 决策 3：内存泄漏修复采用 cleanup 函数模式

**选择**：每个组件导出 `cleanup()` 函数，由父组件在销毁时调用

**备选方案**：
- WeakRef + FinalizationRegistry：过度复杂，且依赖 GC 行为
- AbortController：适合 fetch，不适合 DOM 事件监听器

**理由**：cleanup 函数模式简单明确，与现有代码风格一致，易于测试和维护。

## Risks / Trade-offs

- **[风险] rAF 队列可能遗漏快速连续变更** → 缓解：16ms 窗口足够覆盖高频变更，且保留 `refreshFileTree` 作为 fallback
- **[风险] cleanup 函数可能被遗漏调用** → 缓解：添加测试验证 cleanup 后无残留监听器
- **[权衡] 增量更新增加了代码复杂度** → 接受：复杂度可控，且大目录场景性能提升明显
