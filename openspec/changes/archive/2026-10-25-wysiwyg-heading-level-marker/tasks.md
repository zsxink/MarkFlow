# Tasks

## 1. 编辑器侧样式实现

- [x] 1.1 在 `src/styles/editor.css` 新增标题级别标记样式：`.ProseMirror h1~h6` 设 `position: relative`；`::before` 按标签枚举 content（`"H1"`~`"H6"`），绝对定位 `right: calc(100% + 10px)`、`top: 50%`、`transform: translateY(-50%)`，h1 用 `top: calc(50% - 5px)` 补偿底边线 padding；`font: 400 12px/1` + 无衬线字体栈、`color: var(--muted)`、`letter-spacing: 0.05em`；设 `pointer-events: none` 与 `user-select: none`（含 `-webkit-`）。验证：`npm run build` 通过，样式仅出现在 editor.css、`src/export/theme/css.ts` 无 diff
- [x] 1.2 三主题核验：检查标记颜色在浅色/深色/护眼下均取自 `--muted`，无硬编码颜色。验证：人工检查 CSS 仅引用 token；`npm run dev` 三主题下目视（或以代码审阅代替）
- [x] 1.3 作用域收窄为顶层标题：所有标记规则改用 `.ProseMirror > h1`~`> h6`，嵌套在引用块/列表项内的标题不显示标记（避免压住引用边线/项目符号）。验证：`src/__tests__/heading-marker-styles.test.ts` 断言无裸 `.ProseMirror hN::before`
- [x] 1.4 空标题占位符复位：`.ProseMirror .is-editor-empty:first-child::before` 显式复位 `position/right/top/transform/font/letter-spacing`，空标题占位文字位置与加标记前一致。验证：样式契约测试断言复位声明存在

## 2. 隔离性验证

- [x] 2.1 round-trip 与序列化不受影响：运行既有 WYSIWYG round-trip 相关测试（`npm test`，含 `wysiwyg-roundtrip` fixtures）。验证：全部通过，无需新增测试（纯伪元素呈现，不触文档模型）
- [x] 2.2 导出不受影响：运行 `src/export/__tests__/theme.test.ts` 与 `docx.test.ts`（随 `npm test`）；确认导出主题 CSS 生成器无标记样式、伪元素不在导出 DOM 读取路径中。验证：测试通过 + `git diff` 中 `src/export/` 零改动
- [x] 2.3 源码模式与选区行为：确认改动仅作用于 `.ProseMirror h1~h6` 伪元素，CodeMirror 源码视图类名不同、天然隔离；伪元素带 `user-select: none`，选区/剪贴板不含标记。验证：代码审阅 + dev 模式手工拖选复制（可用代码审阅代替，在 PR 描述注明）

## 3. 原型与规范同步

- [x] 3.1 核验 `openspec/ui-design/index.html` 与 `SPEC.md` 的既有工作区改动与本设计一致（方案 A 灰字、左侧留白、垂直居中、无设置开关、不进导出）。验证：`git diff openspec/ui-design/` 审阅通过

## 4. 收尾校验

- [x] 4.1 样式契约测试：新增 `src/__tests__/heading-marker-styles.test.ts`（仿 `task-list-styles.test.ts` 直读 `editor.css`），断言顶层标题标记规则、绝对定位/主题 token/交互隔离属性，以及空标题占位符复位规则存在
- [x] 4.2 全量校验：`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec` 全部通过。验证：四条命令退出码为 0
