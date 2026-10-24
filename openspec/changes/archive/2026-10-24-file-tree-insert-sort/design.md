# Design

## 背景

状态层 `src/ui/file-tree/state.ts` 的 `compareEntries()`（文件夹优先 → name.localeCompare → path 决胜）是排序唯一真相，全量渲染（`mergeDirectoryPage`/`upsertTreeEntry` 内 sort）顺序正确。DOM 增量路径的 4 处手写循环没有复刻该语义：

- `dom.ts insertSorted()`：`isDir && !childIsDir → continue`，文件夹名排最后时无命中落 `appendChild`（所有文件之下）；不识别 `.tree-load-more`。
- `render.ts insertEntryIntoTree()`：同语义复制品，且不删 `.tree-load-more`，分页未完的目录里新增节点可落到按钮之后。
- `render.ts renameEntryInTree()`：第三份复制品，且当前全仓无调用方（死代码）。
- `inline.ts` inline 重命名重排：第四份，只对文件生效（文件夹提前 return 走 `renamePathDom`）。

## 方案

### 统一 helper（dom.ts）

抽一个导出的排序插入函数（替换现 `insertSorted` 的 4 处用途），语义对齐 `compareEntries`：

1. 计算插入节点名与 `isDir`。
2. 遍历容器子节点（跳过自身与 `.tree-load-more`）：
   - 插入文件夹：遇到第一个「名称 ≥ 新名」的文件夹节点，插其前；否则记住第一个文件节点/`.tree-load-more` 位置，循环结束后插其前。
   - 插入文件：遇到第一个文件夹之后的「名称 ≥ 新名」的文件节点，插其前（遇文件夹直接跳过）；否则落到 `.tree-load-more`（若存在）之前、容器末尾。
3. 名称提取沿用 `:scope > span, :scope > .tree-folder > span`，isDir 判断沿用 `tree-folder` class（兼容 `.tree-folder-wrapper` 包裹与 inline 裸节点）。

路径决胜（path localeCompare）在 DOM 循环中不可靠（跨目录场景 inline 临时节点无完整 path），不做强对齐；同名场景维持现状（插在同名节点前），验收只要求文件夹优先 + 名称排序一致。

### 调用方收敛

- `insertEntryIntoTree`、`renamePathDom`、inline 重排循环改为调 helper；`insertEntryIntoTree` 的节点构建逻辑保留，只替换插入段。
- `renameEntryInTree` 无调用方：删除该函数及其 re-export（core.ts/index.ts），不引入 `#[allow(dead_code)]` 式掩盖。

### 不做

- 不改 `state.ts`（排序基准本来就正确）。
- 不改 `.tree-load-more` 的重建时机（分页追加路径 render.ts:165 已先删后建，helper 对它透明）。

## 测试策略

`src/ui/file-tree/__tests__/dom.test.ts` 扩展（happy-dom，手工构造 `tree-folder-wrapper/tree-file/tree-load-more` DOM）：

1. helper 直测 4 场景（文件夹排最后 / 文件排最后 / 容器含 load-more / 同名）。
2. `insertEntryIntoTree` 集成测：文件夹排最后场景断言插到第一个文件前。
3. inline 重排路径：重命名到末位名称后位置正确。

## 风险

- 分页 append 路径（`render.ts:168`）此前先删 load-more 再插入，helper 行为等价（跳过 load-more 不会命中），回归风险低。
- 删除 `renameEntryInTree` 若 CI 中有隐藏引用（调研已确认无），编译期即暴露。
