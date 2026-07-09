# MarkFlow 右键菜单规范

> 定义 MarkFlow 所有右键菜单（Context Menu）的统一结构和交互模式

## 1. API

所有右键菜单 SHALL 通过 `showContextMenuStatic()` 工厂函数创建：

```typescript
showContextMenuStatic(items: ContextMenuItem[], position: { x: number; y: number }, options?: ContextMenuOptions): void
```

**ContextMenuItem:**
- `label: string` — 菜单项显示文本
- `onClick?: () => void` — 点击执行的回调函数
- `danger?: boolean` — 标记为危险操作（红色样式）
- `divider?: boolean` — 分隔线，为 true 时忽略其他字段

**ContextMenuOptions:**
- `containerId?: string` — 容器元素 ID，默认 `'context-menu'`
- `className?: string` — 追加到 `.context-menu` 的额外 CSS 类

## 2. DOM 结构

```html
<div id="context-menu" class="context-menu">
  <button class="context-menu-item">菜单项</button>
  <button class="context-menu-item danger">危险操作</button>
  <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">
  <button class="context-menu-item">更多操作</button>
</div>
```

## 3. 交互规范

### 3.1 定位

菜单位置 SHALL 由 `clampMenuPosition()` 函数限定在视口内，确保菜单不会超出屏幕边界。

#### Scenario: 菜单位置被限定在视口内
- **WHEN** position 靠近屏幕边缘
- **THEN** 菜单被调整到视口范围内

### 3.2 关闭方式

右键菜单 SHALL 支持以下关闭方式：
1. 点击菜单项 — 执行 onClick 后关闭
2. 点击菜单外部区域 — 直接关闭
3. 按 Escape 键 — 直接关闭
4. 页面滚动 — 直接关闭

#### Scenario: 点击菜单项执行对应操作并关闭
- **WHEN** 用户点击一个菜单项
- **THEN** 该项的 onClick 被调用，菜单关闭

#### Scenario: 点击菜单外部自动关闭
- **WHEN** 用户点击菜单之外的区域
- **THEN** 菜单关闭

### 3.3 单例行为

同一时刻只显示一个右键菜单。后一次调用 `showContextMenuStatic` 会自动关闭前一个菜单。

#### Scenario: 显示新菜单时自动关闭之前的
- **WHEN** 连续调用两次 showContextMenuStatic
- **THEN** 后一次调用关闭前一次的菜单
