# Tasks

## 1. 工具条模块

- [x] 1.1 新建 `src/editor/extensions/code-block-toolbar.ts`：`CODE_BLOCK_LANGUAGES` 候选常量（lowlight common 常用子集，「纯文本」置顶，不含 mermaid/plantuml）、内联 SVG 图标常量（copy/check/chevron/search，viewBox 24 / stroke 1.75 / 圆角线帽）、`buildCodeBlockToolbar({ getLanguage, getSource, onLanguageChange })` 返回 `{ el, syncLanguage, containsTarget }`
- [x] 1.2 工具条 DOM：语言按钮（`aria-haspopup="listbox"`/`aria-expanded`，无语言显示「纯文本」）+ 复制按钮（`aria-label="复制代码"`）+ 下拉（搜索输入、`role="listbox"` 列表、当前项 `aria-selected` + ✓、底部提示「未列出的语言将展示为纯文本」）；全部 `createElement`/`textContent`，SVG 常量 innerHTML 仅用于 compile-time 字符串
- [x] 1.3 下拉交互：点击开合、输入过滤、未列出的语言显示「使用「x」」项、Enter 确认、Esc 关闭还焦、document mousedown 点击外部关闭
- [x] 1.4 复制交互：`onCopy` 回调（由 code-block.ts 注入剪贴板写入），按钮 ✓ 反馈 1.2s 还原（反馈先行、try/catch 兜底在注入侧），`aria-label` 随状态切换

## 2. NodeView 接入

- [x] 2.1 `code-block.ts` 的 `setCodeBlock()`：构建/复用工具条元素追加到 `dom`（pre 之后），`syncLanguage()` 随语言同步标签；图表路径 replaceChildren 自然移除
- [x] 2.2 语言切换：下拉选择 → `tr.setNodeAttribute(pos, 'language', value|null)`（getPos 空值保护，复用 applyMermaidSource 模式），不手改 `currentNode`
- [x] 2.3 复制注入：`navigator.clipboard.writeText(currentNode.textContent)`，失败 `logWarn('editor.codeBlock', ...)`，反馈不依赖写入成败
- [x] 2.4 `stopEvent` 扩展：非图表模式下工具条内事件（含下拉 keydown）返回 true；下拉外点关闭监听并入现有 document mousedown 监听并在 `destroy()` 卸载
- [x] 2.5 确认 `update()`/`ignoreMutation` 无需改动（语言变化仍走 return false 重建；contentDOM 外变异已被忽略）
- [x] 2.6 `src/export/snapshot.ts` 的 `cleanupEditorMarkup` 剥离 `.code-block-toolbar`（导出克隆整个 .ProseMirror DOM，工具条是编辑器 chrome 不得进产物）

## 3. 样式

- [x] 3.1 `variables.css` 三主题补 `--hover` 定义（浅 rgba(0,0,0,.05)/深 rgba(255,255,255,.07)/护眼 rgba(92,75,55,.08)），修复图片预览按钮既有引用缺口
- [x] 3.2 `editor.css`：`.code-block-view { position: relative }`；幽灵工具条（26px 基线、font-code 12px 语言标签、opacity+pointer-events 悬停显隐、`.is-open` 常驻）；下拉面板（surface/border/radius 8/shadow，搜索框、列表 hover、✓ 选中、底部提示）；全部用主题 token，不进 export/theme

## 4. 测试与验收

- [x] 4.1 `__tests__/code-block-toolbar.test.ts`：候选常量不含 mermaid/plantuml；`buildCodeBlockToolbar` DOM 结构与 aria；无语言显示「纯文本」；过滤与自定义「使用「x」」；Enter/Esc/外部点击行为（mock document 事件）
- [x] 4.2 `__tests__/index.test.ts` 或新文件接入 NodeView 用例：普通块挂工具条、复制回调取 `currentNode.textContent`、stopEvent 拦工具条目标、语言选择 dispatch `setNodeAttribute`（真实 Editor）、图表块不挂工具条
- [x] 4.3 `npm test`、`npx tsc --noEmit`、`node scripts/check-layering.mjs` 全绿
- [ ] 4.4 人工验收（npm run tauri dev）：三主题悬停淡入、复制 ✓、切换语言立即重高亮、源码模式 fence 同步、mermaid 块不受影响、导出产物无工具条痕迹
