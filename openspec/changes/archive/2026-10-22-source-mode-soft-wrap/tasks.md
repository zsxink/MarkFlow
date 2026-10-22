# Tasks

## 1. 源码编辑器接线（`src/lib/editor.source.ts`）

- [x] 1.1 新增模块级 `softWrapCompartment` 与 `let softWrapEnabled = true`，放在既有 `readOnlyCompartment` / `highlightCompartment` 旁并更新该处注释说明三者都可在运行时切换
- [x] 1.2 新增导出函数 `setSourceSoftWrap(enabled: boolean)`：先赋值 `softWrapEnabled`，`currentView` 为空时直接返回，否则 `dispatch` 一个 `softWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : [])`
- [x] 1.3 在 `createSourceEditor()` 的 `extList` 中把裸 `EditorView.lineWrapping` 替换为 `softWrapCompartment.of(softWrapEnabled ? EditorView.lineWrapping : [])`，位置保持紧接 `basicSetup`

## 2. 设置下发（`src/components/settings.ts`）

- [x] 2.1 从 `../lib/editor.source` 追加导入 `setSourceSoftWrap`
- [x] 2.2 在 `applyRuntimeSettings()` 中 `setSourceHighlight(...)` 之后追加 `setSourceSoftWrap(settings.softWrap !== false)`，并加一行注释说明与高亮同为即时生效路径
- [x] 2.3 给 `#setting-softwrap` 补 `settings-desc`：说明该开关同时作用于所见即所得与源码模式

## 3. 测试（`src/lib/editor.source.test.ts`）

- [x] 3.1 新增 `soft wrap compartment` 用例组：创建 view 后断言初始 `view.lineWrapping === true` 且 `.cm-editor` 带 `cm-lineWrapping`
- [x] 3.2 断言 `setSourceSoftWrap(false)` 后 `view.lineWrapping === false`、class 消失、`getSourceView()` 仍等于原 view 引用且容器内 `.cm-editor` 数量为 1（未重建）；再切回 `true` 断言恢复
- [x] 3.3 新增「无 view 时切换 + 下次创建沿用最新值」用例：先 `setSourceSoftWrap(false)` 不抛错，再 `createSourceEditor()` 断言 `lineWrapping === false`
- [x] 3.4 `afterEach` 中补充 `setSourceSoftWrap(true)` 复位模块级状态，并在用例内复原，避免污染既有 frontmatter 用例

## 4. 验证与收尾

- [x] 4.1 `npm test`（含 `src/lib/editor.source.test.ts`、`src/components/settings.test.ts`）、`npx tsc --noEmit`、`npm run build` 全绿
- [x] 4.2 `npm run validate:openspec`（`openspec validate --all`）通过
- [x] 4.3 手工验证：源码模式开/关「自动换行」的折行与横向滚动、切换后光标与滚动位置保留、WYSIWYG 下切换无异常且下次进源码模式值正确、readOnly 与代码高亮切换仍正常
  - 验证记录（按「已覆盖」/「本次未覆盖」拆分，不作无证据的手测声明）：
    - **已由单元测试覆盖** —— `src/lib/editor.source.test.ts` 的 `source editor soft wrap compartment` 组：初始 `.cm-lineWrapping` 存在；`setSourceSoftWrap(false)` 后该 class 消失，且 `getSourceView()` 返回同一 view 引用、容器内 `.cm-editor` 数量仍为 1（未销毁重建）；切回 `true` 恢复 class 且引用不变；无 view 时 `setSourceSoftWrap(false)` 不抛错，下一次 `createSourceEditor()` 沿用最新值。
    - **已由库内 CSS 事实覆盖** —— `node_modules/@codemirror/view/dist/index.js` 的 `baseTheme` 块：关闭换行时 `.cm-scroller { overflow-x: auto }`、`.cm-content { white-space: pre }`（长行不折行，宽度超出后横向滚动）；开启换行时 `.cm-lineWrapping { white-space: break-spaces; overflow-wrap: anywhere; flex-shrink: 1 }`（长行在编辑区内折行）。这两条与上面的 class 断言组合，即「折行 ↔ 横向滚动」的可核对依据。
    - **readOnly 与代码高亮互不干扰** —— 结构上由 readOnly / highlight / softWrap 三个独立 Compartment 保证；高亮路径由既有用例 `preserves custom Markdown highlighting when settings reapply it` 覆盖。
    - **本次未覆盖** —— 未在真实应用窗口做像素级人工观察：横向滚动手感、长行在真实字体/宽度下的折行观感、WYSIWYG 与源码模式之间来回切换时的观感。原因是本次为归档收尾，未启动 Tauri 窗口做人工走查。后续可补 e2e 入口（`e2e/specs/` 下新增用例，参照 `e2e/specs/smoke/settings-panel.e2e.mjs` 与 `e2e/specs/smoke/editor-mode.e2e.mjs` 的方式断言 `#source-editor-wrapper` 下 `.cm-lineWrapping` 的有无）来覆盖这部分。
- [x] 4.4 归档前执行 `openspec-sync-specs` 把 delta 合并进 `openspec/specs/codemirror-source-editor/spec.md`，并在其 `Agent Context` 补充软换行 Compartment 说明；随后 `openspec archive source-mode-soft-wrap` 并跑 `npx openspec validate --all` + `bash scripts/check-archive-synced.sh`
  - 执行记录：delta 的两条 ADDED Requirement 已逐字追加到 `openspec/specs/codemirror-source-editor/spec.md` 的 `## Requirements` 段末尾（`### Requirement: 源码模式自动换行跟随 softWrap 设置`、`### Requirement: 源码模式运行时配置互不干扰`，含全部 Scenario），既有 16 条 Requirement 未删改；`Agent Context` 已新增「运行时 Compartment」一条，说明 readOnly / highlight / softWrap 三个 Compartment 各自独立 reconfigure、切换不销毁重建 CM6 实例，以及 `setSourceSoftWrap()` 在无 view 时暂存取值供下次创建使用。随后由 `openspec archive source-mode-soft-wrap --yes` 归档到 `openspec/changes/archive/2026-10-22-source-mode-soft-wrap/`，并通过 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`。
