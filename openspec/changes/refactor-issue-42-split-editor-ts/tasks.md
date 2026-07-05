## 1. 分支与准备

- [x] 1.1 从 `main` 创建分支 `refactor/issue-42-split-editor-ts`
- [x] 1.2 保存当前 editor.ts 的快照（git commit 后再改动）

## 2. 共享状态模块

- [x] 2.1 创建 `src/lib/editor.state.ts`：迁移 `editor`、`mode`、`dirtyCheckTimer`、`updateEventTimer`、`activeDocPathOverride`、`cachedSourceGutterStyles`、`assetToOriginalMap`、`documentState` 及其 getter/setter
- [x] 2.2 更新 `editor.ts`：将上述变量/函数的定义替换为从 `./editor.state` 导入

## 3. 扩展模块

- [x] 3.1 创建 `src/lib/editor.extensions.ts`：迁移 `CustomLink`、`BlockImage`、`lowlight`、`mermaidCodeBlockExtension`
- [x] 3.2 更新 `editor.ts`：将上述扩展的创建替换为从 `./editor.extensions` 导入

## 4. 图片存储模块

- [x] 4.1 创建 `src/lib/editor.image.store.ts`：迁移 `imageSrcResolverPlugin`、`getOriginalSrc`（注意 `assetToOriginalMap` 已移入 `editor.state.ts`，此处从那里 import）
- [x] 4.2 更新 `editor.ts`：将 `imageSrcResolverPlugin` 调用替换为从 `./editor.image.store` 导入

## 5. 序列化模块

- [x] 5.1 创建 `src/lib/editor.serializer.ts`：迁移 `normalizeImageMarkdown`、`replaceAssetUrlsWithOriginal`、`fixCorruptedImageNewlines`、`fixImageNewlines`、`extractDocAsFallback`
- [x] 5.2 更新 `editor.ts`：将上述函数的定义替换为从 `./editor.serializer` 导入

## 6. 统计模块

- [x] 6.1 创建 `src/lib/editor.stats.ts`：迁移 `getWordCount`、`getLineCount`、`getCursorPos`、`getSourceTextarea`
- [x] 6.2 更新 `editor.ts`：将上述函数的定义替换为从 `./editor.stats` 导入

## 7. 图片气泡 UI 模块

- [x] 7.1 创建 `src/lib/editor.image.bubble.ts`：迁移 `imageBubblePlugin`、`removeBubble`、`getImageInfoFromTarget`、`applyImageChanges`、`showBubble`
- [x] 7.2 更新 `editor.ts`：将 `imageBubblePlugin` 调用替换为从 `./editor.image.bubble` 导入

## 8. 入口文件精简与 Barrel Export

- [x] 8.1 从 `editor.ts` 中删除所有已迁移的函数/变量定义
- [x] 8.2 确认 `editor.ts` 保留 `initEditor`、`switchToSource`、`switchToWysiwyg`、`syncSourceEditorLineNumbers`、`autoGrowSourceEditor`、`getActiveDocPath`、`getMermaidExportBaseName`、`DEFAULT_IMAGE_SETTINGS` 以及所有 `export * from` barrel exports
- [x] 8.3 确认 `editor.ts` 不超过 250 行

## 9. 验证

- [x] 9.1 执行 `npm run build` — TypeScript 编译无错误
- [x] 9.2 执行 `npm test` — 全部测试通过
- [ ] 9.3 手动测试：WYSIWYG↔Source 模式切换
- [ ] 9.4 手动测试：图片插入/编辑气泡
- [ ] 9.5 手动测试：Mermaid 代码块渲染

## 10. 提交流程

- [x] 10.1 git commit（`refactor: 拆分 editor.ts 为独立模块`）
- [ ] 10.2 git push 并创建 PR
- [ ] 10.3 PR 审查并合并到 `main`
