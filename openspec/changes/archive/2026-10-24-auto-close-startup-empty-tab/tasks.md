# Tasks

## 1. 会话模型：启动来源标记

- [x] 1.1 在 `src/ui/documents/session.ts` 的 `DocumentSession` 增加 `startup: boolean` 字段；`newDocumentTab()` 创建时置 `false`，`initDocumentSessions()` 把启动创建的标签置 `true`。验证：`npx tsc --noEmit` 通过，现有单测不回归。
- [x] 1.2 为启动标记新增单测：`initDocumentSessions` 创建的标签带标记、`newDocumentTab` 创建的不带。验证：`npx vitest run src/ui/documents` 通过。

## 2. 打开成功后回收空的启动默认标签

- [x] 2.1 在 `openDocumentTab` 成功路径（`project()` 之后、`return true` 之前）回收满足条件的启动标签：`startup && path === null && 非脏`（后台标签看 `tab.context?.projection.dirty`），复用 `closeInternal(tab.id, false)`。验证：`npx tsc --noEmit` 通过。
- [x] 2.2 新增单测覆盖规格场景：文件树入口打开后启动空标签被关闭且新文档活动；手动新建空标签保留；启动标签被编辑（脏）后保留；打开失败（prepare 返回 null 或抛错）后启动空标签保留。验证：`npx vitest run src/ui/documents` 通过。
- [x] 2.3 校验多文件场景幂等：Finder 连续打开两个文件只回收一次、两个文档标签都在。验证：单测断言通过。

## 3. 受影响断言与全量验证

- [x] 3.1 排查并更新现有测试/E2E 中与「初始未命名标签保留」相关的断言（含冷启动光标清理 smoke），使其符合新行为。验证：`npm test` 通过；如改动 E2E 则说明影响。
- [x] 3.2 全量门禁：`npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs`、`npm run validate:openspec` 全部通过。
