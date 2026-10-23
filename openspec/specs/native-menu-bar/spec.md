# native-menu-bar Specification

## Purpose
为 MarkFlow 桌面端提供可发现、跨平台且随应用状态变化的原生菜单入口，使用户能从菜单栏执行常用操作并理解暂未支持的能力范围。

## Agent Context
- **源码入口：** Rust `src-tauri/src/menu.rs`（菜单结构、事件派发、状态联动命令）、`src-tauri/src/lib.rs`（注册 `on_menu_event`/`set_menu`/`update_menu_state`）；前端 `src/utils/nativeMenu.ts`（统一动作分发器）、`src/utils/keyboard.ts`（加速键镜像）、`src/main.ts`（初始化）。
- **关联规范：** `keyboard-shortcuts`、`document-tabs`、`dialog-system`、`context-menu`、`crash-logging`。
- **不变量：** 菜单不得在 Rust 侧重复实现前端业务逻辑；菜单加速键与前端快捷键单一来源；未实现能力保留原位并置灰。
- **验证：** `cargo test --manifest-path src-tauri/Cargo.toml`（`menu::tests`）；`npm test -- src/utils/nativeMenu.test.ts src/utils/keyboard.test.ts`；`npx openspec validate native-menu-bar --strict`。

## Requirements

### Requirement: 跨平台原生菜单结构
应用 MUST 提供中文原生菜单栏。macOS 菜单顺序 MUST 为 MarkFlow、文件、编辑、插入、格式、视图、窗口、帮助；Windows/Linux MUST 为文件、编辑、插入、格式、视图、窗口、帮助。尚未实现的菜单能力 MUST 保留在规定位置并呈禁用状态。

#### Scenario: macOS 菜单顺序
- **WHEN** 用户在 macOS 打开应用菜单栏
- **THEN** 菜单依次显示 MarkFlow、文件、编辑、插入、格式、视图、窗口、帮助，且应用菜单系统项顺序正确

#### Scenario: Windows 和 Linux 菜单顺序
- **WHEN** 用户在 Windows 或 Linux 打开应用菜单栏
- **THEN** 菜单依次显示文件、编辑、插入、格式、视图、窗口、帮助

#### Scenario: 暂不支持的操作
- **WHEN** 用户查看尚未实现的菜单能力
- **THEN** 对应菜单项仍显示在定义的位置且不可执行

### Requirement: 菜单操作分发
已实现的应用菜单操作 MUST 执行对应的应用行为，菜单不得在 Rust 侧重复实现前端业务逻辑。菜单加速键 MUST 与其对应快捷键行为一致。

#### Scenario: 已实现菜单项执行
- **WHEN** 用户选择一个已启用的应用功能菜单项
- **THEN** 应用执行该菜单项对应的操作

#### Scenario: 禁用菜单项不可执行
- **WHEN** 用户尝试选择一个禁用菜单项
- **THEN** 应用不执行对应操作

#### Scenario: 仅调试构建可用的菜单项
- **WHEN** 某个菜单项依赖仅调试构建提供的能力（如开发者工具），而当前为发布构建
- **THEN** 该菜单项显示在原位置并呈禁用状态，不得出现点击后无任何反应的可用菜单项

### Requirement: 菜单状态联动
菜单项 MUST 根据工作区、活动文档及最近打开文件状态反映操作是否可用。

#### Scenario: 无工作区
- **WHEN** 当前窗口未打开工作区
- **THEN** 新建文件、新建文件夹、保存、另存为及导出操作不可用

#### Scenario: 无活动文档
- **WHEN** 当前工作区没有活动文档
- **THEN** 保存、导出、格式、插入、查找替换及关闭标签页操作不可用

#### Scenario: 没有最近文件
- **WHEN** 最近打开文件列表为空
- **THEN** 最近打开的文件子菜单不可用

### Requirement: 平台应用菜单行为
macOS MUST 在应用菜单提供关于、设置、服务、隐藏、隐藏其他、显示全部及退出等系统标准操作；Windows/Linux MUST 在文件菜单提供设置与退出，并在帮助菜单提供关于 MarkFlow。

#### Scenario: macOS 应用菜单
- **WHEN** 用户在 macOS 打开 MarkFlow 应用菜单
- **THEN** 关于、设置、服务、隐藏、隐藏其他、显示全部及退出按定义顺序显示，且不在帮助菜单重复显示关于

#### Scenario: Windows/Linux 设置与关于
- **WHEN** 用户在 Windows 或 Linux 打开文件及帮助菜单
- **THEN** 设置和退出位于文件菜单末尾，关于 MarkFlow 位于帮助菜单
