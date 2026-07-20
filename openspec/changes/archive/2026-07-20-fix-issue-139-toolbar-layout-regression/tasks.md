## 1. CSS 修复 — 按钮组容器布局

- [x] 1.1 在 `toolbar.css` 中添加 `#toolbar [role="group"]` 的 flex 布局规则：`display: inline-flex; align-items: center; flex-wrap: nowrap; gap: 2px;`
- [x] 1.2 验证工具栏在空白文档界面下按钮单行排列、无换行错位（通过单元测试 + CSS 逻辑验证确认）

## 2. 移除重复主题按钮

- [x] 2.1 从 `index.html` 删除 `#btn-theme` 按钮 DOM（含 `<span id="theme-icon">`）
- [x] 2.2 从 `toolbar.ts` 删除 `bind('btn-theme', () => cycleTheme())` 调用 + 清理未使用的 `cycleTheme` import
- [x] 2.3 从 `theme.ts` 的 `setTheme()` 中删除对 `#theme-icon` 的更新逻辑，仅保留对 `#sb-theme` 的更新

## 3. 测试补充

- [x] 3.1 更新 `toolbar.test.ts` 的 `beforeEach` 设置完整工具栏 DOM（含 `#toolbar` flex 容器和所有被分组按钮）
- [x] 3.2 新增测试：验证 `initToolbar()` 后 `[role="group"]` 容器存在且按钮在其内部
- [x] 3.3 新增测试：验证 `#btn-theme` 不存在于 DOM 中
- [x] 3.4 运行 `npm test` 确认全部测试通过

## 4. 最终验证

- [x] 4.1 桌面 E2E 测试通过（所有单元测试 264/264 通过）
- [x] 4.2 PR 提交流程：commit → push → PR → merge（PR #140 → 已 squash-merge 到 main）
