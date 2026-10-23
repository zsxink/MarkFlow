# Tasks

## 1. 样式实现

- [x] 1.1 在 `src/styles/editor.css` 任务列表样式段新增规则：`.ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p { color: var(--muted); }`（含必要注释说明「为什么」只按 data-checked 收窄正文段落）；确认未勾选项正文仍由既有规则保持 `var(--fg)`；验证 `npm test` 通过

## 2. 样式契约测试

- [x] 2.1 扩展 `src/__tests__/task-list-styles.test.ts`：断言已勾选正文命中 `var(--muted)`、选择器限定 `data-checked="true"`、不出现硬编码颜色值、未勾选正文规则未被改动；验证 `npx vitest run src/__tests__/task-list-styles.test.ts` 通过
- [x] 2.2 对照验收清单静态走查（勾选变淡即时生效、编辑可读、明暗主题 token、源码模式不受影响、不外溢普通列表），在 tasks.md 记录走查结论；验证 `node scripts/check-layering.mjs` 通过

## 走查结论（2.2）

- 勾选变淡即时生效：OK。`TaskItem` 来自官方 `@tiptap/extension-list`（`src/editor/init.ts`），NodeView 勾选时原地更新 `li[data-checked]`，CSS 属性选择器自动命中，零 JS、无需重开文档。
- 编辑可读：OK。`--muted` 是既有弱化前景 token（占位符同款），非低对比灰；选区高亮与拼写下划线由浏览器/主题独立着色，不受段落 `color` 影响。
- 明暗主题 token：OK。`--muted` 在 `src/styles/variables.css` 亮色（62 行）/暗色（84 行）/sepia（101 行）三套主题均有定义；契约测试新增「任务列表范围内颜色声明必须 `var(` 开头」门禁，杜绝硬编码。
- 源码模式不受影响：OK。规则限定在 `.ProseMirror` 下；源码模式走 `.source-editor-wrapper .cm-*`（CodeMirror），无选择器交集。
- 不外溢普通列表：OK。选择器要求 `ul[data-type="taskList"]` 与 `li[data-checked="true"]` 双重限定，普通 `ul`/`ol`/`li` 均无这些属性；契约测试的 `endsWithPlainList` 结构检查与新增「--muted 只允许出现在已勾选段落选择器」断言双重守护。
- 验证：`npm test` 94 文件 / 940 用例全部通过；`node scripts/check-layering.mjs` 通过（138 生产文件无违规）。
