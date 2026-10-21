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
- [ ] 4.3 手工验证：源码模式开/关「自动换行」的折行与横向滚动、切换后光标与滚动位置保留、WYSIWYG 下切换无异常且下次进源码模式值正确、readOnly 与代码高亮切换仍正常
- [ ] 4.4 归档前执行 `openspec-sync-specs` 把 delta 合并进 `openspec/specs/codemirror-source-editor/spec.md`，并在其 `Agent Context` 补充软换行 Compartment 说明；随后 `openspec archive source-mode-soft-wrap` 并跑 `npx openspec validate --all` + `bash scripts/check-archive-synced.sh`
