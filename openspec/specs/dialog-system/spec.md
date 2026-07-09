# MarkFlow 对话框系统规范

> 定义 MarkFlow 所有对话框的统一结构、样式和交互模式

## 1. Modal 结构

所有对话框 SHALL 使用以下 DOM 结构：

```html
<div class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <span>{标题文字}</span>
      <button class="modal-close" data-dialog-close>✕</button>
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

注意：overlay 在运行时由工厂函数动态创建并追加到 `document.body`，HTML 中不再需要预置 overlay 元素。`.modal` 和 `.modal-footer` 为可选样式层 —— 简单对话框的按钮由 `showDialog` 自动生成，仅内容型弹窗需要手动编写内部结构。

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

| 类型 | 宽度 | 方式 | 示例 |
|------|------|------|------|
| 简单输入 | 360px | `showDialog({ width: '360px' })` | 新建文件/文件夹、关闭时未保存提示 |
| 图片插入 | 480px | `showModal()` content 内含样式 | 插入/编辑图片 |
| 链接插入 | 自适应 | `showModal()` 内无指定宽度 | 插入链接 |
| 外部冲突 | 520px | `showDialog({ width: '520px' })` | 外部修改/删除冲突 |

## 3. 交互规范

### 3.1 关闭方式

所有对话框 SHALL 支持以下关闭方式：
1. 点击 `.modal-close`（✕）按钮
2. 点击前景操作按钮（确认 / 保存等）
3. 点击「取消」按钮（btn-secondary，文字为取消）
4. 点击遮罩层（`.modal-overlay`）背景区域
5. 按下 Escape 键
6. 代码调用 `hide()` 或 Promise resolve

交互示例（点击遮罩层）：
- **WHEN** 对话框打开时
- **AND** 用户点击 `.modal-overlay` 区域（而非 `.modal` 内部）
- **THEN** 对话框关闭

交互示例（程序关闭）：
- **WHEN** 代码调用 `hide()`（showModal）或 Promise resume（showDialog）
- **THEN** overlay DOM 元素从 `document.body` 中移除

### 3.2 焦点管理

焦点 SHALL 遵循以下规则：
- 对话框打开时自动聚焦到第一个 primary 按钮，无 primary 时聚焦到第一个普通按钮
- 对话框内 Tab 键焦点循环（focus trap），不会移出对话框

### 3.3 滚动锁定

对话框打开时 SHALL 锁定 `document.body` 滚动（`overflow: hidden`），关闭时恢复。

### 3.4 按钮行为

- 确定性操作（确定、保存、替换等）使用 `btn-primary`
- 取消/关闭类操作使用 `btn-secondary`
- 主要按钮在对话框内通常放在右侧

## 4. 创建模式

所有对话框 SHALL 通过以下三个统一工厂函数创建，而非直接操作 DOM：

### 4.1 showDialog — 通用对话框（Promise 模式）

适用于多按钮、需用户选择的对话框。

```typescript
showDialog(options: DialogOptions): Promise<string | null>
```

**流程**：
1. `showDialog` 创建 `.modal-overlay` 元素并 `appendChild` 到 `document.body`
2. 内部根据 `title`、`body`、`buttons` 参数构建 `.modal` 内容
3. 绑定 backdrop 点击、Escape 键、X 按钮、按钮点击事件
4. 用户点击按钮时 Promise resolve 该按钮的 `value`，关闭并移除 overlay
5. 用户通过 X / backdrop / Escape 关闭时 resolve `null`

**DialogOptions**:
- `title: string` — 标题
- `body: string | HTMLElement` — 正文（字符串直接 innerHTML，HTMLElement 插入）
- `buttons: Array<{ label, value, primary?, danger? }>` — 按钮定义
- `width?: string` — 对话框宽度（默认 `'360px'`）
- `onClose?: () => void` — 关闭回调

### 4.2 showModal — 内容型弹窗

适用于设置页、新建文件等复杂内容场景。

```typescript
showModal(options: ModalOptions): { element: HTMLElement, hide(): void }
```

**流程**：
1. `showModal` 动态创建 `.modal-overlay` 并追加到 `document.body`
2. 调用方提供 `content`（innerHTML 字符串或 HTMLElement），插入 `.modal` 容器
3. 绑定 backdrop 点击、Escape 键关闭，锁定页面滚动
4. 调用方通过 `hide()` 编程关闭

**ModalOptions**:
- `content: string | HTMLElement` — 弹窗内容
- `className?: string` — 追加到 `.modal` 的 CSS 类
- `onClose?: () => void` — 关闭回调

### 4.3 showContextMenuStatic — 右键菜单

```typescript
showContextMenuStatic(items: ContextMenuItem[], position: {x, y}, options?): void
```

**流程**：
1. 复用或创建 `#context-menu` 骨架
2. 调用 `clampMenuPosition` 将菜单位置限定在视口内
3. 绑定外部点击关闭、Escape 关闭、滚动关闭
4. 点击菜单项执行对应 `onClick` 后自动关闭
5. 后一次调用自动关闭前一次菜单

**ContextMenuItem**:
- `label: string`
- `onClick?: () => void`
- `danger?: boolean`
- `divider?: boolean`
