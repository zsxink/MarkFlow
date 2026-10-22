# Tasks

## 1. Document Boundary

- [x] 1.1 为启动标签首次打开文件增加失败先行的选区清理回归；证明模型状态/选择/历史不变，旧 DOM 选区在内容替换前已清理，外部输入不受影响。
- [x] 1.2 在旧文档切出和目标文档恢复的同步边界处理原生选区与焦点；验证 WYSIWYG、源码、错误回滚和普通新建/切换用例。

## 2. Cold Launch Validation

- [x] 2.1 将首次打开回归放在其他 smoke 编辑之前，验证初始未命名标签保留、首次打开标题文档、重新点击、输入/撤销，并用原生鼠标和窗口截图复核。
- [x] 2.2 完成类型检查、构建、单元测试、原生 E2E 和 OpenSpec 验证，记录证据与限制。

## Validation Evidence

- 失败先行：增加回归后、修改实现前，`editor.context.test.ts` 因未调用旧 PM/CM 的同步 blur 而失败；启动首次打开边界和源码失败回滚测试同样失败。
- 局部验证：`npx vitest run src/lib/editor.context.test.ts src/lib/documentSessions.test.ts` 41 项通过，覆盖旧选区清理、文件树取得焦点后仍清除旧 range、外部输入/选区保护、PM/CM 历史与选择、打开失败回滚和关闭到邻居的焦点。
- 全量验证：`npx tsc --noEmit`、`npm run build`、`npm test`（84 个文件、801 项）、`npm run validate:openspec`（67 项）和 `git diff --check` 通过。
- `npm run test:e2e` 原生 WebKit smoke 11 项通过。冷启动场景排在所有编辑/模式切换前，直接点击树中文件，文档第一次替换前检测到 rangeCount=0 且编辑器已失焦；保留初始空标签，并验证新文档单一 DOM 选择、输入位置和撤销。使用临时 identifier `com.markflow.editor.e2e.startup` 隔离自动化应用，构建配置随后原样恢复。
- Tiptap 在重新聚焦时派发不进入历史的 focus 元数据事务，因此恢复后的 EditorState 对象可更新；切出快照仍保留原对象，恢复后的文档、选择、插件状态和撤销行为保持一致。
- 原生绘制复核由主执行流完成：冷启动仅有未命名标签且空编辑器持有焦点，不点击侧栏按钮、不预先切换模式/重设焦点，以操作系统坐标直接点击 README 文件行，再点击标题末尾。修复前 `e2e/artifacts/startup-caret-before-native.png` 可见旧段落光标与新标题光标同时存在；修复后 `e2e/artifacts/startup-caret-after-native.png` 及连续 4 个原生帧仅有标题末尾光标，旧段落光标消失。启动初始状态另见 `e2e/artifacts/startup-caret-initial-after-native.png`。最终 PM/DOM anchor/head 均为 10，rangeCount=1。这里以原生窗口截图确认绘制修复，未将单独的 DOM/model 断言作为绘制证据。
