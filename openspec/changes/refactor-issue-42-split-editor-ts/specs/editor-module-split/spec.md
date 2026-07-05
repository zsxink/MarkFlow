## ADDED Requirements

### Requirement: Editor模块化拆分后API不变
editor.ts 拆分后，所有从 `src/lib/editor` 导出的模块公开接口必须保持不变，所有现有导入方无须修改代码即可继续使用。

#### Scenario: 所有导出函数签名不变
- **WHEN** 外部模块以 `import { getEditor, getMode, setMode, isDocumentDirty, hasExternalModification, markExternalModification, markDocumentPersisted, getMarkdown, setMarkdown, getWordCount, getLineCount, getCursorPos, initEditor, syncSourceEditorLineNumbers, switchToSource, switchToWysiwyg, setActiveDocumentPath } from './editor'` 方式导入
- **THEN** 所有导入的函数签名（参数类型、返回值类型）必须与原 `editor.ts` 完全一致

#### Scenario: 编译通过
- **WHEN** 执行 `npm run build`
- **THEN** TypeScript 编译无错误，Vite 构建成功

#### Scenario: 运行时行为不变
- **WHEN** 应用启动后执行编辑器初始化、WYSIWYG↔Source 模式切换、图片插入/编辑、Mermaid 渲染
- **THEN** 所有功能行为与拆分前完全一致

### Requirement: 共享状态集中管理
editor 模块的共享状态（editor 实例、mode、documentState 等）必须集中在 `editor.state.ts` 中管理，避免循环引用。

#### Scenario: 状态导出可用
- **WHEN** 子模块从 `editor.state.ts` 导入 `editor`、`mode`、`documentState` 等共享变量
- **THEN** 运行时能获取到正确的当前值

### Requirement: 子模块按职责拆分
editor.ts 须按以下职责拆分为独立文件，每个文件约 100-250 行：

| 文件 | 职责 | 行数上限 |
|------|------|---------|
| `editor.state.ts` | 共享状态声明与导出 | ~80 |
| `editor.extensions.ts` | Tiptap扩展（CustomLink, BlockImage, mermaidCodeBlock等） | ~180 |
| `editor.serializer.ts` | Markdown序列化相关函数 | ~80 |
| `editor.stats.ts` | 字数/行数/光标位置统计 | ~80 |
| `editor.image.store.ts` | assetToOriginalMap + imageSrcResolverPlugin | ~80 |
| `editor.image.bubble.ts` | imageBubblePlugin UI逻辑 | ~250 |

#### Scenario: 文件拆分完整
- **WHEN** 检查 `src/lib/` 目录
- **THEN** 上述 6 个新文件均存在且为非空文件

#### Scenario: 入口文件精简
- **WHEN** 检查拆分后的 `src/lib/editor.ts`
- **THEN** 该文件不超过 250 行

### Requirement: 测试全部通过
拆分后所有现有单元测试必须通过，验证重构不产生回归。

#### Scenario: 单元测试通过
- **WHEN** 执行 `npm test`
- **THEN** 所有测试用例通过，无新增失败或报错

#### Scenario: 行号功能正常
- **WHEN** 切换至 Source 模式
- **THEN** 行号显示正常，滚动同步正确

#### Scenario: 图片编辑气泡正常
- **WHEN** 在 WYSIWYG 模式下点击图片
- **THEN** 图片编辑气泡弹出，可修改注释和路径，确认修改实时生效

#### Scenario: Mermaid图表渲染正常
- **WHEN** 编辑器中包含 Mermaid 代码块
- **THEN** Mermaid 图表渲染正常，预览功能可用
