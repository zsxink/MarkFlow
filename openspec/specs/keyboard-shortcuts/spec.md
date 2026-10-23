# keyboard-shortcuts Specification

## Purpose
定义全局键盘快捷键的初始化、编辑器命令映射及其对文件操作和界面模式的约束。

## Agent Context
- **源码入口：** `src/utils/keyboard.ts`（全局处理器与原生加速键镜像）、`src/ui/native-menu.ts`（原生菜单动作分发器）、`src-tauri/src/menu/`（加速键定义）、`src/main.ts`、`src/ui/link-dialog.ts`。
- **关联规范：** `native-menu-bar`、`sidebar`、`dialog-system`、`url-decoration`。
- **不变量：** Ctrl/Cmd 均应可用；已处理命令必须阻止浏览器默认行为；输入控件与编辑器自身快捷键不得被全局处理器误吞；已由原生菜单加速键接管的命令不得在前端重复执行。
- **验证：** `npm test -- src/utils`；`npx openspec validate keyboard-shortcuts --strict`。

## Requirements

### Requirement: 全局快捷键初始化
系统 MUST 通过 `src/utils/keyboard.ts` 的 `initKeyboard` 注册全局键盘事件，并同时支持 Ctrl 与 Cmd 修饰键。快捷键处理 MUST 阻止已处理命令的浏览器默认行为。已由原生菜单加速键接管的命令 MUST 与菜单触发相同操作，且前端不得重复处理同一按键事件。

#### Scenario: 保存快捷键
- **WHEN** 用户按 Ctrl/Cmd+S
- **THEN** 系统调用 `saveActiveDocument` 并阻止浏览器保存页面

#### Scenario: 新建文件快捷键
- **WHEN** 用户按 Ctrl/Cmd+N 且未按 Shift
- **THEN** 系统打开工作区内的新建文件对话框

#### Scenario: 原生菜单加速键
- **WHEN** 用户通过原生菜单加速键触发一个已实现的菜单命令
- **THEN** 对应操作仅执行一次，且与菜单项触发的操作相同

#### Scenario: 占位菜单项的加速键
- **WHEN** 用户按下某个尚未实现（置灰）菜单项的加速键
- **THEN** 该按键不被全局处理器吞掉，浏览器与页面默认行为保持可用

### Requirement: 编辑器与界面快捷键
系统 MUST 提供粗体、斜体、删除线、链接、编辑器模式切换、侧边栏折叠和专注模式的快捷键。链接快捷键 MUST 拒绝不支持的协议。

#### Scenario: 切换编辑器模式
- **WHEN** 用户按 Ctrl/Cmd+/
- **THEN** 系统在所见即所得模式和源码模式之间切换，并更新模式按钮和状态指示器

#### Scenario: 不安全链接协议被拒绝
- **WHEN** 用户按 Ctrl/Cmd+K 后输入不受支持的 URL 协议
- **THEN** 系统显示错误提示且不创建链接

### Requirement: 多文档标签快捷键
系统 MUST 支持 Ctrl/Cmd+T 新建空白标签、Ctrl/Cmd+W 关闭活动标签、Ctrl/Cmd+Shift+T 恢复最近关闭、Ctrl+Tab 与 Ctrl+Shift+Tab 循环切换，并阻止已处理命令的默认行为。设置或确认模态显示时 MUST 抑制标签命令。鼠标中键 MUST 关闭目标标签。

#### Scenario: 循环切换
- **WHEN** 用户在末尾标签按 Ctrl+Tab 或首个标签按 Ctrl+Shift+Tab
- **THEN** SHALL 分别循环到首个或末尾标签，保留各自未保存内容

#### Scenario: 模态保护
- **WHEN** 设置或确认模态打开且用户触发标签快捷键
- **THEN** SHALL 不新建、不切换、不关闭标签

#### Scenario: 中键关闭
- **WHEN** 用户在非活动标签上按鼠标中键
- **THEN** SHALL 针对该标签执行关闭语义，并阻止浏览器中键默认行为
