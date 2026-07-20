## Context

提交 2260bdd 在 `initAriaAttributes()` 中通过 `wrapGroup()` 将工具栏按钮分别包装到 `<span role="group">` 容器中，但 `toolbar.css` 只定义了 `.toolbar` 为 flex 容器，没有定义这些新建 `<span role="group">` 的布局规则。由于 `<span>` 默认 display: inline，按钮在其内部发生换行和错位。

同时该提交在工具栏新增了 `#btn-theme` 主题切换按钮，而状态栏已有 `#sb-theme`。二者通过 `theme.ts` 的 `setTheme()` 同时更新两个元素。产品意图是仅保留状态栏入口。

根因分析已在 issue #139 的评论中确认。

## Goals / Non-Goals

**Goals:**
- 修复 `[role="group"]` 容器导致的工具栏按钮错位：添加 flex 布局 CSS
- 移除工具栏 `#btn-theme` 按钮及其事件绑定，保留状态栏 `#sb-theme`
- 清理 `theme.ts` 中已移除的 `#btn-theme`/`#theme-icon` 引用逻辑
- 添加 E2E 回归测试覆盖工具栏布局结构

**Non-Goals:**
- 不修改已有 ARIA 属性规范（`ui-aria-attributes` spec 已定义分组规则）
- 不改动 `wrapGroup()` 函数逻辑，只添加对应 CSS
- 不修改状态栏已有主题切换逻辑

## Decisions

### D1: CSS 方案 — `[role="group"]` 使用 `display: inline-flex`

- **方案：** 在 `toolbar.css` 中添加 `#toolbar [role="group"] { display: inline-flex; align-items: center; flex-wrap: nowrap; gap: 2px; }`
- **理由：** `inline-flex` 使 group 容器与 toolbar flex 布局兼容，容器间保持行内排列，内部按 flex 对齐。`nowrap` 防止按钮溢出换行。
- **被拒方案：** 将 `wrapGroup()` 改为使用 `<div>` — 需要改动 TypeScript 运行时代码，且 ARIA spec 并未要求特定 HTML 标签。

### D2: 主题按钮移除 — 删除 `#btn-theme` DOM 元素

- **方案：** 从 `index.html` 中删除 `#btn-theme` 按钮（第 98-100 行），从 `toolbar.ts` 中删除 `bind('btn-theme', ...)` 调用（第 105 行），从 `theme.ts` 中删除对 `#theme-icon` 的更新逻辑（第 20-21 行），保持 `#sb-theme` 和状态栏逻辑不变。
- **理由：** 最小化改动，只删除不需要的代码。`#btn-theme` 和 `#sb-theme` 在过去由 `theme.ts` 同时更新，删除 `#btn-theme` 后 `theme.ts` 不再需要操作工具栏中的图标元素。

### D3: 测试策略

- **方案：** 在现有 `toolbar.test.ts` 中新增测试用例，验证 `initToolbar()` 后 `[role="group"]` 容器存在、按钮在容器内、且 `#btn-theme` 不存在。
- **理由：** 回归测试应覆盖 toolbar 模块本身，无需 E2E 测试即可验证 DOM/CSS 结构。现有测试已在 `beforeEach` 中设置基本 DOM，只需补充 `#toolbar` 容器和相关按钮。

## Risks / Trade-offs

- [CSS 优先级] `[role="group"]` 选择器优先级较低，如有其他 CSS 规则冲突需显式提高优先级 → 使用 `#toolbar` ID 前缀提升权重
- [测试设置] 现有 `toolbar.test.ts` 的 `beforeEach` 只设置了 3 个按钮，要测试 group 结构需要补充完整工具栏 DOM → 在 beforeEach 中添加典型按钮组结构及 `#toolbar` flex 容器
