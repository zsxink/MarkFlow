## ADDED Requirements

### Requirement: 事件类型集中管理

系统 SHALL 将事件相关类型定义在 `src/types/events.ts` 中，包括但不限于：
- `StoreEvent` — 联合类型，覆盖所有 store 事件变体
- `StoreState` — store 的完整状态接口
- `FileChangeEvent` — 文件系统变更通知事件

#### Scenario: StoreEvent 正确定义

- **WHEN** 从 `src/types/events.ts` import `StoreEvent`
- **THEN** `StoreEvent` 应为包含 `type` 属性的 discriminated union
- **AND** 包含 `editor:update`、`editor:dirty`、`editor:mode`、`file:active`、`settings:changed`、`workspace:set` 变体
- **AND** `editor:mode` 变体携带 `mode: 'wysiwyg' | 'source'` 字段

#### Scenario: StoreState 正确定义

- **WHEN** 从 `src/types/events.ts` import `StoreState`
- **THEN** `StoreState` 应包含 `mode`、`activeFilePath`、`workspacePath`、`expandedPaths`、`dirty`、`cachedSourceGutterStyles`、`settings` 字段
- **AND** `mode` 字段类型为 `'wysiwyg' | 'source'`

#### Scenario: FileChangeEvent 被导出

- **WHEN** 从 `src/types/events.ts` import `FileChangeEvent`
- **THEN** `FileChangeEvent` 应为包含 `path`、`kind`、`timestamp` 的 interface

### Requirement: 编辑器类型集中管理

系统 SHALL 将编辑器相关类型定义在 `src/types/editor.ts` 中，包括但不限于：
- `EditorMode` — 编辑器模式类型
- `ImageSettings` — 图片设置接口
- `CursorPos` — 光标位置类型
- `DocumentState` — 文档状态类型

#### Scenario: EditorMode 正确定义

- **WHEN** 从 `src/types/editor.ts` import `EditorMode`
- **THEN** `EditorMode` 应为 `'wysiwyg' | 'source'` 的 type alias

#### Scenario: ImageSettings 正确定义

- **WHEN** 从 `src/types/editor.ts` import `ImageSettings`
- **THEN** `ImageSettings` 应包含 `storageMode`、`customPath`、`preferRelative`、`autoCopyLocal`、`downloadNetwork`、`namingStrategy` 字段

#### Scenario: CursorPos 正确定义

- **WHEN** 从 `src/types/editor.ts` import `CursorPos`
- **THEN** `CursorPos` 应为包含 `line: number` 和 `col: number` 的 interface

### Requirement: 文件树类型集中管理

系统 SHALL 将文件树相关类型定义在 `src/types/fileTree.ts` 中，包括但不限于：
- `FileEntry` — 文件条目接口
- `RemoteImageData` — 远程图片数据接口
- `DragState` — 拖拽状态类型

#### Scenario: FileEntry 正确定义

- **WHEN** 从 `src/types/fileTree.ts` import `FileEntry`
- **THEN** `FileEntry` 应包含 `name`、`path`、`isDir` 字段
- **AND** 可选包含 `children?: FileEntry[]`

#### Scenario: RemoteImageData 正确定义

- **WHEN** 从 `src/types/fileTree.ts` import `RemoteImageData`
- **THEN** `RemoteImageData` 应包含 `data: string` 和 `mimeType: string` 字段

#### Scenario: DragState 正确定义

- **WHEN** 从 `src/types/fileTree.ts` import `DragState`
- **THEN** `DragState` 应为包含 `srcPath: string | null`、`srcEl: HTMLElement | null`、`isDragging: boolean` 的 interface

### Requirement: 源代码模块导入新类型

系统 SHALL 将所有源模块中内联定义的类型替换为从 `src/types/` 导入，包括：
- `src/lib/storage.ts` 移除内联的 `FileEntry` 和 `RemoteImageData`，从 `src/types/fileTree.ts` 导入
- `src/lib/imageUtils.ts` 移除内联的 `ImageSettings`，从 `src/types/editor.ts` 导入
- `src/main.ts` 移除内联的 `FileChangeEvent`，从 `src/types/events.ts` 导入
- `src/lib/store.ts` 移除内联的 `StoreEvent` 和 `StoreState`，从 `src/types/events.ts` 导入
- `src/components/fileTree.core.ts` 移除内联的 `dragState` 对象，从 `src/types/fileTree.ts` 导入 `DragState` 类型

#### Scenario: storage.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/lib/storage.ts` 不包含 `interface FileEntry` 或 `interface RemoteImageData` 定义
- **AND** 从 `src/types/fileTree.ts` import 这两个类型

#### Scenario: imageUtils.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/lib/imageUtils.ts` 不包含 `interface ImageSettings` 定义
- **AND** 从 `src/types/editor.ts` import `ImageSettings`

#### Scenario: main.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/main.ts` 不包含 `interface FileChangeEvent` 定义
- **AND** 从 `src/types/events.ts` export import `FileChangeEvent`

#### Scenario: store.ts 使用导入类型

- **WHEN** 构建项目
- **THEN** `src/lib/store.ts` 不包含 `type StoreEvent` 或 `interface StoreState` 定义
- **AND** 从 `src/types/events.ts` import 这两个类型

### Requirement: 类型检查通过

系统 SHALL 在重构后保持 `npx tsc --noEmit` 无类型错误，`npm test` 全部通过。

#### Scenario: 编译无错误

- **WHEN** 运行 `npx tsc --noEmit`
- **THEN** 无类型错误输出

#### Scenario: 测试通过

- **WHEN** 运行 `npm test`
- **THEN** 所有测试用例通过

### Requirement: Settings 类型集中管理

系统 SHALL 将 Settings 相关类型定义在 `src/types/settings.ts` 中，包括但不限于：
- `Settings` — 完整的 Settings 接口，字段与 Rust `Settings` struct（`#[serde(rename_all = camelCase)]`）一一对应
- `DEFAULT_SETTINGS` — Settings 默认值常量

#### Scenario: Settings 正确定义

- **WHEN** 从 `src/types/settings.ts` import `Settings`
- **THEN** `Settings` 应包含 `version`、`theme`、`fontSize`、`lineHeight`、`autosave`、`autosaveInterval`、`codeLineNumbers`、`codeWordWrap` 等全部字段
- **AND** `theme` 字段类型为 `'light' | 'dark' | 'sepia'`

#### Scenario: DEFAULT_SETTINGS 正确定义

- **WHEN** 从 `src/types/settings.ts` import `DEFAULT_SETTINGS`
- **THEN** `DEFAULT_SETTINGS` 应包含所有 Settings 字段的默认值
- **AND** `DEFAULT_SETTINGS` 满足 `Settings` 接口类型约束

### Requirement: storage.ts 使用 Settings 类型

系统 SHALL 将 `src/lib/storage.ts` 中的 `loadSettings`/`saveSettings` 返回/接收类型从 `Record<string, unknown>` 改为 `Settings`。

#### Scenario: loadSettings 返回 Settings 类型

- **WHEN** 检查 `loadSettings` 函数签名
- **THEN** 返回类型为 `Settings` 而非 `Record<string, unknown>`

#### Scenario: saveSettings 接收 Settings 类型

- **WHEN** 检查 `saveSettings` 函数签名
- **THEN** 参数类型为 `Settings` 而非 `Record<string, unknown>`

### Requirement: settings.ts 组件引用 DEFAULT_SETTINGS

系统 SHALL 将 `src/lib/settings.ts`（组件）中对 `DEFAULT_SETTINGS` 的定义改为从 `src/types/settings.ts` 导入。

#### Scenario: settings.ts 使用导入的 DEFAULT_SETTINGS

- **WHEN** 构建项目
- **THEN** `src/lib/settings.ts` 不包含 `const DEFAULT_SETTINGS` 定义
- **AND** 从 `src/types/settings.ts` import `DEFAULT_SETTINGS`
