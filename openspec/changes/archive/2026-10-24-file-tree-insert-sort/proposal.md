# Proposal

## Why

文件树 DOM 的「手术式增量插入」存在排序缺陷：插入名称排在所有已有文件夹之后的文件夹时，循环跳过全部文件节点后无命中位置，落到 `appendChild` 兜底，把文件夹挂到列表最底部（所有文件之下），破坏「文件夹优先、按名称排序」的既有规则。状态层（`compareEntries`/`upsertTreeEntry`）排序正确，全量刷新后顺序恢复，故 bug 纯在 DOM 增量路径。同一段插入循环逻辑在代码中复制了 4 份，其中部分副本还有 `.tree-load-more` 分页按钮被排到按钮之后的次生问题（见 issue #419）。

## What Changes

- 在 `src/ui/file-tree/dom.ts` 抽统一的「文件夹优先 + 名称排序」插入 helper，收敛 4 处重复循环（`dom.ts insertSorted`、`render.ts insertEntryIntoTree`、`render.ts renameEntryInTree`、`inline.ts` inline 重命名重排）。
- 修正插入语义：插入文件夹找不到更大名称的文件夹时，插到第一个文件节点前（而非 appendChild 到容器末尾）；插入文件落到容器末尾时插到 `.tree-load-more` 按钮（若存在）之前。
- 处理疑似死代码：`renameEntryInTree` 当前无调用方，收敛后删除或接入统一 helper（以实际调用链为准，不保留无调用方的导出）。
- 补单测覆盖 4 个场景：新文件夹名排在所有文件夹之后、新文件名排在所有文件之后、重命名到排最后的名称、容器含 `.tree-load-more` 按钮。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `file-tree-incremental-update`: 新增「增量插入排序一致性」requirement——增量插入/重命名重排后的 DOM 顺序 SHALL 与全量刷新（`compareEntries` 排序）一致，文件夹整体位于文件之上。

## Impact

- 代码：`src/ui/file-tree/dom.ts`、`src/ui/file-tree/render.ts`、`src/ui/file-tree/inline.ts`（`state.ts` 排序基准不动）。
- 测试：`src/ui/file-tree/__tests__/dom.test.ts`（或新增用例文件）。
- 风险：`insertSorted` 的既有调用方（分页追加、`renamePathDom`、inline 临时节点）与 `insertEntryIntoTree` 调用方（watcher create、右键复制副本、新建对话框、拖拽）中，文件夹「兜底落点」与文件「命中路径」两处行为变化——旧 `insertSorted` 在文件夹优先容器中插文件会落到第一个文件夹之前（所有文件夹之上），属同源反向 bug，本次一并修正为跳过文件夹落文件区。
- 关联 issue：#419。
