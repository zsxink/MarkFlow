# Proposal: merge-toolbar-titlebar

## Why

目前 Windows/Linux 上应用窗口顶部有两层横栏：系统标题栏（最小化/最大化/按钮所在）+ 应用自己的工具栏。工具栏独占一整行，看起来像多出来的一条空栏，在小屏笔记本上明显挤压编辑区。macOS 的菜单栏本来就在屏幕顶部的系统菜单栏里，本次不改 macOS，只把 Windows/Linux 的窗口控制按钮与工具栏合并到同一行。

## What Changes

- Windows/Linux 上隐藏系统标题栏（`decorations: false`），主窗口通过平台配置文件 `tauri.windows.conf.json` / `tauri.linux.conf.json` 生效，辅助窗口（打开文件新建的 `window-*`）在 Rust 侧按平台条件关闭装饰。
- `#toolbar` 右侧新增窗口控制按钮组（最小化 / 最大化-还原 / 关闭），仅当窗口处于无边框状态时显示；macOS 与浏览器环境保持隐藏，视觉零变化。
- `#toolbar` 及其空白区（spacer、分隔线）在无边框窗口下声明 `data-tauri-drag-region`，支持拖拽移动窗口、双击最大化/还原；按钮与 MarkFlow 菜单入口不触发拖拽。
- 关闭按钮复用现有 `CloseRequested` 拦截链路：未保存文档仍走确认弹窗，不绕过脏检查。
- 最大化/还原图标随窗口状态同步（监听 resize 事件）。
- capability 补充窗口操作权限（start-dragging / minimize / toggle-maximize / close）。
- macOS 路径完全不变：`tauri.conf.json` 不动，Rust 平台分支为编译期条件，前端默认隐藏控制按钮。

## Capabilities

### New Capabilities

- `window-chrome`: 定义 Windows/Linux 无边框窗口的自绘标题栏行为——窗口控制按钮、拖拽区域、双击最大化、与现有关闭确认流程的集成，以及 macOS 保持系统标题栏不变的边界。

### Modified Capabilities

（无 — `toolbar-layout`、`native-menu-bar` 的现有需求不变；工具栏仍是单行布局，原生菜单栏不受影响。）

## Impact

- `src-tauri/tauri.windows.conf.json`、`src-tauri/tauri.linux.conf.json`（新增，重复主窗口定义并加 `decorations: false`）
- `src-tauri/src/lib.rs`（辅助窗口按平台关装饰）
- `src-tauri/capabilities/window-minimal.json`（新增窗口操作权限）
- `index.html`（工具栏尾部新增默认 `hidden` 的窗口控制按钮组）
- `src/ui/window-controls.ts`（新增，初始化控制按钮与拖拽区域）
- `src/styles/toolbar.css`（窗口控制按钮样式）
- `src/main.ts`（初始化挂载）
- 已知风险：Windows/Linux 无边框窗口的边缘拖拽缩放与最大化尺寸依赖 tao 的平台行为，需真机验证；macOS 二进制与行为不受影响。
