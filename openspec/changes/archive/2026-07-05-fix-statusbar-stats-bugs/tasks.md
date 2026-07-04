## 1. 修复 `getCursorPos()` 列号 0-based

- [x] 1.1 修复 `getCursorPos()` 行数逻辑（line 初始化改为 0）— 已修复但列公式仍需修正
- [x] 1.2 **修正 `getCursorPos()` 列公式**：WYSIWYG 模式 `col = from - blockStart`（去掉 +1），源码模式 `col = beforeCursor.length - lastNewline - 1`
- [x] 1.3 源码模式下 textarea `input` 事件中派发 `editor-update` 事件

## 2. 测试

- [ ] 2.1 空文档时列显示为 `0`
- [ ] 2.2 第一行开头列显示为 `0`
- [ ] 2.3 第二行开头列显示为 `0`
- [ ] 2.4 源码模式空文档列显示为 `0`
- [ ] 2.5 源码模式光标在行首列显示为 `0`

## 3. 提交

- [ ] 3.1 Commit 并重新关联 Issue #6
