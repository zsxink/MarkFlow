## ADDED Requirements

### Requirement: showModal 函数

系统 SHALL 提供 `showModal(options: ModalOptions): { element: HTMLElement, hide(): void }` 函数，用于创建内容型弹窗。

**ModalOptions:**
- `content: string | HTMLElement` — 弹窗主体内容。字符串作为 innerHTML 设置，HTMLElement 直接挂载
- `className?: string` — 额外 CSS class 追加到 `.modal` 容器上（如 `'modal-settings'`）
- `onClose?: () => void` — 弹窗关闭时的回调

**返回值：**
- `element: HTMLElement` — 创建的 `.modal` 容器元素，调用方可用其内部的元素绑定事件
- `hide(): void` — 编程关闭弹窗

#### Scenario: 创建弹窗并显示
- **WHEN** 调用 `showModal({ content: '...' })`
- **THEN** 创建一个 modal-overlay 追加到 document.body，.modal 容器包含 content

#### Scenario: 通过 hide() 关闭
- **WHEN** 调用返回的 `hide()` 方法
- **THEN** modal-overlay 从 document.body 移除，onClose 回调被执行

#### Scenario: 通过 backdrop 点击关闭
- **WHEN** 用户点击 overlay（不是 modal 内部）
- **THEN** 弹窗关闭，onClose 回调被执行

#### Scenario: 通过 Escape 关闭
- **WHEN** 用户按 Escape 键
- **THEN** 弹窗关闭，onClose 回调被执行

#### Scenario: 弹窗不影响其余文档滚动
- **WHEN** 弹窗打开
- **THEN** 页面滚动被锁定（`document.body.style.overflow = 'hidden'`）
- **WHEN** 弹窗关闭
- **THEN** 滚动恢复
