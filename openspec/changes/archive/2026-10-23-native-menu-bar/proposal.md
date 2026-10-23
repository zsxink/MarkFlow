# Proposal

## Why

桌面端当前使用 Tauri/系统默认菜单，菜单内容与 MarkFlow 的文件、编辑、插入、格式及视图能力脱节，尤其 Windows/Linux 缺少可用菜单。为使常用操作可发现并统一菜单与快捷键入口，需要提供跨平台、与应用状态联动的原生菜单栏。

## What Changes

- 使用 Tauri v2 菜单 API 创建 macOS 与 Windows/Linux 对应的中文菜单结构，并保留尚未实现的菜单项为禁用状态。
- 将已实现菜单操作通过统一 `menu:action` 事件分发到前端现有命令逻辑；系统原生编辑、窗口和应用菜单项使用 Tauri 预定义菜单项。
- 根据工作区、活动文档及最近文件状态启用或禁用关联菜单项；同步原生菜单加速键与前端快捷键，避免重复处理。
- 新增原生菜单栏行为规范及分发器测试。

## Capabilities

### New Capabilities
- `native-menu-bar`: 跨平台原生菜单栏结构、文案、操作分发及状态联动。

### Modified Capabilities
- `keyboard-shortcuts`: 原生菜单加速键与现有快捷键共用一致的命令行为，避免重复绑定冲突。

## Impact

- Rust：`src-tauri/src/lib.rs` 及可能的菜单状态/事件支持代码。
- 前端：新增菜单操作分发器，并复用 `src/utils/keyboard.ts` 与现有文件、编辑器、视图及设置操作。
- 测试：前端分发器单测及必要的 Rust 菜单构造检查。
- OpenSpec：新增 `native-menu-bar` 能力，更新 `keyboard-shortcuts` 能力。
