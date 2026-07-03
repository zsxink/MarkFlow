## 1. 修复 Bug

- [x] 1.1 修复 `getCursorPos()` 行数多 1 的问题（`line` 初始化改为 0）
- [x] 1.2 源码模式下 textarea `input` 事件中派发 `editor-update` 事件

## 2. 更新 Issue 描述

- [x] 2.1 编辑 GitHub Issue #6，补充详细复现步骤和影响范围

## 3. 测试 & 验证

- [x] 3.1 手动验证 WYSIWYG 模式下光标行号正确
- [x] 3.2 手动验证源码模式下状态栏动态更新
- [x] 3.3 确认现有测试全部通过

## 4. 提交 & PR

- [ ] 4.1 Commit 修复
- [ ] 4.2 创建 Pull Request 关闭 Issue #6
