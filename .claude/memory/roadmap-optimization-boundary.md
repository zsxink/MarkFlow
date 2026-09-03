---
name: roadmap-optimization-boundary
description: 优化方向定档——用户感知为主+窄架构优化，明确不碰重构主线
metadata:
  type: project
---

2026-08-30 路线图讨论，优化方向定档：
- **优化 = 用户可感知的性能优先**：启动时间/首屏懒加载、大文件打开与编辑流畅度、Bundle 体积（当前 8.7MB，中文字体 3.7MB 逼近 4MB 红线，5 处动态导入冲突）。
- **附带窄架构优化**：文件树虚拟化（当前 100k 文件已量化但>5000 可见节点未虚拟化）、按需拆包。这些属于"窄重构"，允准入队。
- **红线**：不与 #254/#255 编辑链路大重构（CodeMirror Live Preview 无损链路）挂钩，不做 markflow-core 分层这类大架构迁移——因用户已明确重构投入产出比不符，排出行（见 [[roadmap-direction-ignore-refactor]]）。

**How to apply:** 优化方向方案只提用户可感知项 + 窄架构优化；任何触碰 #254/#255 或分层重构的提案直接排除。