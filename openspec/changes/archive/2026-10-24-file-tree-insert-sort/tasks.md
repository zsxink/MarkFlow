# Tasks

## 1. 统一排序插入 helper

- [x] 1.1 在 `src/ui/file-tree/dom.ts` 将 `insertSorted()` 重写为「文件夹优先 + 名称排序 + load-more 感知」的统一插入 helper，语义见 design（文件夹无更大名称命中 → 插到第一个文件/`.tree-load-more` 前；文件无命中 → 插到 `.tree-load-more` 前或容器末尾）。验证：`npx tsc --noEmit`
- [x] 1.2 `src/ui/file-tree/render.ts` `insertEntryIntoTree()` 删除内嵌循环，改调 helper（节点构建与 load-more 处理逻辑保留）。验证：`npx tsc --noEmit`
- [x] 1.3 `src/ui/file-tree/inline.ts` inline 重命名重排段删除手写循环，改调 helper。验证：`npx tsc --noEmit`
- [x] 1.4 删除无调用方的 `renameEntryInTree()` 及其 `core.ts`/`index.ts` re-export。验证：`npx tsc --noEmit` + `grep -rn renameEntryInTree src/` 无命中

## 2. 单元测试

- [x] 2.1 `src/ui/file-tree/__tests__/dom.test.ts` 新增 helper 直测：新文件夹名排在所有文件夹之后（断言插到文件夹区末尾、所有文件之上）、新文件名排在所有文件之后（断言落到文件区末尾）。验证：`npm test -- src/ui/file-tree/__tests__/dom.test.ts`
- [x] 2.2 新增「容器含 `.tree-load-more`」场景：文件插入不落按钮之后。验证：同上
- [x] 2.3 `insertEntryIntoTree` 与 inline 重排路径集成测：重命名/插入到排序末位后顺序与全量排序一致。验证：`npm test -- src/ui/file-tree`

## 3. 回归与门禁

- [x] 3.1 全量 `npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs` 通过。验证：三条命令退出码 0
