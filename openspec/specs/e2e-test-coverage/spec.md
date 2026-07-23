# e2e-test-coverage Specification

## Purpose

定义 e2e 端到端测试覆盖范围，确保 MarkFlow 核心用户工作流有自动化测试保护。

## Agent Context

- **测试框架：** WebdriverIO + Tauri Plugin + Mocha（`e2e/wdio.conf.mjs`）
- **测试编排：** `e2e/run.mjs`
- **Page Object：** `e2e/page-objects/app.mjs`
- **测试文件：** `e2e/specs/smoke/*.e2e.mjs`、`e2e/specs/regression/*.e2e.mjs`
- **不变量：** smoke 测试必须全部通过才能合入 PR；regression 测试按需运行
- **验证：** `npm run test:e2e`（smoke 套件）

## Requirements

### Requirement: 文件打开与内容加载

系统 SHALL 支持在文件树中点击 Markdown 文件后，编辑器正确加载并显示文件内容。

#### Scenario: 点击 welcome.md 后编辑器显示标题和段落
- **WHEN** 应用启动完成，点击文件 tab，然后点击文件树中的 welcome.md
- **THEN** WYSIWYG 编辑器区域显示包含 `MarkFlow E2E Testing` 的文本内容

### Requirement: 编辑、保存与重新加载

系统 SHALL 支持用户在源码模式编辑内容、手动保存，并且保存的内容被正确持久化到磁盘。

#### Scenario: 在源码模式编辑保存后磁盘内容一致
- **WHEN** 用户切换到源码模式，在编辑器输入新内容，然后点击保存按钮
- **THEN** 磁盘上的文件内容包含用户新增的文本

#### Scenario: 保存后 WYSIWYG 模式显示已保存内容
- **WHEN** 用户在源码模式编辑并保存内容，然后切换回 WYSIWYG 模式
- **THEN** WYSIWYG 编辑器显示包含用户新增文本的内容

### Requirement: 设置面板 tab 切换

设置面板 SHALL 支持切换不同的配置 tab，切换后对应面板内容显示。

#### Scenario: 从通用 tab 切换到外观 tab
- **WHEN** 用户点击设置按钮打开设置面板，然后点击「外观」tab
- **THEN** 通用面板隐藏，外观面板显示

### Requirement: 设置面板主题切换

设置面板 SHALL 支持点击主题色块切换主题，选中后色块显示 selected 状态。

#### Scenario: 切换到深色主题
- **WHEN** 用户在设置面板的外观 tab 中点击「深色」主题色块
- **THEN** 深色主题色块获得选中状态（`selected` class）
- **AND** 浅色主题色块失去选中状态

### Requirement: 设置面板状态保持

设置面板 SHALL 在关闭后重新打开时，保留之前在 UI 上所做的选择状态。

#### Scenario: 关闭并重新打开设置后主题选择保留
- **WHEN** 用户在设置面板中选择深色主题，关闭设置面板，然后再次打开设置面板
- **THEN** 深色主题色块仍为选中状态
