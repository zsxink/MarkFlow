## Context

当前编辑器主容器 `.editor-container` 的 `padding-bottom: 120px` 是为了给编辑器底部留出空间。但 120px 对应大约 6-7 行（以 18px 字体 + 1.7 行高 = 约 30.6px/行，120/30.6 ≈ 3.9 行），还不够用户看到文档末尾之外的内容。

需要将底部 padding 增加到约 10 行的高度，约 306px（18px × 1.7 × 10 = 306px），同时在源码模式下保持一致。

## Goals / Non-Goals

**Goals:**
- WYSIWYG 模式底部视觉空行增加到约 10 行高度
- 源码模式（source-editor textarea）底部增加相同高度的视觉空行
- 两种模式之间切换时高度一致，无跳跃感

**Non-Goals:**
- 不改动编辑器核心逻辑（ProseMirror、格式化、快捷键等）
- 不添加设置项（用户不可配置此空行高度）
- 不改动侧边栏、工具栏、状态栏等其他区域

## Decisions

| 决策 | 选择 | 理由 |
|------|------|------|
| 实现方式 | 纯 CSS padding | 最简单，无 JS 介入，不影响编辑器运行时逻辑 |
| 高度值 | 约 306px（10 行） | 18px 字体 × 1.7 行高 × 10 ≈ 306px；使用干净的数值（300px）四舍五入 |
| 源码模式实现 | textarea 的 padding-bottom | textarea 已有 `padding: 0`，直接加 `padding-bottom: 300px` 即可 |
| WYSIWYG 模式 | 修改 `.editor-container` 的 `padding-bottom` | 从 120px 改为 300px（增量 180px），与现有 CSS 体系一致 |

## Risks / Trade-offs

- **大文档性能**：300px 底部空行在绝大多数屏幕上约 1-2 屏高度，无性能影响
- **滚动行为**：追加空行后，滚动到文档末尾时光标在空行上方，用户需多滚一屏才能看到最后内容——这正是期望效果
- **源码模式 textarea**：textarea 的 `autoGrow` 高度会因 padding-bottom 增加而增大，但 `min-height: calc(100vh - 248px)` 不受影响，因为 padding 在内部增长
- **与现有 120px padding 的关系**：不是替换而是增加——120px 仍保留一部分，在此基础上增加到 300px

## Open Questions

无。
