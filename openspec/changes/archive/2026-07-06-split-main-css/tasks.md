## 1. 创建拆分后的 CSS 文件

- [x] 1.1 创建 `src/styles/app.css` — 全局 reset、#app grid、scrollbar、focus-mode
- [x] 1.2 创建 `src/styles/toolbar.css` — 工具栏按钮、app-menu、tooltip
- [x] 1.3 创建 `src/styles/sidebar.css` — 侧边栏布局、文件树、大纲、resize-handle
- [x] 1.4 创建 `src/styles/editor.css` — ProseMirror 排版、代码块、Mermaid、图片编辑、表格、任务列表、源码编辑器
- [x] 1.5 创建 `src/styles/components.css` — Modal、Toast、ContextMenu、Settings、Toggle、Link Dialog、NewFile Dialog、按钮通用样式

## 2. 更新导入

- [x] 2.1 修改 `src/main.ts` — 将 `import './styles/main.css'` 替换为各文件独立导入

## 3. 清理

- [x] 3.1 删除 `src/styles/main.css`

## 4. 验证

- [x] 4.1 运行 `npm run dev` 确认无构建错误
- [x] 4.2 运行 `npm run build` 确认生产构建正常
- [x] 4.3 验证各 CSS 文件行数在合理范围
