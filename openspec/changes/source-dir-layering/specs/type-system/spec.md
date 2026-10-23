# Spec Delta

## MODIFIED Requirements

### Requirement: 源代码模块导入新类型

系统 SHALL 将所有源模块中内联定义的类型替换为从 `src/types/` 导入，包括：
- `src/infra/storage.ts` 移除内联的 `FileEntry` 和 `RemoteImageData`，从 `src/types/file-tree.ts` 导入
- `src/infra/image-utils.ts` 移除内联的 `ImageSettings`，从 `src/types/editor.ts` 导入
- `src/main.ts` 移除内联的 `FileChangeEvent`，从 `src/types/events.ts` 导入
- `src/infra/store.ts` 移除内联的 `StoreEvent` 和 `StoreState`，从 `src/types/events.ts` 导入
- `src/ui/file-tree/core.ts` 移除内联的 `dragState` 对象，从 `src/types/file-tree.ts` 导入 `DragState` 类型

#### Scenario: storage.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/infra/storage.ts` 不包含 `interface FileEntry` 或 `interface RemoteImageData` 定义
- **AND** 从 `src/types/file-tree.ts` import 这两个类型

#### Scenario: imageUtils.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/infra/image-utils.ts` 不包含 `interface ImageSettings` 定义
- **AND** 从 `src/types/editor.ts` import `ImageSettings`

#### Scenario: main.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/main.ts` 不包含 `interface FileChangeEvent` 定义
- **AND** 从 `src/types/events.ts` export import `FileChangeEvent`

#### Scenario: store.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/infra/store.ts` 不包含 `type StoreEvent` 或 `interface StoreState` 定义
- **AND** 从 `src/types/events.ts` import 这两个类型

### Requirement: storage.ts 使用 Settings 类型

系统 SHALL 将 `src/infra/storage.ts` 中的 `loadSettings`/`saveSettings` 返回/接收类型从 `Record<string, unknown>` 改为 `Settings`。

#### Scenario: loadSettings 返回 Settings 类型

- **WHEN** 检查 `loadSettings` 函数签名
- **THEN** 返回类型为 `Settings` 而非 `Record<string, unknown>`

#### Scenario: saveSettings 接收 Settings 类型

- **WHEN** 检查 `saveSettings` 函数签名
- **THEN** 参数类型为 `Settings` 而非 `Record<string, unknown>`

### Requirement: settings.ts 组件引用 DEFAULT_SETTINGS

系统 SHALL 将 `src/ui/settings.ts`（组件）中对 `DEFAULT_SETTINGS` 的定义改为从 `src/types/settings.ts` 导入。

#### Scenario: settings.ts 使用导入的 DEFAULT_SETTINGS

- **WHEN** 构建项目
- **THEN** `src/ui/settings.ts` 不包含 `const DEFAULT_SETTINGS` 定义
- **AND** 从 `src/types/settings.ts` import `DEFAULT_SETTINGS`

## ADDED Requirements

### Requirement: 跨层类型导入经 barrel 收敛

系统 SHALL 让 `src/ui/` 与 `src/main.ts` 只从 `src/editor/index.ts`、`src/render/index.ts`、`src/export/index.ts` 取得这些层的公共类型，避免依赖其内部文件布局。

#### Scenario: UI 层不直连引擎内部类型文件

- **WHEN** 检查 `src/ui/` 对编辑器、渲染、导出层的类型 import
- **THEN** import 目标 SHALL 为对应层的 `index.ts`
- **AND** SHALL NOT 出现指向该层内部实现文件的类型 import
