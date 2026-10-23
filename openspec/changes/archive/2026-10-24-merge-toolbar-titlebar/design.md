# Design: merge-toolbar-titlebar

## Context

- `tauri.conf.json` 主窗口未设 `titleBarStyle` / `decorations`，使用系统默认标题栏；`#toolbar` 是 `#app` grid 的独立一行（`--toolbar-h: 44px`），含 MarkFlow 菜单入口、文件/格式/模式按钮与末尾 `.toolbar-spacer`。
- 辅助窗口由 `src-tauri/src/lib.rs` 的 `open_file_in_new_window` 用 `WebviewWindowBuilder` 创建（label 形如 `window-<ts>`），与主窗口加载同一 `index.html`。
- 关闭链路：Rust 侧 `intercept_close_request` 拦截 `CloseRequested` → 向对应窗口 emit `close-requested` → 前端做未保存确认后再次放行。任何自绘关闭入口都必须复用该链路。
- Tauri 2.11 注入的 drag-region 脚本语义：事件 target 沿 composed path 向上找 `data-tauri-drag-region`；`BUTTON/A/INPUT` 等 clickable 元素无该属性时阻断拖拽；属性值为空/`true` 仅 element 自身命中生效，`deep` 对子树生效，`false` 显式禁用。双击拖拽区自动调用 `internal_toggle_maximize`（该权限已在 `core:window:default` 中）。
- `core:window:default` 权限集已含 `allow-is-decorated`、`allow-is-maximized`、`allow-internal-toggle-maximize`，不含 `allow-start-dragging`、`allow-minimize`、`allow-toggle-maximize`、`allow-close`。

## Goals / Non-Goals

**Goals:**

- Windows/Linux：窗口顶部只剩工具栏一行，内嵌窗口控制按钮，支持拖拽移动与双击最大化。
- macOS：编译产物与运行行为零变化。
- 关闭按钮与现有脏检查确认链路集成；初始化失败安全降级。

**Non-Goals:**

- macOS 的 `titleBarStyle: Overlay` / traffic-light 内边距适配（用户明确不改 macOS）。
- Windows 11 Snap Layout 悬停弹层、WCO（Window Controls Overlay）方案。
- 全屏态的特殊工具栏处理（Windows/Linux 实际以最大化为等效场景；原生菜单的 Fullscreen 项为 macOS 专属 predefined item）。
- 工具栏按钮收纳进「更多」菜单（现有 flex 收缩已保证 800px 最小宽度不换行，见 Risks）。

## Decisions

1. **主窗口去装饰用平台配置文件，而非运行时 `set_decorations`**：新增 `src-tauri/tauri.windows.conf.json` 与 `tauri.linux.conf.json`，各自重复主窗口完整定义并加 `"decorations": false`。理由：窗口创建前生效，无「先出原生标题栏再撕掉」的闪烁；`tauri.conf.json` 与 macOS 路径零改动。Tauri 对配置数组采用整体替换合并，因此必须重复完整窗口对象（在两份平台文件顶部注释说明与主配置保持同步）。备选：`visible: false` + setup 里 `show()` —— 会推迟 macOS 首帧，否决。
2. **辅助窗口在 Rust 侧按编译期平台关装饰**：`open_file_in_new_window` 中 `if !cfg!(target_os = "macos") { builder = builder.decorations(false); }`，macOS 二进制走完全相同分支。
3. **前端以 `getCurrentWindow().isDecorated()` 为单一开关**：返回 false（无边框）才显示控制按钮、给 `#toolbar`/`.toolbar-spacer`/`.toolbar-separator` 运行时挂 `data-tauri-drag-region`（空值，非 `deep`）。理由：与窗口真实状态（而非平台嗅探）绑定，天然覆盖「浏览器 dev 环境」「macOS」「无边框 Windows/Linux」三种情形；HTML 中按钮组默认 `hidden`，macOS 与测试环境无任何视觉变化。不用 `deep`：`deep` 会把 MarkFlow 菜单入口（无 role 的 div）卷入拖拽路径，菜单点击可能被原生拖拽吞掉；空值属性 + 只挂空白元素语义最精确。属性运行时挂而非写死 HTML，避免 macOS 双击工具栏触发最大化（改变 macOS 行为）。
4. **新模块 `src/ui/window-controls.ts`，由 `main.ts` 与 `initToolbar()` 相邻处调用**：职责为「查状态 → 显示按钮组 → 绑定 minimize/toggleMaximize/close → 监听 resize 同步最大化图标」。关闭调 `getCurrentWindow().close()`，触发 Rust `CloseRequested` 拦截，复用脏检查链路。任何异常 catch 后经 `logException` 记录并保持按钮组隐藏，不阻断启动。
5. **权限放进 `capabilities/window-minimal.json`**（`windows: ["*"]`），并在 `tauri.conf.json` 的 `app.security.capabilities` 白名单中引用 `window-minimal-capability`：主窗口与辅助窗口同用一套窗口控制，需同时授权；显式补 `core:window:allow-start-dragging`、`allow-minimize`、`allow-toggle-maximize`、`allow-close` 四项（其余查询项已在 default 集内）。前提修正：capability 文件本身不会自动生效——当 `app.security.capabilities` 为非空数组时，Tauri（tauri-utils `get_capabilities`）将其视为**排他性白名单**，仅加载被引用的 capability 标识符；`window-minimal.json` 必须在白名单中列出才会构建进 ACL。引用是一行配置增量，纯 ACL 授权、不改任何 UI，macOS 编译产物与运行行为零变化。
6. **窗口控制按钮用独立样式类**（`.toolbar-window-controls` / `.window-control-btn`），不套 `.toolbar-btn`：标题栏按钮需通栏高度、直角贴边、右对齐贴住窗口右上角（`.toolbar.has-window-controls { padding-right: 0 }`），关闭钮悬停用 Windows 惯例红底。窄窗口下按钮组 `flex-shrink: 0`，工具按钮沿用现有收缩行为，800px 最小宽度不换行。
7. **测试策略**：`src/ui/__tests__/window-controls.test.ts` mock `@tauri-apps/api/window`，覆盖 decorated/undecorated/异常三态与按钮动作绑定；现有 toolbar 测试自建 DOM、不依赖新增标记，不受影响。Rust 侧无可单测的纯逻辑（平台分支为编译期），依赖 `cargo check`/`clippy` 门禁。

## Risks / Trade-offs

- [Windows/Linux 无边框窗口的边缘拖拽缩放与最大化尺寸依赖 tao 平台行为（Windows 依赖 `shadow` 命中测试，Linux GTK 视 WM 而定）] → 保持 `shadow` 默认值不关；设计中列为真机验证项，UI 路径（按钮/双击/拖动）不依赖它。
- [平台配置文件与主配置的窗口定义重复，未来改窗口尺寸需同步三处] → 文件头注释标明同步义务；后续可在 CI 加一致性检查（本期不做）。
- [自绘关闭按钮若 IPC 失败，用户失去右上角关闭入口] → 降级后仍有原生菜单 文件→退出 与 Alt+F4；失败写入结构化日志。
- [maximized 图标同步依赖 `onResized` 事件频率] → 仅做图标切换，无布局计算，开销可忽略；初始化时主动查一次 `isMaximized`。

## Migration Plan

纯增量改动，无数据迁移。回滚 = revert 分支提交；macOS 不受影响故无平台级回滚风险。

## Open Questions

无（Windows/Linux 真机缩放行为已知为验证项，不阻塞本设计与任务拆分）。
