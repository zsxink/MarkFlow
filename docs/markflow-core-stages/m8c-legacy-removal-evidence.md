# M8C Legacy Removal Evidence

> 状态：当前实现已收敛；observation/release acceptance deferred，archive/merge gate 未满足。
> Issue：#244
> OpenSpec change：`m8c-legacy-removal`
> 更新日期：2026-07-31

## 范围

M8C 覆盖稳定观察期、功能迁移矩阵 P0/P1 清零、legacy fallback 删除、removal audit 和跨平台 release smoke 证据。

本阶段删除的是旧 ProseMirror serializer、`getMarkdown()` 保存 fallback、WYSIWYG 整篇 serializer 同步和 DOM-based export 主路径的文档真相职责，不删除 WYSIWYG 编辑模式。

## 当前 Gate 状态

| Gate | 状态 | 证据 |
| --- | --- | --- |
| `feature-migration-matrix.md` M8C P0/P1 全部 `已验收` | 已通过 | 矩阵新增 `M8C P0/P1 Removal Gate`，保存、模式切换、HTML/PDF/print/DOCX、Host scope、session isolation、removal audit 均有 owner 与证据；Task List/Image/CopyPaste 等明确为后续非 M8C scope |
| Core-backed export/Host path 默认路径 | 已完成 | HTML/PDF/DOCX/print 导出入口已要求 active Core session、confirmed revision 与 Export Host identity；无 Core/identity 时稳定失败 |
| Legacy DOM export fallback | 已完成 | `documentExport.ts` 已移除 Core session 缺失时的 `buildExportSnapshot()` fallback；`vite.config.ts` 已移除 `tiptap-markdown` 构建残留 |
| Legacy serializer save removal | 已完成 | 产品路径移除 `getMarkdown()` save fallback、ProseMirror markdown serializer 调用和 `tiptap-markdown` 依赖；非 Core 保存失败关闭 |
| Removal audit | 已通过 | `npm run check:m8c-removal` 通过 |
| 跨平台 release smoke | 未验证 | macOS：未验证；Windows：未验证；Linux：未验证 |
| 独立 agent 复核 | 已完成 | 2026-07-31 独立复核结论：archive/merge blocked |

## Observation Markers

当前实现已删除产品路径 legacy fallback，但尚未完成稳定发布观察期。后续接受 / archive / merge 前必须确认观察日志中无以下 marker：

- revision divergence：未验证
- silent rewrite：未验证
- fallback save：未验证
- wrong-session result：未验证
- wrong-window result：未验证
- legacy DOM export fallback：未发现产品路径 fallback
- legacy serializer save fallback：未发现产品路径 fallback

当前产品路径已无 legacy fallback 需要 marker 化；Host capability matrix 记录 `m8c_removed_fallback_entries: []`。若后续观察 PR 重新引入受控 fallback，必须重新加入结构化 marker，并补 request/session/revision/client/window/fallback reason/issue/error mapping。

本机日志检查：

- 日志目录：`~/Library/Application Support/MarkFlow/logs`
- 当前可用日志范围：2026-07-21 到 2026-07-28，最新 `markflow.log.2026-07-28`
- marker scan：`revision divergence|silent rewrite|fallback save|wrong-session|wrong-window|legacy DOM export fallback|legacy serializer save|HOST_STALE|HOST_REQUEST_MISMATCH|EXPORT_SESSION_MISMATCH` 未命中
- 限制：这些日志早于 2026-07-31 的 M8C removal 实现，不能作为当前 removal 分支的稳定观察期证据；观察日志验证作为后续接受 gate 保留，archive/merge 继续阻塞

## Automated Checks

| 命令 | 状态 | 结果 |
| --- | --- | --- |
| `npm run test:m8c-removal-audit` | 已运行 | 通过，验证 audit 会阻止产品路径 legacy terms，同时允许 docs/OpenSpec/test fixture 历史记录 |
| `npm run check:m8c-removal` | 已运行 | 通过 |
| `npm test -- src/lib/sidebar.fileops.save.test.ts src/lib/editor.modeSwitch.test.ts src/lib/documentExport.test.ts src/lib/pdfExport.test.ts src/lib/docxExport.test.ts` | 已运行 | 通过，33 tests passed |
| `npm test -- src/lib/documentExport.test.ts src/lib/sidebar.fileops.save.test.ts src/lib/editor.modeSwitch.test.ts src/lib/pdfExport.test.ts src/lib/docxExport.test.ts` | 已运行 | 通过，35 tests passed |
| `npm test -- src/components/sidebar.fileops.test.ts src/lib/sidebar.fileops.save.test.ts` | 已运行 | 通过，11 tests passed |
| `npm test` | 已运行 | 通过，49 files / 482 tests passed；Vitest 非 Tauri 环境存在 logger forward stderr 噪音 |
| `npx tsc --noEmit` | 已运行 | 通过 |
| `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` | 已运行 | 通过，0 vulnerabilities；默认镜像 `npmmirror` 不支持 npm audit security endpoint |
| `cargo test -p markflow-runtime` | 已运行 | 通过，runtime unit/integration/non-Tauri harness 全部通过 |
| `(cd src-tauri && cargo test)` | 已运行 | 通过，151 tests passed；sandbox 下本地 HTTP listener 被拒绝，非 sandbox 重跑通过 |
| `(cd src-tauri && cargo fmt --all -- --check)` | 已运行 | 通过 |
| `(cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings)` | 已运行 | 通过 |
| `(cd markflow-core && cargo test)` / `(cd markflow-core && cargo clippy --all-targets -- -D warnings)` | 不适用 | 本轮未修改 `markflow-core/` |
| `scripts/check-capabilities.sh` | 已运行 | 通过 |
| `npm run validate:openspec` | 已运行 | 通过，85 items passed |
| `bash scripts/check-archive-synced.sh` | 已运行 | 通过，all archived delta specs synced |
| `npm run build` | 已运行 | 通过；同步移除 `vite.config.ts` 中 `tiptap-markdown` chunk/optimizeDeps 残留 |
| `bash scripts/check-bundle-size.sh` | 已运行 | 通过，Main JS 246KB gzip / Chinese fonts 3630KB |
| `openspec validate m8c-legacy-removal` | 已运行 | 通过 |

## Independent Review

2026-07-31 派出独立 agent 复核当前分支，结论为 archive/merge blocked。

复核发现：

- `npm run check:m8c-removal` 失败，仍报告产品路径中的 legacy truth path：`package.json`、`src/components/sidebar.conflict.ts`、`src/components/sidebar.fileops.ts`、`src/lib/editor.init.ts`、`src/lib/editor.ts`。
- OpenSpec tasks 仅 `10/34` 完成，serializer save removal、mode-switch serializer removal、Host boundary hardening、完整验证 gate 仍未完成。
- 本 evidence 文件仍明确标注 removal gate 未满足。
- `package.json` 新增 audit scripts 的同时仍保留 `tiptap-markdown` 产品依赖，audit 会正确阻止归档。

复核运行：

- `npm run check:m8c-removal`：失败。
- `npm test -- src/lib/documentExport.test.ts src/lib/pdfExport.test.ts src/lib/docxExport.test.ts`：通过，28 tests passed。
- `npx tsc --noEmit`：通过。
- `openspec validate m8c-legacy-removal`：通过。
- `openspec instructions apply --change m8c-legacy-removal --json`：`10/34` tasks complete。

后续继续实现后，2026-07-31 本地补充验证：

- `npm run check:m8c-removal`：通过。
- `npm test -- src/lib/sidebar.fileops.save.test.ts src/lib/editor.modeSwitch.test.ts src/lib/documentExport.test.ts src/lib/pdfExport.test.ts src/lib/docxExport.test.ts`：通过，33 tests passed。
- `npx tsc --noEmit`：通过。

2026-07-31 removal 实现继续收敛后，本地验证更新：

- `npm test`：通过，49 files / 482 tests passed。
- `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org`：通过，0 vulnerabilities。
- `npm run build`：通过。
- `bash scripts/check-bundle-size.sh`：通过。
- `(cd src-tauri && cargo test)`：通过，151 tests passed。
- `(cd src-tauri && cargo fmt --all -- --check)`：通过。
- `(cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings)`：通过。

2026-07-31 当前 diff 独立复核发现两个行为级阻塞：

- `confirmDocumentTransition()` 将 `SaveResult` 当作 truthy；非 Core 保存返回 `'failed'` 时仍可能允许切换文档。
- `setMarkdown()` 在默认 WYSIWYG 打开/重载路径中间接调用 `getCurrentSourceMarkdown()`，导致没有 Core/source mirror 时抛出 `CORE_MARKDOWN_UNAVAILABLE`。

已修复并补充回归测试：

- `src/components/sidebar.fileops.ts`：只有 `saved === 'saved'` 才允许保存后文档切换。
- `src/lib/editor.ts`：普通 WYSIWYG open/reload baseline 使用传入的磁盘 Markdown，不读取 Core-only source mirror，也不调用 ProseMirror serializer。
- `src/components/sidebar.fileops.test.ts`：覆盖保存失败关闭时阻止文档切换。
- `src/lib/editor.modeSwitch.test.ts`：覆盖保存失败不离开 dirty legacy WYSIWYG，以及 WYSIWYG `setMarkdown()` 不读取 Core source content。
- 复测：`npm run check:m8c-removal` 通过；`npm test` 49 files / 482 tests passed；`npx tsc --noEmit` 通过。

2026-07-31 第三轮独立复核结论：

- `1.1` 勾选诚实：`feature-migration-matrix.md` 限定 M8C P0/P1 removal scope，未将 Task List、图片插入/编辑、Copy/Paste、StyleMap inheritance、OS-level notifications 等 deferred 非 M8C 项伪造成通过。
- `1.3` / `1.4` 勾选诚实：Host fallback entry 为空；HTML/PDF/DOCX/print 产品路径要求 Core session / Export IR / Export Host identity，缺失时稳定失败。
- `1.5` 不能勾选：本机日志最晚为 2026-07-28，早于 2026-07-31 当前 removal diff，不能证明当前分支经过稳定观察期。
- 静态扫产品路径未发现 `tiptap-markdown`、`getMarkdown()` save fallback、ProseMirror serializer save、DOM export snapshot fallback 或 legacy allowlist。
- 复核运行：`npm run check:m8c-removal` 通过；`openspec instructions apply --change m8c-legacy-removal --json` 为 33/34；`openspec validate m8c-legacy-removal` 通过；`npx tsc --noEmit` 通过；`npm test` 49 files / 482 tests passed。

## Session Isolation Evidence

| 场景 | 状态 | 说明 |
| --- | --- | --- |
| A/B 文档快速切换后导出仍绑定 A | 已验证 | `src/lib/documentExport.test.ts` 覆盖 flush 期间和 result routing 前 active session 变化时不写出 |
| 同路径多 session 导出隔离 | 已验证 | `src-tauri/crates/runtime/tests/non_tauri_harness.rs` 覆盖 same-path export bound to initiating session |
| 导出期间继续编辑 | 已验证 | `src/lib/documentExport.test.ts` 覆盖 flush pending patches 后用 confirmed revision 请求 Export IR |
| 窗口关闭取消任务 | 已验证 | Host window/task cancellation 协议由 `cargo test -p markflow-runtime` 中 host harness cancellation 覆盖 |
| 取消导出任务 | 已验证 | `MockHostHarness::cancel_request` 对 export 返回 `EXPORT_CANCELLED` |

## Known Remaining Legacy Paths

当前 `npm run check:m8c-removal` 未报告产品路径 legacy truth path。

已移除：

- `src/lib/documentExport.ts`：Core session 缺失时不再调用 DOM snapshot fallback。
- `src/lib/exportSnapshot.ts`：已删除 `buildExportSnapshot()` DOM clone helper，保留 `waitForFontsReady()` 和 DOCX SVG 转 PNG helper。
- `package.json` / `package-lock.json`：已移除 `tiptap-markdown` 产品依赖。
- `src/lib/editor.init.ts`：已移除 `tiptap-markdown` extension 和 ProseMirror markdown serializer dirty check。
- `src/lib/editor.ts`：已移除 `getMarkdown()` API、ProseMirror serializer 分支和 legacy WYSIWYG/source serializer fallback。
- `src/components/sidebar.fileops.ts`：非 Core 保存/另存不再调用 legacy write fallback。
- `src/components/sidebar.conflict.ts`：删除恢复不再从 editor DOM/serializer 合成 Markdown。
- `src-tauri/crates/runtime/src/host_contract.rs`：Host scope validation 现在拒绝空 request id，并保留 session/window/revision/capability/cancellation/permission/stale checks。
- `src-tauri/host-capability-matrix.json`：新增 `m8c_removed_fallback_entries: []`，记录当前 active product fallback entry 为空。

## Fallback Marker Summary

| fallback path | 状态 | marker 策略 |
| --- | --- | --- |
| ProseMirror serializer save / `getMarkdown()` save fallback | 已删除 | 产品路径无剩余 marker；audit 禁止回归 |
| WYSIWYG whole-document serializer sync | 已删除 | 产品路径无剩余 marker；mode switch tests 禁止调用 serializer |
| DOM export snapshot fallback | 已删除 | 产品路径无剩余 marker；Export IR 缺失返回稳定错误 |
| legacy Host allowlist | 已清空 | `src-tauri/host-capability-matrix.json` 中 `m8c_removed_fallback_entries: []` |

## Platform Smoke

| 平台 | 状态 | 备注 |
| --- | --- | --- |
| macOS | 未验证 | removal PR 前必须覆盖打开、编辑、保存、快捷键、输入法、表格、FrontMatter、导出 |
| Windows | 未验证 | removal PR 前必须覆盖同上 |
| Linux | 未验证 | removal PR 前必须覆盖同上 |

## Archive Blockers

- 稳定发布观察期尚未完成，留到后续接受时验证。
- Cross-platform release smoke 尚未执行，留到后续接受时验证。
- 本机可用运行日志最晚为 2026-07-28，早于当前 2026-07-31 M8C removal 分支，不能满足 task 1.5。
- 当前 diff 独立复核发现的两个行为级阻塞已修复；archive/merge 前仍需要在最终 diff 上确认无新阻塞。
