---
name: roadmap-theme-css-files
description: 主题方向定档——CSS 文件即主题（Typora 风格），自定义编辑器 + 导入导出
metadata:
  type: project
---

2026-08-30 路线图讨论，主题方向定档：
- **主题 = CSS 文件**（用户原话："主题应该是 css 这些文件吧？类似 typora"）。不做"锁死在一份 JSON 配置里"的编辑器，而是以 **CSS 文件为单位**承载主题，用户可直接编写/导入/导出/分享 `.css`。
- 技术基础已验证（2026-08-30 读 `src/lib/theme.ts` + `src/styles/variables.css`）：MarkFlow 主题机制是**干净的 CSS 变量 token system** —— `:root` 定义 ~13 个语义色 token（`--bg`/`--surface`/`--fg`/`--muted`/`--border`/`--accent`/`--code-bg` 等）+ 3 个字体 token；三套内建主题（light/dark/sepia）只是给 `[data-theme]` 属性换一套变量值；组件无硬编码颜色、全用 `var(--…)` 引用。天然支持"导入一个 `.css` 覆盖 `[data-theme="custom"]` 变量值"即成一枚新主题。
- 主体交付：**自定义主题编辑器 + 导入/导出**（以 `.css` 文件为颗粒）。
- 进阶（未选中主攻、可后续）：主题市场/商城、跟随系统偏好（现有 `initTheme` 只按 localStorage，无系统跟随逻辑——这一档其实成本很低，适合作为自定义主题的地基顺手做掉）。

**How to apply:** 主题方向方案一律以"CSS 文件即主题"为设计前提；不要设计成 JSON-only 的封闭主题格式。相关：[[roadmap-direction-ignore-refactor]]