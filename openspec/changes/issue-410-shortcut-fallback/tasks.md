# Tasks

## 1. 键盘兜底

- [x] 1.1 `src/utils/keyboard.ts`：`initKeyboard(options)` 接受 `onShortcut`，命中加速键后 `preventDefault` 再执行；`event.repeat` 只吞默认
- [x] 1.2 `src/main.ts`：接线 `dispatchNativeMenuAction(action, 'shortcut')`

## 2. 跨入口去重

- [x] 2.1 `src/ui/native-menu.ts`：`dispatchNativeMenuAction(action, origin)`，同 action + 不同 origin + 120ms 内判为同一次按键
- [x] 2.2 被跳过的重复不刷新时间窗（防级联吞键）
- [x] 2.3 `recent-file:` / `recent-folder:` 动态键在超过 128 项时按窗口清理

## 3. 可观测性

- [x] 3.1 `src-tauri/src/menu/dispatch.rs`：菜单动作日志 `debug` → `info`

## 4. 测试

- [x] 4.1 `src/utils/__tests__/keyboard.test.ts`：覆盖兜底执行、占位项不接管、`event.repeat`、非原生键、`quit`/`settings`/`close-window` 等危险动作，且每次按键只回调一次
- [x] 4.2 `src/ui/__tests__/native-menu.test.ts`：跨入口去重（双向顺序）、同来源连按不吞、被拒绝的重复不延长窗口（回归）、模态保护
- [x] 4.3 `npx tsc --noEmit`、`node scripts/check-layering.mjs`、`npm test` 全绿

## 4b. 门控与能力对齐（用户要求：无工作区也要能保存文档）

- [x] 4b.1 `src-tauri/src/menu/mod.rs`：`save` / `save-as` / 导出（含子菜单）→ `Requires::Document`；`new-file` → `Requires::Always`
- [x] 4b.2 删除已无使用者的 `Requires::WorkspaceAndDocument` 变体与对应 match 分支
- [x] 4b.3 `src-tauri/src/menu/tests.rs`：更新 `workspace_document_and_recent_requirements_match_the_spec` 与 `enablement_follows_reported_state` 断言
- [x] 4b.4 `cargo test menu` 全绿（11 项）

## 5. 验证

- [x] 5.1 release 构建实测：同一发合成 ⌘S 修复前无反应、修复后弹出「保存文件」；日志无 `action=save`（证明走兜底）
- [x] 5.2 真机按键复核：工作区 + 文档下按 ⌘S 出现「已保存」；⌘T/⌘W 等其他快捷键行为不变（避免双跑）
- [x] 5.3 无工作区场景复核（AX 读菜单）：无工作区 + 有文档 → 保存可用；无工作区 + 无文档 → 保存不可用；新建文件恒可用；新建文件夹/关闭工作区仅工作区可用

## 6. 后续（不在本变更内）

- [x] 6.1 `window-minimal.json` 补 `core:window:allow-set-title`（#410 附带项，closes #412）
- [ ] 6.2 归档时同步 `keyboard-shortcuts` 与 `native-menu-bar` 主规范（含 `keyboard-shortcuts` 的 Agent Context 不变量表述）

## 7. 快捷键提示与平台绑定（#406）

- [x] 7.1 `src/utils/shortcut.ts`：纯函数 `formatShortcut(accelerator, platform)`——macOS 出符号（`⌘S` / `⇧⌘F` / `⌃Tab`），其他平台出名称（`Ctrl+S`），未知 token 原样保留
- [x] 7.2 `src/infra/platform.ts`：`shortcutPlatform()` 从 `navigator.platform` 判定、带 UA 兜底，每次调用时读取（可在测试中改写）
- [x] 7.3 `src/ui/shortcut-hints.ts`：`shortcutLabel()` + 幂等 `applyShortcutHints(root)`，为 `[data-shortcut]` 元素补写 `data-tooltip` / `title`
- [x] 7.4 `index.html`：10 处工具栏提示由硬编码 `(Ctrl+X)` 改为 `data-tooltip` + `data-shortcut`；标签新建按钮 `title` 去掉键位
- [x] 7.5 `src/ui/settings/markup.ts`：9 处 `shortcut-key` 文案改用 `shortcutLabel(...)`
- [x] 7.6 `src/ui/editor-context-menu.ts`：删除本地 `formatShortcut`，改为复用 `shortcutLabel`
- [x] 7.7 `src/main.ts`：启动时 `applyShortcutHints()`
- [x] 7.8 测试：`src/utils/__tests__/shortcut.test.ts`（8 项）、`src/ui/__tests__/shortcut-hints.test.ts`（7 项）
- [x] 7.9 全仓核对：`index.html` 与 `src/**/*.ts` 的用户可见文案已无 `Ctrl+` / `⌘` 硬编码（仅注释与 `shortcut.ts` 的符号表保留）
- [x] 7.10 release 构建实测：macOS 工具栏 tooltip 显示「保存 (⌘S)」、设置面板与右键菜单显示符号形态
- [x] 7.11 回写 issue #406
