## Context

当前 `src/types/` 目录为空，类型定义散布在各模块中：
- `FileEntry` / `RemoteImageData` 在 `src/lib/storage.ts`
- `ImageSettings` 在 `src/lib/imageUtils.ts`
- `FileChangeEvent` 在 `src/main.ts`（未导出）
- `StoreEvent` / `StoreState` 在 `src/lib/store.ts`
- 其他内联类型在各组件文件中

## Goals / Non-Goals

**Goals:**
- 创建 `src/types/events.ts` — 事件 payload 类型
- 创建 `src/types/editor.ts` — 编辑器核心类型
- 创建 `src/types/fileTree.ts` — 文件树相关类型
- 从各模块移除被提取的类型定义，改为 import

**Non-Goals:**
- 不改动运行时逻辑
- 不改动现有 API 签名
- 不改动 CSS/UI

## Decisions

1. **按职责分文件而非一个大 types.ts** — 三个文件对应事件、编辑器、文件树三个关注点，避免单文件膨胀
2. **从 store.ts 提取 StoreEvent / StoreState 到 events.ts** — StoreEvent 本质是事件系统类型，StoreState 与应用状态相关，但两者紧密耦合，统一放在 events.ts
3. **FileChangeEvent 从 main.ts 提取到 events.ts 并改为 export** — 这是文件系统事件通知，属于事件体系
4. **FileEntry / RemoteImageData 从 storage.ts 移到 fileTree.ts** — FileEntry 是文件树的核心数据类型，RemoteImageData 是文件操作的返回类型，与存储函数分离
5. **ImageSettings 从 imageUtils.ts 移到 editor.ts** — 图片设置是编辑器配置的一部分
6. **新增 EditorMode / CursorPos / DocumentState** — 这些在 issue 中提到但当前只有内联使用无命名类型，创建后可为现有代码提供类型注解

## Risks / Trade-offs

- [import 循环] → type-only import (`import type`) 可避免运行时循环依赖
- [类型文件名变动影响大] → 文件结构在第一次就定好，避免后续移动
