## 1. WYSIWYG 模式底部空行

- [x] 1.1 在 `src/styles/main.css` 中修改 `.editor-container` 的 `padding-bottom` 从 `120px` 改为 `300px`（保持顶部 `56px` 和左右 `48px` 不变）

## 2. 源码模式底部空行

- [x] 2.1 在 `src/styles/main.css` 中为 `.source-editor` 添加 `padding-bottom: 300px`

## 3. 验证

- [x] 3.1 切换到 WYSIWYG 模式，输入大量内容并滚动到底部，确认约 300px 视觉空行存在
- [x] 3.2 切换到源码模式，确认底部空行高度与 WYSIWYG 一致
- [x] 3.3 在两种模式间反复切换，确认无视觉跳跃感
- [ ] 3.4 确认空行不影响正常编辑操作（光标定位、内容插入、选中）
