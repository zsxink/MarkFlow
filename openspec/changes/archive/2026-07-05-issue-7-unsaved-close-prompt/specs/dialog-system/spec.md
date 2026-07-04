## ADDED Requirements

### Requirement: Modal overlay structure

所有对话框 SHALL 使用以下 DOM 结构：

```
<div class="modal-overlay" id="{dialog-id}" [hidden]>
  <div class="modal">
    <div class="modal-header">
      <span>{标题文字}</span>
      <button class="modal-close">✕</button>
    </div>
    <!-- 对话框内容区域（padding: 16px 24px） -->
    <div style="padding:16px 24px;">
      <!-- 各种表单控件、文字、按钮组 -->
    </div>
    <div class="modal-footer">
      <button class="btn-secondary">{次要按钮}</button>
      <button class="btn-primary">{主要按钮}</button>
    </div>
  </div>
</div>
```

`modal-footer` 为可选行，适用于需要多按钮操作的对话框。

#### Scenario: 点击遮罩层关闭
- **WHEN** 对话框打开时
- **AND** 用户点击 `.modal-overlay` 区域（而非 `.modal` 内部）
- **THEN** 对话框关闭

#### Scenario: 点击关闭按钮
- **WHEN** 对话框打开时
- **AND** 用户点击 `.modal-close` 按钮
- **THEN** 对话框关闭

#### Scenario: 点击取消按钮
- **WHEN** 对话框打开时
- **AND** 用户点击 `btn-secondary` 且文字为「取消」
- **THEN** 对话框关闭

### Requirement: Modal CSS specification

`.modal-overlay` SHALL 使用固定定位（`position: fixed; inset: 0`），半透明黑色背景（`rgba(0, 0, 0, 0.4)`），flex 居中子元素，z-index 100。
`.modal-overlay[hidden]` SHALL 使用 `display: none !important;` 隐藏（因 flex 优先级高于 HTML hidden 属性）。

`.modal` SHALL 使用背景色 `var(--surface)`，圆角 `12px`，盒子阴影 `var(--shadow)`，最大高度 `80vh`，flex column 布局，溢出隐藏。

`.modal-header` SHALL 使用 flex row 布局，对齐 `center`，两端分布（`justify-content: space-between`），内边距 `16px 24px`，底部边框 `1px solid var(--border)`，字号 `16px`，字重 `600`。

`.modal-close` SHALL 无背景无边框，字号 `20px`，颜色 `var(--muted)`，悬停时颜色 `var(--fg)`。

对话框内容区域 SHALL 使用内边距 `padding: 16px 24px`。

#### Scenario: 新对话框使用统一样式
- **WHEN** 在 MarkFlow 中添加新对话框
- **THEN** 开发者引用上述 modal CSS 变量和类名，确保新对话框与已有对话框视觉一致

### Requirement: Button styles

所有对话框中的按钮 SHALL 使用以下两类按钮样式：

**主按钮（`.btn-primary`）**：
- 内边距 `8px 20px`
- 背景色 `var(--accent)`
- 文字颜色 `white`
- 无边框，圆角 `6px`
- 字号 `13px`，字体 `var(--font-ui)`
- 鼠标样式 `pointer`

**次按钮（`.btn-secondary`）**：
- 内边距 `8px 20px`
- 背景色 `transparent`
- 文字颜色 `var(--fg)`
- 边框 `1px solid var(--border)`，圆角 `6px`
- 字号 `13px`，字体 `var(--font-ui)`
- 鼠标样式 `pointer`

按钮组（`.modal-footer`）SHALL 使用 flex row，`justify-content: flex-end`，间距 `gap: 8px`。

#### Scenario: 操作按钮使用正确样式
- **WHEN** 对话框中包含确定性操作按钮（确定、保存、替换等）
- **THEN** 使用 `btn-primary` 作为主要操作按钮
- **AND** 取消/关闭类操作使用 `btn-secondary`

### Requirement: Input field styles

对话框中的表单输入框 SHALL 使用以下样式：
- 宽度 `100%`（fill parent）
- 内边距 `10px 16px`
- 边框 `1px solid var(--border)`，圆角 `6px`
- 字号 `14px`，字体 `var(--font-ui)`
- 文字颜色 `var(--fg)`，背景色 `var(--surface)`
- 聚焦时边框颜色切换为 `var(--accent)`
- 无轮廓线（`outline: none`）

#### Scenario: 输入框获得焦点
- **WHEN** 用户点击对话框中的输入框
- **THEN** 输入框边框颜色从 `var(--border)` 变为 `var(--accent)`

### Requirement: Close behaviors

所有对话框 SHALL 支持以下关闭方式：
1. 点击 `.modal-close`（✕）按钮
2. 点击 `.btn-secondary` 取消按钮（如有）
3. 点击遮罩层（`.modal-overlay`）背景区域
4. Docker with 显示状态更新：设置 `overlay.hidden = true`

#### Scenario: 手动设置 hidden
- **WHEN** 对话框逻辑完成（如保存成功）
- **THEN** 代码显式设置 `overlay.hidden = true`

### Requirement: Appear against the backdrop

所有对话框 SHALL 使用 `modal-overlay` 包装，确保：
- 背景半透明遮罩（`rgba(0, 0, 0, 0.4)`）
- 对话框水平垂直居中
- z-index 100 防止被其他元素遮挡

#### Scenario: 对话框打开时背景不可操作
- **WHEN** 对话框打开（`overlay.hidden = false`）
- **THEN** 遮罩层覆盖整个窗口，阻止与背景元素的交互

### Requirement: Dialog width variants

不同用途的对话框 SHALL 使用不同的宽度：
- 简单输入类（新建文件/文件夹）：360px（`.newfile-modal .modal`）
- 图片插入类（含 tabs + 文件选择）：480px（`.image-insert-dialog .modal`）
- 链接插入类：不固定宽度，使用默认 modal 宽度（自适应内容）
- 外部冲突提示类：520px（`.external-conflict-modal`）
- 保存确认类（待实现）：360px

宽度样式通过作用域类名（`.image-insert-dialog .modal`）控制，不修改通用 `.modal` 样式。

#### Scenario: 对话框宽度合理
- **WHEN** 用户打开任意对话框
- **THEN** 对话框宽度根据内容类型使用合适的宽度，不溢出屏幕

### Requirement: Dialog creation pattern

所有对话框 SHALL 遵循以下 TypeScript 创建模式：

1. HTML 中预置 `<div id="{dialog-id}" class="modal-overlay" hidden>` 占位
2. 调用函数时通过 `innerHTML` 设置 `.modal` 内容
3. 绑定事件监听器（关闭按钮、操作按钮、遮罩层点击、键盘事件）
4. 设置 `overlay.hidden = false` 显示
5. 关闭时设置 `overlay.hidden = true`

#### Scenario: 对话框正确初始化
- **WHEN** 对话框创建函数被调用
- **THEN** 获取 overlay 元素，设置 innerHTML，绑定事件，显示
- **AND** 所有事件监听器在对话框显示前绑定完成
