# keyboard-shortcuts Specification

## Purpose
定义全局键盘快捷键的初始化、编辑器命令映射及其对文件操作和界面模式的约束。

## Agent Context
- **源码入口：** `src/utils/keyboard.ts`、`src/main.ts`、`src/components/linkDialog.ts`。
- **关联规范：** `sidebar`、`dialog-system`、`url-decoration`。
- **不变量：** Ctrl/Cmd 均应可用；已处理命令必须阻止浏览器默认行为；输入控件与编辑器自身快捷键不得被全局处理器误吞。
- **验证：** `npm test -- src/utils`；`npx openspec validate keyboard-shortcuts --strict`。

## Requirements

### Requirement: 全局快捷键初始化

系统 MUST 通过 `src/utils/keyboard.ts` 的 `initKeyboard` 注册全局键盘事件，并同时支持 Ctrl 与 Cmd 修饰键。快捷键处理 MUST 阻止已处理命令的浏览器默认行为。

#### Scenario: 保存快捷键
- **WHEN** 用户按 Ctrl/Cmd+S
- **THEN** 系统调用 `saveActiveDocument` 并阻止浏览器保存页面

#### Scenario: 新建文件快捷键
- **WHEN** 用户按 Ctrl/Cmd+N 且未按 Shift
- **THEN** 系统打开工作区内的新建文件对话框

### Requirement: 编辑器与界面快捷键

系统 MUST 提供粗体、斜体、删除线、链接、编辑器模式切换、侧边栏折叠和专注模式的快捷键。链接快捷键 MUST 拒绝不支持的协议。

#### Scenario: 切换编辑器模式
- **WHEN** 用户按 Ctrl/Cmd+/
- **THEN** 系统在所见即所得模式和源码模式之间切换，并更新模式按钮和状态指示器

#### Scenario: 不安全链接协议被拒绝
- **WHEN** 用户按 Ctrl/Cmd+K 后输入不受支持的 URL 协议
- **THEN** 系统显示错误提示且不创建链接
