## 1. 文件树增量更新

- [x] 1.1 在 `fileTree.core.ts` 中实现 `pendingMutations` 队列和 rAF 调度机制
- [x] 1.2 修改 `applyFileTreeEvents` 使用增量更新而非全量重建
- [x] 1.3 添加 `cleanup()` 函数，清理事件监听器和 rAF 回调
- [x] 1.4 在 `fileTree.ts` 中 re-export `cleanup()` 函数

## 2. 内存泄漏检查与修复

- [x] 2.1 检查 `fileTree.core.ts` 事件监听器清理情况，修复未清理的监听器
- [x] 2.2 检查 `toolbar.ts` 按钮事件监听清理情况，添加 cleanup 函数
- [x] 2.3 检查 `settings.ts` 设置面板事件清理情况，添加 cleanup 函数
- [x] 2.4 检查 `editor.ts` ProseMirror/CodeMirror 事件清理情况，添加 cleanup 函数

## 3. 测试与验证

- [x] 3.1 为文件树增量更新添加单元测试
- [x] 3.2 为各组件 cleanup 函数添加单元测试
- [x] 3.3 运行 `npm test` 确认无回归

## 4. Bundle 分析

- [x] 4.1 运行 `npm run analyze` 输出 bundle 构成报告
- [x] 4.2 确认 Mermaid 已正确 lazy load（不在主 chunk 中）
- [x] 4.3 检查是否有意外打入的大依赖
- [x] 4.4 更新 bundle 分析基线数据（如有必要）

## 5. 提交与归档

- [x] 5.1 提交所有变更，commit message 格式：`perf: 前端性能优化 — 文件树增量更新、内存泄漏修复、Bundle 分析`
- [x] 5.2 运行 `openspec archive frontend-performance-optimization` 归档变更
- [x] 5.3 创建 PR，标题：`perf: 前端性能优化 (#129)`
