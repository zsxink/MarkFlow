# context-menu Specification

## Purpose
定义 MarkFlow 右键菜单的 API、DOM 结构、定位和关闭交互规范。

## Agent Context
- **源码入口：** `src/ui/context-menu.ts`（统一工厂）；调用方包括 `src/ui/editor-context-menu.ts`（默认编辑菜单）、`src/ui/file-tree-context-menu.ts`、`src/ui/frontmatter-panel.ts`、`src/ui/table-context-menu.ts`、`src/ui/image-context-menu.ts`、`src/ui/diagram-context-menu.ts` / `mermaid-context-menu.ts` / `plantuml-context-menu.ts`。
- **关联规范：** `safe-dom-construction`、`sidebar`、`dialog-system`、`frontmatter-visual-editor`。
- **不变量：** 菜单必须经统一工厂创建；关闭行为不得泄漏全局事件监听器；用户可控标签必须作为文本插入。
- **子菜单契约：** 菜单项支持 `icon` / `disabled` / `shortcut` / `submenu`，子菜单由同一工厂渲染并按 `data-menu-path` 路径分发（路径分段即 `submenu` 数组下标），因此**分隔线也占一个下标**，调用方不得按「可见按钮序号」索引；子菜单支持鼠标悬停与 `ArrowRight` / `ArrowLeft` 展开收起，主面板与子面板均实测尺寸后贴合光标并在空间不足时向相反方向翻转。
- **验证：** `npm test -- src/ui/__tests__/context-menu.test.ts src/ui/__tests__/file-tree-context-menu.test.ts src/ui/__tests__/diagram-context-menu.test.ts`；`npx openspec validate context-menu --strict`。

> 定义 MarkFlow 所有右键菜单（Context Menu）的统一结构和交互模式

## Requirements

### Requirement: 右键菜单 API

所有右键菜单 MUST 通过统一的 `showContextMenuStatic()` API 创建。

所有右键菜单 SHALL 通过 `showContextMenuStatic()` 工厂函数创建：

```typescript
showContextMenuStatic(items: ContextMenuItem[], position: { x: number; y: number }, options?: ContextMenuOptions): void
```

**ContextMenuItem:**
- `label?: string` — 菜单项显示文本
- `icon?: string` — 左侧图标（作为文本渲染）
- `onClick?: () => void` — 点击执行的回调函数
- `danger?: boolean` — 标记为危险操作（红色样式）
- `divider?: boolean` — 分隔线，为 true 时忽略其他字段
- `disabled?: boolean` — 禁用项，渲染 `aria-disabled="true"` 与 `disabled`，不参与键盘导航
- `shortcut?: string` — 右侧快捷键提示文案（仅展示，不绑定按键）
- `submenu?: ContextMenuItem[]` — 子菜单项列表，非空时渲染 chevron 与 `aria-haspopup="menu"`

**ContextMenuOptions:**
- `containerId?: string` — 容器元素 ID，默认 `'context-menu'`
- `className?: string` — 追加到 `.context-menu` 的额外 CSS 类

#### Scenario: 通过统一 API 创建菜单
- **WHEN** 调用方需要显示右键菜单
- **THEN** 调用 `showContextMenuStatic(items, position, options)` 创建菜单

### Requirement: 右键菜单 DOM 结构

右键菜单 MUST 使用规定的容器、菜单项和分隔线 DOM 结构。

```html
<div id="context-menu" class="context-menu" role="menu">
  <button class="context-menu-item" role="menuitem" data-menu-path="0">菜单项</button>
  <button class="context-menu-item danger" role="menuitem" data-menu-path="1">危险操作</button>
  <hr class="context-menu-divider" role="separator">
  <!-- 带子菜单的项包在 entry 里，子面板与主面板共用渲染函数 -->
  <div class="context-menu-entry">
    <button class="context-menu-item has-submenu" role="menuitem" aria-haspopup="menu" aria-expanded="false" data-menu-path="2">更多操作<span class="context-menu-chevron" aria-hidden="true">›</span></button>
    <div class="context-menu-submenu-panel" role="menu" hidden>
      <button class="context-menu-item" role="menuitem" data-menu-path="2.0">子项</button>
    </div>
  </div>
</div>
```

#### Scenario: 菜单按规定结构渲染
- **WHEN** 右键菜单包含普通项、危险项和分隔线
- **THEN** 菜单渲染对应的 `.context-menu`、按钮和分隔线元素

#### Scenario: 带子菜单的项渲染 entry 与子面板
- **WHEN** 菜单项提供非空 `submenu`
- **THEN** 该项渲染为 `.context-menu-entry` 内的 `has-submenu` 按钮加同级的 `.context-menu-submenu-panel`
- **THEN** 子项路径以父项路径为前缀（如 `2.0`），分隔线同样占用一个下标

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

### Requirement: 节点类型专用菜单

当用户右键的命中区域位于特定节点类型（如表格单元格、图片、Mermaid/PlantUML 渲染块）时，系统 SHALL 提供该节点类型的专用菜单，仍通过统一 `showContextMenuStatic` API 创建，遵循本规范的 DOM 结构、定位与关闭交互。专用菜单内容 MUST 与节点能力对应：表格单元格菜单含行列增删、对齐与表头操作；图片菜单含图片编辑；渲染块菜单含导出与复制。触发专用菜单的主要命中必须与统一菜单（通用文本编辑项）正确分流，不得同时弹出两套菜单。

#### Scenario: 单元格右键弹出表格专用菜单
- **WHEN** 用户在表格单元格内右键
- **THEN** 弹出由 `showContextMenuStatic` 创建的表格专用菜单，含行列增删、对齐、表头切换、删除表格项
- **THEN** 不额外叠加通用文本菜单

#### Scenario: 插入句柄右键作用域解析到最近行列
- **WHEN** 用户在表格边界插入句柄（行句柄/列句柄）上右键
- **THEN** 弹出与单元格右键相同的表格专用菜单，作用域解析到该句柄对应的最近行/列
- **THEN** 行句柄右键以该行首个单元格为作用域锚点，列句柄右键以该分界线右侧列的单元格为锚点

#### Scenario: 渲染块右键弹出导出菜单
- **WHEN** 用户在 Mermaid/PlantUML 渲染块内右键
- **THEN** 弹出导出 SVG/PNG、复制等渲染块专用菜单
- **THEN** 菜单定位与关闭行为与通用菜单一致

#### Scenario: 非特殊节点右键走通用菜单
- **WHEN** 用户在普通段落文本上右键
- **THEN** 弹出通用文本编辑菜单，不出现节点专用项

### Requirement: 编辑区域默认编辑菜单

对于未由专用菜单处理的应用区域，系统 SHALL 提供默认编辑右键菜单；该菜单 SHALL 根据当前编辑模式提供剪切、复制、粘贴、纯文本粘贴、全选及适用的链接、文本格式、段落和插入操作。只读文档 SHALL 禁用会修改内容的操作。可编辑表单控件 SHALL 提供适用于当前选区的文本操作。

#### Scenario: 普通所见即所得文本右键
- **WHEN** 用户在普通段落文本上右键
- **THEN** 系统显示默认编辑菜单，菜单操作作用于右键位置或保留的选区

#### Scenario: 源码模式右键
- **WHEN** 用户在源码编辑区右键
- **THEN** 系统显示剪切、复制、粘贴、纯文本粘贴和全选，并保留源码模式的光标和选区语义

#### Scenario: 专用菜单继续优先
- **WHEN** 用户在表格、图片或 Mermaid/PlantUML 渲染内容上右键
- **THEN** 系统只显示该内容已有的专用菜单，图片和图表的导出操作保持不变

#### Scenario: 只读文档
- **WHEN** 用户在只读文档的编辑区域右键
- **THEN** 剪切、粘贴、格式、段落和插入操作不可用
- **THEN** 复制和全选仍可用

### Requirement: 统一右键菜单视觉与子菜单

所有通过统一菜单工厂创建的右键菜单 SHALL 使用一致的紧凑圆角表面、清晰分组、可辨识的焦点/悬停/禁用状态和视口内定位。菜单项 SHALL 可包含快捷键提示或子菜单；子菜单 SHALL 可通过鼠标和键盘打开，且不得超出视口。

#### Scenario: 专用菜单使用统一视觉
- **WHEN** 系统显示文件、Frontmatter、表格、图片或图表专用菜单
- **THEN** 它们 SHALL 使用与默认编辑菜单相同的菜单表面、字号、圆角、间距与焦点样式

#### Scenario: 打开子菜单
- **WHEN** 用户悬停或键盘聚焦带子菜单的菜单项并向右展开
- **THEN** 对应子菜单显示在主菜单旁边并保持在视口范围内

#### Scenario: 菜单靠近视口边缘
- **WHEN** 主菜单或子菜单打开位置靠近窗口边缘
- **THEN** 系统调整其位置以保证菜单内容可见
