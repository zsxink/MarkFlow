## ADDED Requirements

### Requirement: showDialog 函数

系统 SHALL 提供 `showDialog(options: DialogOptions): Promise<string | null>` 函数，用于创建通用对话框。

**DialogOptions:**
- `title: string` — 对话框标题
- `body: string | HTMLElement` — 对话框正文内容（文本自动包裹 `<p>`，HTMLElement 直接插入）
- `buttons: Array<{ label: string; value: string; primary?: boolean; danger?: boolean }>` — 底部按钮数组
- `width?: string` — 对话框宽度（如 `'360px'`），默认 `'360px'`
- `onClose?: () => void` — 关闭时的回调

**返回值：**
- 用户点击某个按钮时，resolve 该按钮的 `value`
- 用户通过 X 按钮/backdrop 点击/Escape 关闭时，resolve `null`
- 同一个对话框只能 resolve 一次（防止重复点击导致多次 resolve）

#### Scenario: 点击按钮关闭并返回值
- **WHEN** 用户点击对话框中的一个按钮
- **THEN** Promise resolve 该按钮的 `value`，对话框关闭

#### Scenario: 点击 backdrop 关闭返回 null
- **WHEN** 用户点击对话框背后的 backdrop（overlay 遮罩层）
- **THEN** Promise resolve `null`，对话框关闭

#### Scenario: 按 Escape 关闭返回 null
- **WHEN** 用户按 Escape 键
- **THEN** Promise resolve `null`，对话框关闭

#### Scenario: 点击 X 按钮关闭返回 null
- **WHEN** 用户点击对话框标题栏的 X 按钮
- **THEN** Promise resolve `null`，对话框关闭

#### Scenario: 重复点击不重复 resolve
- **WHEN** 用户快速多次点击同一按钮
- **THEN** 按钮的 click handler 只执行一次，Promise 只 resolve 一次

#### Scenario: overlay 被自动移除
- **WHEN** 对话框关闭（不论何种方式）
- **THEN** overlay DOM 元素从 `document.body` 中移除

#### Scenario: 关闭回调被执行
- **WHEN** 对话框关闭
- **THEN** `onClose` 回调被调用（在 Promise resolve 之后）

### Requirement: 焦点管理

对话框打开时，SHALL 自动将焦点移到第一个 primary 按钮，或第一个普通按钮，或 X 按钮。

#### Scenario: 打开对话框后焦点的初始位置
- **WHEN** 对话框打开
- **THEN** 焦点在第一个 primary 按钮上
- **WHEN** 没有 primary 按钮
- **THEN** 焦点在第一个普通按钮上

#### Scenario: 焦点在对话框内循环（focus trap）
- **WHEN** 用户按 Tab
- **THEN** 焦点在对话框内的可聚焦元素之间循环，不会移出对话框
- **WHEN** 用户按 Shift+Tab
- **THEN** 焦点反向循环，不会移出对话框
