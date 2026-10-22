# Tasks

## 1. source-mode-soft-wrap 规范同步

- [x] 1.1 把 `openspec/changes/source-mode-soft-wrap/specs/codemirror-source-editor/spec.md` 的两条 ADDED Requirement（「源码模式自动换行跟随 softWrap 设置」「源码模式运行时配置互不干扰」）连同其全部 Scenario 追加到 `openspec/specs/codemirror-source-editor/spec.md` 的 `## Requirements` 段末尾；验证：`grep "softWrap" openspec/specs/codemirror-source-editor/spec.md` 有命中，且 diff 显示既有 16 条 Requirement 的标题和实质文本均保留，未删除或改写；不要求原始字节级格式完全不变。
- [x] 1.2 在 `openspec/specs/codemirror-source-editor/spec.md` 的 `Agent Context` 段新增一条说明：源码编辑器有 readOnly / highlight / softWrap 三个运行时 Compartment，各自独立 reconfigure，切换不销毁重建 CM6 实例；`setSourceSoftWrap()` 在无 view 时暂存取值供下次创建使用；验证：`grep -n "Compartment" openspec/specs/codemirror-source-editor/spec.md` 有命中，且该段仍只包含新增内容（diff 中该段为纯追加）。

## 2. source-mode-soft-wrap 任务收尾

- [x] 2.1 在 `openspec/changes/source-mode-soft-wrap/tasks.md` 的 4.3 条目内补充可核对的验证记录：区分「已由 `src/lib/editor.source.test.ts` 的 `source editor soft wrap compartment` 组覆盖」的部分（开关切换、实例未重建、无 view 时切换后下次创建沿用）与「需真实渲染窗口才能观察」的部分（横向滚动观感、WYSIWYG 下切换的手感），后者明确写为本次未在真实窗口执行并注明后续可补 e2e 入口；验证：条目文本同时含「已覆盖」证据来源与「未覆盖」声明，不得出现无证据的「已验证」。
- [x] 2.2 勾选 `openspec/changes/source-mode-soft-wrap/tasks.md` 的 4.3 与 4.4；验证：`grep -c "^- \[ \]" openspec/changes/source-mode-soft-wrap/tasks.md` 为 0，且 `openspec list --json` 中该变更的 `completedTasks == totalTasks`。

## 3. 归档

- [x] 3.1 归档 `source-mode-soft-wrap`：`openspec archive source-mode-soft-wrap --yes`；验证：目录移动到 `openspec/changes/archive/2026-10-22-source-mode-soft-wrap/`，`openspec list --json` 中不再出现该变更。
- [x] 3.2 归档 `bundle-chunk-optimization`：`openspec archive bundle-chunk-optimization --yes`；验证：目录移动到 `openspec/changes/archive/2026-10-22-bundle-chunk-optimization/`，`openspec list --json` 中不再出现该变更。
- [x] 3.3 确认 `openspec/changes/` 下只剩 `archive` 一个非归档目录；验证：`ls openspec/changes | grep -v archive` 输出为空。

## 4. 全局验证

- [x] 4.1 运行 `npx openspec validate --all`，确认退出码 0；验证：无 ERROR 输出。
- [x] 4.2 运行 `bash scripts/check-archive-synced.sh`，确认退出码 0 且对 `2026-10-22-source-mode-soft-wrap` 的 delta spec 报「all content synced」；验证：输出末尾为 `OK: all archived delta specs ... are synced to main specs`。
- [x] 4.3 运行 `npm test` 与 `npx tsc --noEmit`，确认均通过；验证：两条命令退出码均为 0（本变更不改产品代码，应与 `main` 一致）。
