# Spec Delta

## MODIFIED Requirements

### Requirement: 全局快捷键初始化

系统 MUST 通过 `src/utils/keyboard.ts` 的 `initKeyboard` 注册全局键盘事件，并同时支持 Ctrl 与 Cmd 修饰键。快捷键处理 MUST 阻止已处理命令的浏览器默认行为。

原生菜单加速键是首选执行入口：菜单接管该按键时，前端 MUST NOT 再执行同一命令。当原生菜单未接管该按键（菜单项处于禁用状态，或平台把键盘事件留在 webview）时，前端 MUST 执行与菜单相同的命令作为兜底，不得出现「按键被吞且命令不执行」的死键。两个入口 MUST 按跨入口去重，保证同一物理按键在所有入口合计仅执行一次；同来源的重复（用户连按、连续点击菜单项）MUST 各自执行，不得被去重吞掉。

#### Scenario: 保存快捷键
- **WHEN** 用户按 Ctrl/Cmd+S
- **THEN** 系统调用 `saveActiveDocument` 并阻止浏览器保存页面

#### Scenario: 新建文件快捷键
- **WHEN** 用户按 Ctrl/Cmd+N 且未按 Shift
- **THEN** 系统打开工作区内的新建文件对话框

#### Scenario: 原生菜单加速键
- **WHEN** 用户通过原生菜单加速键触发一个已实现的菜单命令
- **THEN** 对应操作仅执行一次，且与菜单项触发的操作相同

#### Scenario: 原生菜单未接管时的兜底
- **WHEN** 菜单项的加速键未被原生菜单接管（菜单项禁用，或事件被留在 webview），且该按键对应一个已实现的命令
- **THEN** 系统执行该命令一次，且不产生任何浏览器默认行为

#### Scenario: 连按不被去重吞掉
- **WHEN** 用户在同一去重窗口内连续两次触发同一个快捷键，且两次都由同一个入口上报
- **THEN** 命令执行两次

#### Scenario: 占位菜单项的加速键
- **WHEN** 用户按下某个尚未实现（置灰）菜单项的加速键
- **THEN** 该按键不被全局处理器吞掉，浏览器与页面默认行为保持可用

## ADDED Requirements

### Requirement: 快捷键提示按平台渲染

界面中展示的快捷键提示 MUST 按运行平台的键位约定渲染，而不是把某一个平台的写法写死：macOS 使用符号形态（`⌘` `⇧` `⌥` `⌃`），其他平台使用名称形态（`Ctrl` `Shift` `Alt`）。

提示的唯一来源 MUST 是与原生菜单加速键同一种平台无关声明（`Mod+S`、`Mod+Shift+F`、`Ctrl+Tab` 等），界面 MUST NOT 在模板、HTML 或组件里硬编码 `Ctrl+` 或 `⌘` 字面量。修饰键顺序 MUST 遵循平台习惯：macOS 为 `⌃⌥⇧⌘`，其他平台为 `Ctrl+Alt+Shift`。无法识别的 token MUST 原样保留，不得静默丢弃。

提示刷新 MUST 幂等：对同一元素重复应用后，提示文本 MUST NOT 出现重复的键位后缀。

#### Scenario: macOS 渲染
- **WHEN** 应用在 macOS 上启动并渲染工具栏、设置面板与右键菜单中的快捷键提示
- **THEN** 提示显示为 `⌘S`、`⇧⌘F`、`⌃Tab` 等符号形态，且不出现 `Ctrl+` 字样

#### Scenario: 非 macOS 渲染
- **WHEN** 应用在非 macOS 平台渲染同一个快捷键
- **THEN** 提示显示为 `Ctrl+S`、`Ctrl+Shift+F` 等名称形态，且不出现 `⌘` 字样

#### Scenario: 提示刷新幂等
- **WHEN** 提示在元素已有提示文本的情况下被再次应用（例如语言切换或重渲染后重跑）
- **THEN** 该元素的提示文本与首次应用结果完全一致，不出现重复的键位后缀

#### Scenario: 未知修饰键 token
- **WHEN** 加速键声明中包含当前平台无法映射的 token
- **THEN** 该 token 按原声明保留在提示中，不被丢弃或替换
