## 1. 创建三个子模块文件

- [x] 1.1 创建 `fileTree.core.ts` — 将渲染/状态/排序函数从 `fileTree.ts` 移入
- [x] 1.2 创建 `fileTree.dragdrop.ts` — 将拖拽逻辑从 `fileTree.ts` 移入
- [x] 1.3 创建 `fileTree.inline.ts` — 将内联编辑逻辑从 `fileTree.ts` 移入

## 2. 将 `fileTree.ts` 改写为纯 re-export 入口

- [x] 2.1 从三个子模块重新导出所有公共 API
- [x] 2.2 确保所有 import 路径正确，无循环依赖

## 3. 验证编译通过

- [x] 3.1 `npm run build` 通过无类型错误
- [x] 3.2 `npm test` 全部通过
- [x] 3.3 手动测试文件树各功能正常

## 4. Code Review 与修复

- [x] 4.1 执行代码审查，检查模块拆分后是否存在未正确暴露的 API
- [x] 4.2 修复审查发现的问题
