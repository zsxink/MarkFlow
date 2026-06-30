---
description: CSS 布局踩坑规则 — 编辑样式或布局相关代码时自动加载
globs: ["src/**/*.css", "src/**/*.scss", "src/**/*.ts", "src/**/*.tsx"]
---

- Flexbox 子元素必须设 `flex-grow: 1`，否则 `clientWidth` 返回 min-content 宽度而非实际可用宽度
- 显式设置 `display` 的元素不能依赖 `hidden` 属性隐藏 — 需额外写 `[hidden] { display: none }`
- 空 `<div></div>` 高度为 0（无 line box），行对齐用纯文本 + `white-space: pre`
- 行号等辅助元素应绝对定位在 padding 区域，不要与主内容共享 flex 布局
- 统一滚动条位置：让内容自增长，由外层容器负责滚动
