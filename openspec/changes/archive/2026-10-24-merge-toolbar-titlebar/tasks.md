# Tasks: merge-toolbar-titlebar

## 1. Rust / 窗口配置

- [x] 1.1 新增 `src-tauri/tauri.windows.conf.json` 与 `src-tauri/tauri.linux.conf.json`：重复主窗口完整定义（title/width/height/minWidth/minHeight）并加 `"decorations": false`，文件头注释说明需与 `tauri.conf.json` 同步；macOS 与 `tauri.conf.json` 不改动。验证：`npx tauri info` 或 `cargo check` 无配置报错，`git diff main -- src-tauri/tauri.conf.json` 为空
- [x] 1.2 `src-tauri/src/lib.rs` 的 `open_file_in_new_window`：构建器上按 `if !cfg!(target_os = "macos")` 调 `.decorations(false)`，附「为什么」注释（无边框窗口由工具栏承担标题栏，见 window-chrome 规范）。验证：`cargo check --manifest-path src-tauri/Cargo.toml` 通过
- [x] 1.3 `src-tauri/capabilities/window-minimal.json` 追加 `core:window:allow-start-dragging`、`core:window:allow-minimize`、`core:window:allow-toggle-maximize`、`core:window:allow-close`。验证：`cargo check` 后 tauri 构建期 ACL 无未知权限报错

## 2. 前端窗口控制模块

- [x] 2.1 `index.html`：在 `.toolbar-spacer` 之后新增默认 `hidden` 的 `<div class="toolbar-window-controls" id="window-controls">`，含 `win-minimize` / `win-maximize`（内嵌最大化与还原两枚 svg 图标，还原态默认隐藏）/ `win-close` 三个按钮，均为 `type="button"` 且带 `aria-label`。验证：macOS 视觉无变化（hidden），`npm run dev` 无控制台报错
- [x] 2.2 新增 `src/ui/window-controls.ts`：`initWindowControls()` 用 `getCurrentWindow().isDecorated()` 判定，无边框时移除按钮组 `hidden`、给 `#toolbar` 加 `has-window-controls` 类、给 `#toolbar`/`.toolbar-spacer`/`.toolbar-separator` 运行时挂空值 `data-tauri-drag-region`，绑定三个按钮动作（`minimize()` / `toggleMaximize()` / `close()`）并用 `isMaximized()` + `onResized` 同步最大化/还原图标；全程 try/catch，失败走 `logException` 并保持按钮组隐藏。验证：`npx tsc --noEmit` 通过
- [x] 2.3 `src/main.ts` 在 `initToolbar()` 调用点旁挂载 `initWindowControls()`。验证：`npm run build` 通过
- [x] 2.4 `src/styles/toolbar.css`：新增 `.toolbar-window-controls`（flex、`flex-shrink: 0`、通栏高）、`.window-control-btn`（直角、贴右上角、悬停底色）、`.window-control-close:hover`（红底白字）、`.toolbar.has-window-controls { padding-right: 0 }`；不改动现有 `.toolbar-btn` 规则。验证：`npm run build` 通过，macOS 下样式 diff 无视觉影响

## 3. 测试与门禁

- [x] 3.1 新增 `src/ui/__tests__/window-controls.test.ts`（mock `@tauri-apps/api/window`）：覆盖 decorated=true 不显示、undecorated 显示并挂拖拽属性、`isDecorated` 抛异常时降级隐藏并记日志、三个按钮分别调用对应 API、`isMaximized()` 切换图标。验证：`npm test -- src/ui/__tests__/window-controls.test.ts` 通过
- [x] 3.2 全量门禁：`npm test`、`npx tsc --noEmit`、`cargo check --manifest-path src-tauri/Cargo.toml`、`node scripts/check-layering.mjs` 全部通过

## 4. 规范与收尾

- [x] 4.1 确认 `openspec validate merge-toolbar-titlebar` 通过；change 目录内工件齐备（proposal/specs/design/tasks 全 done）。验证：`openspec status --change merge-toolbar-titlebar --json` 显示全部 done

## 完成备注

- 平台配置文件保持纯 JSON：本仓库未启用 tauri 的 `config-json5` feature，`.json` 配置由 serde_json 严格解析，不支持注释，故两份平台文件不含「同步义务」文件头注释。**同步义务记录于此**：`src-tauri/tauri.windows.conf.json` 与 `src-tauri/tauri.linux.conf.json` 的 `app.windows[0]` 必须与 `tauri.conf.json` 主窗口定义保持一致（title/width/height/minWidth/minHeight），后续改窗口属性需同步三处。
- 已验证 `tauri-utils 2.9.1`（Cargo.lock 锁定版本）的合并实现为 `json_patch::merge`（RFC 7386），数组整体替换，重复完整窗口对象是必需的；`label` 缺省时反序列化为 `main`，与主配置一致。
- 窗口控制初始化失败与按钮动作 IPC 失败均走 `logException('window.controls', ...)` 结构化日志；关闭按钮经 `getCurrentWindow().close()` 走 Rust `CloseRequested` 拦截链路，脏检查确认不受影响。
- 任务 1.3 除在 `window-minimal.json` 追加 4 项权限外，还需在 `tauri.conf.json` 的 `app.security.capabilities` 白名单中引用 `window-minimal-capability`：该数组非空时为排他性白名单（tauri-utils `get_capabilities` 只加载被引用的 capability），不引用则整个 capability 不生效。引用为纯 ACL 配置增量，不改任何 UI，macOS 编译产物与运行行为零变化。
