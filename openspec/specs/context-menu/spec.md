# context-menu Specification

## Purpose
定义 MarkFlow 右键菜单的 API、DOM 结构、定位和关闭交互规范。

## Agent Context
- **源码入口：** `src/components/ui/contextMenu.ts`；调用方包括 `src/components/contextMenu.ts` 和 `src/components/imageContextMenu.ts`。
- **关联规范：** `safe-dom-construction`、`sidebar`、`dialog-system`。
- **不变量：** 菜单必须经统一工厂创建；关闭行为不得泄漏全局事件监听器；用户可控标签必须作为文本插入。
- **验证：** `npm test -- src/components/contextMenu.test.ts`；`npx openspec validate context-menu --strict`。

> 定义 MarkFlow 所有右键菜单（Context Menu）的统一结构和交互模式

## Requirements

### Requirement: 右键菜单 API

所有右键菜单 MUST 通过统一的 `showContextMenuStatic()` API 创建。

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

#### Scenario: 通过统一 API 创建菜单
- **WHEN** 调用方需要显示右键菜单
- **THEN** 调用 `showContextMenuStatic(items, position, options)` 创建菜单

### Requirement: 右键菜单 DOM 结构

右键菜单 MUST 使用规定的容器、菜单项和分隔线 DOM 结构。

```html
<div id="context-menu" class="context-menu">
  <button class="context-menu-item">菜单项</button>
  <button class="context-menu-item danger">危险操作</button>
  <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">
  <button class="context-menu-item">更多操作</button>
</div>
```

#### Scenario: 菜单按规定结构渲染
- **WHEN** 右键菜单包含普通项、危险项和分隔线
- **THEN** 菜单渲染对应的 `.context-menu`、按钮和分隔线元素

### Requirement: 右键菜单交互

右键菜单 MUST 按规定完成定位、关闭和单例交互。

**定位**

菜单位置 SHALL 由 `clampMenuPosition()` 函数限定在视口内，确保菜单不会超出屏幕边界。

#### Scenario: 菜单位置被限定在视口内
- **WHEN** position 靠近屏幕边缘
- **THEN** 菜单被调整到视口范围内

**关闭方式**

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

**单例行为**

同一时刻只显示一个右键菜单。后一次调用 `showContextMenuStatic` 会自动关闭前一个菜单。

#### Scenario: 显示新菜单时自动关闭之前的
- **WHEN** 连续调用两次 showContextMenuStatic
- **THEN** 后一次调用关闭前一次的菜单

### Requirement: 右键菜单无障碍属性

右键菜单容器 SHALL 设置 `role="menu"`。每个菜单项 SHALL 设置 `role="menuitem"`。禁用的菜单项 SHALL 设置 `aria-disabled="true"`。

#### Scenario: 菜单容器具有正确 ARIA 属性
- **WHEN** 右键菜单被创建并显示
- **THEN** 容器元素 SHALL 具有 `role="menu"`

#### Scenario: 菜单项具有正确 ARIA 属性
- **WHEN** 菜单项被渲染
- **THEN** 每个菜单项按钮 SHALL 具有 `role="menuitem"`

#### Scenario: 禁用菜单项具有 aria-disabled
- **WHEN** 菜单项被标记为禁用状态
- **THEN** 该菜单项 SHALL 具有 `aria-disabled="true"`

### Requirement: 右键菜单焦点管理

右键菜单显示时 SHALL 将焦点移到第一个菜单项。ESC 关闭菜单时 SHALL 恢复焦点到触发菜单的元素。

#### Scenario: 菜单显示时焦点移到第一项
- **WHEN** 右键菜单被创建并显示
- **THEN** 焦点 SHALL 移动到第一个非分隔线的菜单项

#### Scenario: ESC 关闭并恢复焦点
- **WHEN** 用户在菜单打开时按下 Escape 键
- **THEN** 菜单关闭
- **THEN** 焦点 SHALL 恢复到触发菜单的元素
