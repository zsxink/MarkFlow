## 1. 创建类型文件

- [x] 1.1 创建 `src/types/events.ts` — 包含 `StoreEvent`（discriminated union）、`StoreState`、`FileChangeEvent`
- [x] 1.2 创建 `src/types/editor.ts` — 包含 `EditorMode`、`ImageSettings`、`CursorPos`、`DocumentState`
- [x] 1.3 创建 `src/types/fileTree.ts` — 包含 `FileEntry`、`RemoteImageData`、`DragState`

## 2. 迁移 storage.ts 类型

- [x] 2.1 从 `src/lib/storage.ts` 移除内联的 `FileEntry` 和 `RemoteImageData` 定义
- [x] 2.2 在 `src/lib/storage.ts` 中从 `../types/fileTree` import `FileEntry` 和 `RemoteImageData`

## 3. 迁移 imageUtils.ts 类型

- [x] 3.1 从 `src/lib/imageUtils.ts` 移除内联的 `ImageSettings` 定义
- [x] 3.2 在 `src/lib/imageUtils.ts` 中从 `../types/editor` import `ImageSettings`

## 4. 迁移 main.ts 类型

- [x] 4.1 从 `src/main.ts` 移除内联的 `FileChangeEvent` 定义
- [x] 4.2 在 `src/main.ts` 中从 `./types/events` import `FileChangeEvent`

## 5. 迁移 store.ts 类型

- [x] 5.1 从 `src/lib/store.ts` 移除内联的 `StoreEvent` 和 `StoreState` 定义
- [x] 5.2 在 `src/lib/store.ts` 中从 `../types/events` import `StoreEvent` 和 `StoreState`

## 6. 验证

- [x] 6.1 运行 `npx tsc --noEmit` 确认无类型错误
- [x] 6.2 运行 `npm test` 确认全部通过
