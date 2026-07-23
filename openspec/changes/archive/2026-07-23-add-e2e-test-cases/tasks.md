## 1. Page Object 扩展

- [x] 1.1 在 `e2e/page-objects/app.mjs` 中新增 `settingsModal()`、`settingsTab()`、`settingsPanel()`、`settingsClose()`、`themeSwatch()`、`fileTreeItem()` 选择器
- [x] 1.2 新增 `openFileInTree()`、`openSettings()` 辅助方法

## 2. 测试文档扩展

- [x] 2.1 在 `e2e/run.mjs` 的 workspace 初始化中扩展 `welcome.md` 内容，增加标题、段落、列表等结构化 Markdown

## 3. 文件打开与内容加载测试

- [x] 3.1 创建 `e2e/specs/smoke/file-open.e2e.mjs`，实现点击 welcome.md → 验证 WYSIWYG 编辑器显示标题和段落内容

## 4. 编辑、保存与重新加载测试

- [x] 4.1 创建 `e2e/specs/smoke/edit-save-reload.e2e.mjs`，实现源码模式编辑 → 保存 → invoke 验证磁盘文件 → 切换 WYSIWYG 验证内容

## 5. 设置面板交互测试

- [x] 5.1 创建 `e2e/specs/smoke/settings-panel.e2e.mjs`，实现打开设置 → 切换 tab 验证显隐 → 切换主题验证 class 变化 → 关闭重新打开验证状态保持
