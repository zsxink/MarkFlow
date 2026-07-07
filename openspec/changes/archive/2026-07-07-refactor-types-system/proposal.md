## Why

当前 `src/types/` 目录为空。大量接口和类型注解内联在各模块中（`storage.ts`、`editor.ts`、`main.ts` 等），导致类型定义分散、难以复用、import 路径混乱。集中管理类型系统可以减少重复、提升可维护性，并为未来功能扩展奠定基础。

## What Changes

- 创建 `src/types/events.ts` — 存放所有自定义事件 payload 类型
- 创建 `src/types/editor.ts` — 存放编辑器核心类型（模式、图片设置、文档状态等）
- 创建 `src/types/fileTree.ts` — 存放文件树相关类型（文件条目、拖拽状态等）
- 从各模块移除内联类型定义，改为从 `src/types/` import
- 删除冗余/重复的类型定义

## Capabilities

### New Capabilities
- `type-system`: 集中的类型定义系统，覆盖事件、编辑器和文件树三大类

### Modified Capabilities

无。本次只做类型提纯，不涉及功能行为变更。

## Impact

- 涉及模块：`storage.ts`、`editor.ts`、`main.ts`，以及其他 inline 类型的所有模块
- 新增文件：`src/types/events.ts`、`src/types/editor.ts`、`src/types/fileTree.ts`
- 无运行时行为变化，纯重构
- `npm test` 和 `npx tsc --noEmit` 必须保持通过
