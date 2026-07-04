# MarkFlow 对话框系统规范

> 定义 MarkFlow 所有对话框的统一结构、样式和交互模式

## 1. Modal 结构

所有对话框 SHALL 使用以下 DOM 结构：

```html
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

## 2. CSS 规范

### 2.1 Overlay

`.modal-overlay` SHALL 使用：
- `position: fixed; inset: 0` — 固定覆盖全屏
- `background: rgba(0, 0, 0, 0.4)` — 半透明黑色遮罩
- `display: flex; align-items: center; justify-content: center` — flex 居中
- `z-index: 100` — 防止被其他元素遮挡

`.modal-overlay[hidden]` SHALL 使用 `display: none !important`（因 flex 优先级高于 HTML hidden 属性）。

### 2.2 Modal 卡片

`.modal` SHALL 使用：
- `background: var(--surface)` — 背景色跟随主题
- `border-radius: 12px`
- `box-shadow: var(--shadow)`
- `max-height: 80vh; overflow: hidden`
- `display: flex; flex-direction: column`

### 2.3 标题栏

`.modal-header` SHALL 使用：
- `display: flex; align-items: center; justify-content: space-between`
- `padding: 16px 24px`
- `border-bottom: 1px solid var(--border)`
- `font-size: 16px; font-weight: 600`

### 2.4 关闭按钮

`.modal-close` SHALL 使用：
- `background: none; border: none`
- `font-size: 20px; cursor: pointer`
- `color: var(--muted)`
- `:hover` 时颜色切换为 `var(--fg)`

### 2.5 按钮

**主按钮（`.btn-primary`）**：
- `padding: 8px 20px`
- `background: var(--accent); color: white; border: none`
- `border-radius: 6px; font-size: 13px; cursor: pointer`

**次按钮（`.btn-secondary`）**：
- `padding: 8px 20px`
- `background: transparent; color: var(--fg)`
- `border: 1px solid var(--border); border-radius: 6px; font-size: 13px; cursor: pointer`

按钮组（`.modal-footer`）SHALL 使用 flex row、`justify-content: flex-end`、`gap: 8px`。

### 2.6 输入框

对话框中的表单输入框 SHALL 使用：
- `width: 100%; padding: 10px 16px`
- `border: 1px solid var(--border); border-radius: 6px`
- `font-size: 14px; font-family: var(--font-ui); outline: none`
- `color: var(--fg); background: var(--surface)`
- `:focus` 时 `border-color: var(--accent)`

### 2.7 宽度变体

不同用途的对话框使用不同宽度，通过作用域类名控制（不修改通用 `.modal` 样式）：

| 类型 | 宽度 | 类名 | 示例 |
|------|------|------|------|
| 简单输入 | 360px | `.newfile-modal .modal` | 新建文件/文件夹 |
| 图片插入 | 480px | `.image-insert-dialog .modal` | 插入/编辑图片 |
| 链接插入 | 自适应 | 无指定 | 插入链接 |
| 外部冲突 | 520px | `.external-conflict-modal` | 外部修改/删除冲突 |
| 保存确认 | 360px | `.unsaved-modal .modal` | 关闭时未保存提示 |

## 3. 交互规范

### 3.1 关闭方式

所有对话框 SHALL 支持以下关闭方式：
1. 点击 `.modal-close`（✕）按钮
2. 点击「取消」按钮（btn-secondary，文字为取消）
3. 点击遮罩层（`.modal-overlay`）背景区域
4. 按下 Escape 键
5. 代码显式设置 `overlay.hidden = true`

交互示例（点击遮罩层）：
- **WHEN** 对话框打开时
- **AND** 用户点击 `.modal-overlay` 区域（而非 `.modal` 内部）
- **THEN** 对话框关闭

交互示例（手动设置 hidden）：
- **WHEN** 对话框逻辑完成（如保存成功）
- **THEN** 代码显式设置 `overlay.hidden = true`

### 3.2 按钮行为

- 确定性操作（确定、保存、替换等）使用 `btn-primary`
- 取消/关闭类操作使用 `btn-secondary`
- 主要按钮在对话框内通常放在右侧

## 4. 创建模式

所有对话框 SHALL 遵循以下 TypeScript 创建模式：

1. HTML 中预置 `<div id="{dialog-id}" class="modal-overlay" hidden>` 占位元素
2. 调用函数时通过 `innerHTML` 设置 `.modal` 内的内容
3. 绑定事件监听器（关闭按钮、操作按钮、遮罩层点击、键盘事件）
4. 设置 `overlay.hidden = false` 显示对话框
5. 关闭时设置 `overlay.hidden = true`

交互示例（对话框正确初始化）：
- **WHEN** 对话框创建函数被调用
- **THEN** 获取 overlay 元素，设置 innerHTML，绑定事件，显示
- **AND** 所有事件监听器在对话框显示前绑定完成
