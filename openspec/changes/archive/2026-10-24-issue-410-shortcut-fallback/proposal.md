# Proposal: issue-410-shortcut-fallback

> 覆盖 issue #410（⌘S 失效）与 issue #406（快捷键提示写死 `Ctrl+`，未与平台绑定）。

## Why

macOS 上 ⌘S 保存完全无反应（issue #410），且「打开工作区 + 打开文档」时同样失效——门控与键位注册都不是原因。

实测取证（release 构建）：

- AX 读到「文件 → 保存」`AXEnabled=Y`、`AXMenuItemCmdChar=S`、修饰键 `Command`，与 TextEdit 的「保存」表现一致；
- 鼠标点「文件 → 保存」正常弹保存框；
- 按下 ⌘S，Rust 侧**没有任何** `backend.menu: Native menu action` 记录。

AppKit 的菜单键位匹配先于 webview：菜单接住了，webview 就收不到该 `keydown`。既然事件落到了 webview，说明原生加速键没有接管它（菜单项被判定禁用，或平台把键盘事件留在了 webview）。而 `src/utils/keyboard.ts` 按 `#364` 的设计**只 `preventDefault`、不执行命令**，于是快捷键在全链路上没有任何执行者——「一次按键，零次执行」。

同一根因还解释了另外两个现象：

- `#406` 里按文档写的 `Ctrl+S` 会静默失效（事件被吞、命令不跑）；
- 排障成本极高：菜单动作日志是 `debug` 级，release 构建只保留 `info` 及以上，日志里根本看不出「菜单有没有收到这次激活」。

`#406` 的另一半是提示本身错了：界面提示写死 `Ctrl+S`，而 macOS 的菜单只认 `⌘S`。用户照着提示按，按的是一个菜单从不监听的组合——提示把用户直接引到失败路径上。因此本变更同时把提示改为按平台渲染，与加速键共用同一份平台无关声明。

## What Changes

- `src/utils/keyboard.ts`：`initKeyboard` 接受可选的 `onShortcut` 回调（依赖注入，`utils` 不反向依赖 `ui`）。命中原生加速键时仍 `preventDefault`（继续吞掉浏览器默认行为），随后把 action 交给回调执行——菜单没接管时不再静默失效；`event.repeat` 只吞默认、不重复执行。
- `src/ui/native-menu.ts`：`dispatchNativeMenuAction(action, origin)` 增加入口来源，新增**跨入口去重**——只有「同一 action + 不同来源（菜单 / DOM 兜底）+ 120ms 内」才判为同一次物理按键并跳过；同来源重复（用户连按、双击菜单）永不吞。被跳过的重复不刷新时间窗，避免级联吞掉后续真实按键。`save` handler 增加无活动文档守卫——DOM 兜底绕过了菜单项的禁用标志，无文档时不得把空编辑器当新文件保存。
- `src/main.ts`：装配根接线 `initKeyboard({ onShortcut: (a) => void dispatchNativeMenuAction(a, 'shortcut') })`，并在启动时 `applyShortcutHints()`。
- `src-tauri/src/menu/dispatch.rs`：菜单动作日志 `debug` → `info`，让发布构建能回答「这次激活有没有到后端」。
- `src-tauri/src/menu/mod.rs`：门控与真实能力对齐——`save` / `save-as` / 导出子菜单改为 `Requires::Document`（无路径时保存对话框会问写到哪，不需要工作区），`new-file` 改为 `Requires::Always`（无工作区时回退系统保存对话框）；`Requires::WorkspaceAndDocument` 因此没有使用者，删除以免留下死变体。
- `src/utils/shortcut.ts`（新）+ `src/infra/platform.ts`（新）+ `src/ui/shortcut-hints.ts`（新）：平台无关的加速键声明 → 按平台渲染的提示文本（macOS `⌘S` / 其他 `Ctrl+S`），并提供幂等的 `applyShortcutHints` 为 `[data-shortcut]` 元素补提示。
- `index.html` / `src/ui/settings/markup.ts` / `src/ui/editor-context-menu.ts` / `src/ui/document-tabs.ts`：清掉写死的 `Ctrl+` 与 `⌘`，统一走 `data-shortcut` 声明与 `shortcutLabel()`。

## Capabilities

### Modified Capabilities

- `keyboard-shortcuts`：把「前端不得重复处理同一按键事件」改写为「同一物理按键在所有入口合计仅执行一次」，并明确「原生菜单未接管时由前端兜底执行同一命令」这一契约；新增「快捷键提示按平台渲染」要求（单一声明源、平台修饰键顺序、幂等刷新、未知 token 原样保留）。
- `native-menu-bar`：保存类操作的门控从「工作区 + 文档」改为「文档」，「无工作区」场景拆成「有文档 / 无文档」两条，使菜单可用性与应用真实能力一致（用户要求：无工作区也要能保存文档）。
