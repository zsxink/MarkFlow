## Context

当前 `src/styles/main.css` 包含 1609 行 CSS，涵盖全局 reset、布局、工具栏、侧边栏、编辑器、弹窗、设置面板等所有组件的样式。随着功能增加，文件持续膨胀，定位和修改效率下降。

## Goals / Non-Goals

**Goals:**
- 将 main.css 按组件/功能域拆分为 5 个独立文件，每个约 200-400 行
- 保持所有选择器优先级不变（无样式回归）
- 修改 main.ts 中的 import 语句

**Non-Goals:**
- 不重构或优化任何样式值
- 不改变 CSS 变量定义（variables.css）
- 不涉及组件逻辑的重构

## Decisions

### 拆分方案
按 issue #45 的方案：
- `app.css` — 全局布局 (#app grid)、scrollbar、reset
- `toolbar.css` — 工具栏 + 菜单样式
- `sidebar.css` — 侧边栏 + 文件树 + 大纲样式
- `editor.css` — ProseMirror 排版 + 代码块 + Mermaid + 图片编辑
- `components.css` — Modal、Toast、ContextMenu、Settings、Dialog、Toggle 等

**Rationale**: 按 UI 区域划分，与组件目录结构对应，便于开发者按组件定位样式。

### 无 import 依赖
各 CSS 文件之间无 import 依赖关系，所有变量来源于全局的 `variables.css`，保持独立。

### main.ts 导入方式
将 `import './styles/main.css'` 替换为 5 行独立的 import，Vite 会自动处理合并。

## Risks / Trade-offs

- [样式顺序风险] Vite 默认按 import 顺序加载 CSS，若多个文件中存在相同优先级的选择器，后加载的会覆盖前一个。→ 拆分时确保同一选择器不会出现在多个文件中；对于共享样式（如 `.btn-primary`）统一归入 components.css
- [漏移风险] 手动拆分可能遗漏或重复样式。→ 拆分后对比原始文件的行数总和，确认无遗漏
