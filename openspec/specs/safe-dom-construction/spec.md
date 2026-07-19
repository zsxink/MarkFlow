# safe-dom-construction Specification

## Purpose
定义处理用户可控内容时的安全 DOM 构造、事件委托和空状态渲染要求。

## Agent Context
- **源码入口：** `src/components/contextMenu.ts`、`src/components/sidebar.ts` 与 `src/components/ui/contextMenu.ts`。
- **关联规范：** `context-menu`、`dialog-system`、`sidebar`。
- **不变量：** 用户可控字符串不得进入 `innerHTML`；可交互列表使用事件委托；空状态与错误状态也遵循安全 DOM API。
- **验证：** `npm test -- src/components`；`npx openspec validate safe-dom-construction --strict`。

## Requirements

### Requirement: 具有用户控制内容的 DOM 构建应使用安全的 DOM API

The system SHALL NOT use `innerHTML` (or `insertAdjacentHTML`, `outerHTML`) to insert user-controlled strings — including file names, file paths, folder paths, document content, or any data deserialized from external sources — into the document. Code SHALL use `document.createElement` + `textContent` / `dataset` / `setAttribute` instead.

#### Scenario: 带有HTML特殊字符的文件名显示为纯文本
- **WHEN** 最近的文件条目的名称包含 `<`、`>`、`"`、`'` 或 `&`
- **THEN** 名称应在菜单中显示为文字，不发生 HTML 解析

#### Scenario: 带有类似脚本内容的文件名可以正确打开文件
- **WHEN** 最近的文件条目的名称类似于 `<img src=x onerror=alert(1)>`
- **THEN** 点击该条目应打开实际文件路径，而不是执行注入的内容

#### Scenario: 注入属性的文件路径被视为路径数据
- **WHEN** 最近的文件条目的路径字符串包含 `"` 或 `>` 等字符
- **THEN** 路径应按原样存储在 `dataset.path` 中，没有 HTML 属性注入

### Requirement: 菜单事件应使用事件委托

The recent files and recent folders menus SHALL use event delegation (a single `click` listener on the container) instead of per-item `addEventListener` calls, matching the `dataset.path` and `dataset.type` attributes on the target element.

#### Scenario: 点击最近的文件菜单项打开文件
- **WHEN** 用户单击最近文件容器中的 `.app-menu-item` 按钮
- **THEN** `dataset.path` 处的文件应在编辑器中打开

#### Scenario: 单击最近使用的文件夹菜单项将打开该文件夹
- **WHEN** 用户单击最近使用的文件夹容器中的 `.app-menu-item` 按钮
- **THEN** `dataset.path`的文件夹应设置为工作空间

### Requirement: 空状态消息应使用安全的 DOM API

The "无" empty state message SHALL be constructed using `document.createTextNode` or `textContent`, not `innerHTML`.

#### Scenario: 最近没有文件显示空状态文本
- **WHEN** `recentFiles` 数组为空
- **THEN** 容器应将空状态文本显示为纯文本

### Requirement: 章节标题是静态的，对于innerHTML来说是安全的

Menu section title strings (e.g., "最近打开的文件") are compile-time constants with no user data — they SHALL remain as `innerHTML` or be migrated to safe DOM at implementor's discretion.

#### Scenario: 静态部分标题正确渲染
- **WHEN** 菜单渲染
- **THEN** 章节标题应正常显示
