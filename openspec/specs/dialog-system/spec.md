# dialog-system Specification

## Purpose
定义 MarkFlow 对话框的结构、样式、交互行为与创建方式。

## Agent Context
- **源码入口：** `src/components/ui/modal.ts`、`src/components/newFileDialog.ts` 与 `src/components/linkDialog.ts`。
- **关联规范：** `context-menu`、`safe-dom-construction`、`sidebar`。
- **不变量：** 对话框遮罩和焦点必须在关闭时清理；Escape/关闭按钮不得执行主操作；表单内容不得以不安全 HTML 拼接用户输入。
- **验证：** `npm test -- src/components`；`npx openspec validate dialog-system --strict`。

> 定义 MarkFlow 所有对话框的统一结构、样式和交互模式

## Requirements

### Requirement: 对话框结构

所有对话框 MUST 使用规定的遮罩、卡片、标题、内容和按钮区域结构。

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

#### Scenario: 工厂创建对话框结构
- **WHEN** 对话框工厂打开一个对话框
- **THEN** 遮罩层被追加到 `document.body`，并包含规定的对话框结构

### Requirement: 对话框 CSS 规范

对话框样式 MUST 符合遮罩、卡片、标题、按钮和输入框的规定。

**遮罩层**

`.modal-overlay` SHALL 使用：
- `position: fixed; inset: 0` — 固定覆盖全屏
- `background: rgba(0, 0, 0, 0.4)` — 半透明黑色遮罩
- `display: flex; align-items: center; justify-content: center` — flex 居中
- `z-index: 100` — 防止被其他元素遮挡

`.modal-overlay[hidden]` SHALL 使用 `display: none !important`（因 flex 优先级高于 HTML hidden 属性）。

**对话框卡片**

`.modal` SHALL 使用：
- `background: var(--surface)` — 背景色跟随主题
- `border-radius: 12px`
- `box-shadow: var(--shadow)`
- `max-height: 80vh; overflow: hidden`
- `display: flex; flex-direction: column`

**标题栏**

`.modal-header` SHALL 使用：
- `display: flex; align-items: center; justify-content: space-between`
- `padding: 16px 24px`
- `border-bottom: 1px solid var(--border)`
- `font-size: 16px; font-weight: 600`

**关闭按钮**

`.modal-close` SHALL 使用：
- `background: none; border: none`
- `font-size: 20px; cursor: pointer`
- `color: var(--muted)`
- `:hover` 时颜色切换为 `var(--fg)`

**按钮**

**主按钮（`.btn-primary`）**：
- `padding: 8px 20px`
- `background: var(--accent); color: white; border: none`
- `border-radius: 6px; font-size: 13px; cursor: pointer`

**次按钮（`.btn-secondary`）**：
- `padding: 8px 20px`
- `background: transparent; color: var(--fg)`
- `border: 1px solid var(--border); border-radius: 6px; font-size: 13px; cursor: pointer`

按钮组（`.modal-footer`）SHALL 使用 flex row、`justify-content: flex-end`、`gap: 8px`。

**输入框**

对话框中的表单输入框 SHALL 使用：
- `width: 100%; padding: 10px 16px`
- `border: 1px solid var(--border); border-radius: 6px`
- `font-size: 14px; font-family: var(--font-ui); outline: none`
- `color: var(--fg); background: var(--surface)`
- `:focus` 时 `border-color: var(--accent)`

#### Scenario: 对话框应用规定样式
- **WHEN** 对话框及其控件显示
- **THEN** 它们使用本要求规定的 CSS 样式

### Requirement: 对话框输入框应禁用浏览器自动填充

新建文件、文件夹等对话框中的输入框 SHALL 显式禁用浏览器自动填充及相关浏览器输入特性，避免显示已保存的表单内容。

```html
<input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
```

**根因**: 浏览器默认会自动填充表单。

**教训**: 桌面应用中的表单需要显式禁用浏览器特性。

#### Scenario: 输入框禁用自动填充
- **WHEN** 新建文件或文件夹对话框显示输入框
- **THEN** 输入框设置 `autocomplete="off"` 及规定的浏览器输入属性

### Requirement: 对话框隐藏状态应覆盖 flex 显示规则

当对话框遮罩层使用 `hidden` 属性时，`.modal-overlay[hidden]` SHALL 使用 `display: none !important`，确保隐藏属性覆盖 `.modal-overlay` 的 `display: flex`。

```css
.modal-overlay[hidden] {
  display: none !important;
}
```

**根因**: CSS `display: flex` 优先级高于 HTML `hidden` 属性。

**教训**: HTML `hidden` 属性的优先级较低，需要用 CSS 显式处理。

**宽度变体**

不同用途的对话框使用不同宽度，通过作用域类名控制（不修改通用 `.modal` 样式）：

| 类型 | 宽度 | 方式 | 示例 |
|------|------|------|------|
| 简单输入 | 360px | `showDialog({ width: '360px' })` | 新建文件/文件夹、关闭时未保存提示 |
| 图片插入 | 480px | `showModal()` content 内含样式 | 插入/编辑图片 |
| 链接插入 | 自适应 | `showModal()` 内无指定宽度 | 插入链接 |
| 外部冲突 | 520px | `showDialog({ width: '520px' })` | 外部修改/删除冲突 |

#### Scenario: hidden 状态隐藏遮罩层
- **WHEN** 对话框遮罩层设置 `hidden` 属性
- **THEN** `.modal-overlay[hidden]` 使用 `display: none !important` 隐藏遮罩层

### Requirement: 链接插入对话框

系统 MUST 通过 `src/components/linkDialog.ts` 的 `showLinkDialog` 提供链接插入对话框。对话框 MUST 验证 URL 仅使用 `http` 或 `https` 协议；在源码模式插入 Markdown 链接，在所见即所得模式应用链接标记。用户选择自动填充且页面标题获取失败时，显示文本 MUST 回退为 URL。

#### Scenario: 在源码模式插入链接
- **WHEN** 用户在源码模式确认有效 URL 和链接文本
- **THEN** 系统在当前选择处插入 `[文本](URL)` 并触发输入事件

#### Scenario: 自动填充失败时使用 URL
- **WHEN** 用户启用自动填充且页面标题请求失败
- **THEN** 系统使用 URL 作为链接显示文本并完成插入

#### Scenario: 拒绝不受支持的链接协议
- **WHEN** 用户确认非 `http` 或 `https` 的 URL
- **THEN** 系统显示错误提示且不修改编辑器内容

### Requirement: 对话框交互

所有对话框 MUST 支持规定的关闭、焦点管理、滚动锁定和按钮行为。

**关闭方式**

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

**焦点管理**

焦点 SHALL 遵循以下规则：
- 对话框打开时自动聚焦到第一个 primary 按钮，无 primary 时聚焦到第一个普通按钮
- 对话框内 Tab 键焦点循环（focus trap），不会移出对话框

**滚动锁定**

对话框打开时 SHALL 锁定 `document.body` 滚动（`overflow: hidden`），关闭时恢复。

**按钮行为**

- 确定性操作（确定、保存、替换等）使用 `btn-primary`
- 取消/关闭类操作使用 `btn-secondary`
- 主要按钮在对话框内通常放在右侧

#### Scenario: 打开对话框时管理焦点和滚动
- **WHEN** 对话框打开
- **THEN** 焦点位于规定的对话框内按钮，且 `document.body` 滚动被锁定

### Requirement: 对话框创建方式

所有对话框 SHALL 通过以下三个统一工厂函数创建，而非直接操作 DOM：

**showDialog — 通用对话框（Promise 模式）**

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

**showModal — 内容型弹窗**

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

**showContextMenuStatic — 右键菜单**

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

#### Scenario: 通过统一工厂创建对话框
- **WHEN** 调用方需要创建通用或内容型对话框
- **THEN** 使用 `showDialog` 或 `showModal` 工厂函数创建，而非直接操作 DOM
