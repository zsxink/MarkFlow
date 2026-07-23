# dialog-system Specification

## Purpose
定义 MarkFlow 对话框的结构、样式、交互行为与创建方式。

This delta spec documents the DOM structure changes in the settings panel: tab reorganization, removal of the livePreview toggle, image panel form element changes, and PlantUML layout adjustments.

## Agent Context
- **源码入口：** `src/components/ui/modal.ts`、`src/components/newFileDialog.ts` 与 `src/components/linkDialog.ts`。
- **关联规范：** `context-menu`、`safe-dom-construction`、`sidebar`。
- **不变量：** 对话框遮罩和焦点必须在关闭时清理；Escape/关闭按钮不得执行主操作；表单内容不得以不安全 HTML 拼接用户输入。
- **验证：** `npm test -- src/components`；`npx openspec validate dialog-system --strict`。
Same as `openspec/specs/dialog-system/spec.md`.

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

不同用途的对话框使用不同宽度，通过作用域类名或 `showDialog({ width })` 控制（不修改通用 `.modal` 样式）：

| 类型 | 宽度 | 方式 | 示例 |
|------|------|------|------|
| 简单输入 | 360px | `showDialog({ width: '360px' })` | 新建文件/文件夹 |
| 图片插入 | 480px | `showModal({ className: 'image-insert-dialog' })`，由 `.image-insert-dialog` 类自身设定宽度（`.image-insert-dialog { width: 480px }`） | 插入/编辑图片 |
| 未保存提示 | 320px | `showDialog({ width: '320px', padding: '12px 20px' })` | 切换文件未保存确认 |
| 链接插入 | 自适应 | `showModal()` 内无指定宽度 | 插入链接 |
| 外部冲突 | 520px | `showDialog({ width: '520px' })` | 外部修改/删除冲突 |

**图片插入弹窗结构不变量**：`showImageInsertDialog()` MUST 调用 `showModal({ className: 'image-insert-dialog', content })`，且 `content` 不得再嵌套一层 `.modal` 元素；content 直接提供 `.modal-header`、内容区域与 `.modal-footer` 作为工厂创建之 `.modal` 的子节点，以正确命中 `.image-insert-dialog` 后代样式（`.url-input`、`.modal-footer`、`.file-pick-btn`）。

**未保存提示尺寸不变量**：`confirmDocumentTransition()` 使用的未保存提示 MUST 使用 `width: '320px'` 并收窄内边距与正文垂直留白，使整体尺寸与留白明显收紧，同时保证「取消 / 不保存 / 保存」三个按钮完整显示且可点击、文本可读。

`showDialog` 的 `DialogOptions` SHALL 支持可选 `padding?: string` 字段（默认 `'16px 24px'`），用于控制正文区域与底部按钮区域的内边距；未指定时保持现有默认内边距，不影响其它对话框。

#### Scenario: hidden 状态隐藏遮罩层
- **WHEN** 对话框遮罩层设置 `hidden` 属性
- **THEN** `.modal-overlay[hidden]` 使用 `display: none !important` 隐藏遮罩层

#### Scenario: 图片插入弹窗仅一层 modal 且命中专用样式
- **WHEN** 用户打开插入图片弹窗
- **THEN** 弹窗只含一层由工厂创建的 `.modal` 容器（其上带有 `image-insert-dialog` 类），本地文件选择按钮呈现 `.file-pick-btn` 虚线框样式，URL 输入框与底部按钮区正确应用 `.image-insert-dialog` 后代样式

#### Scenario: 未保存提示尺寸收紧且按钮可点
- **WHEN** 用户存在未保存更改并切换文件触发确认弹窗
- **THEN** 弹窗宽度约 320px、内边距与垂直留白收窄，「取消 / 不保存 / 保存」三个按钮完整显示且均可正常点击

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
- `padding?: string` — 正文与底部按钮区域的内边距（默认 `'16px 24px'`）
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

### Requirement: 设置面板标签页调整

设置面板 SHALL 使用调整后的标签页结构，反映编辑器设置与通用设置分离的布局。

#### Scenario: 编辑器标签页包含拼写检查和自动换行
- **WHEN** 设置面板打开
- **AND** 用户点击「编辑器」标签页
- **THEN** 该标签页包含以下设置组：Markdown（代码高亮）、代码块（行号、自动换行）、PlantUML（服务器地址）、界面（默认展开侧边栏、工具栏提示）
- **AND** 拼写检查和自动换行不再出现在「通用」标签页中

#### Scenario: 通用标签页精简
- **WHEN** 设置面板打开
- **AND** 用户点击「通用」标签页
- **THEN** 该标签页仅包含：文件（自动保存、自动保存间隔）、文件树性能（忽略目录、单次加载条目、自动恢复展开深度）
- **AND** 拼写检查和自动换行已移出

#### Scenario: 没有实时预览开关
- **WHEN** 设置面板打开
- **AND** 用户查看「编辑器」标签页
- **THEN** Markdown 设置组中只有「代码高亮」开关
- **AND** 没有「实时预览」开关或相关文字

### Requirement: LivePreview 开关移除

设置面板的编辑器标签页 SHALL 不再包含「实时预览」开关。

#### Scenario: 没有实时预览开关
- **WHEN** 设置面板打开
- **AND** 用户查看「编辑器」标签页
- **THEN** Markdown 设置组中只有「代码高亮」开关
- **AND** 没有「实时预览」开关或相关文字

### Requirement: 图片面板新的表单元素

图片设置面板 SHALL 使用新的枚举选项替代旧的布尔值和松散字符串控件。

#### Scenario: 图片面板存储规则
- **WHEN** 设置面板打开
- **AND** 用户点击「图片」标签页
- **THEN** 存在三个存储位置选项：「复制到指定路径（默认）」「复制到当前文件夹 ./（和文档同级）」「复制到 ./${filename}-images」
- **AND** 选择指定路径时显示路径输入框和目录选择器，默认值为 `./images`
- **AND** 选择另外两项时不显示路径输入框和目录选择器
- **AND** 提供「对本地图片应用」与「对网络图片应用」开关
- **AND** 提供相对/绝对引用样式设置和剪贴板文件名模板

#### Scenario: 文档命名目录的示例说明
- **WHEN** 用户查看「复制到 ./${filename}-images」选项
- **THEN** 界面说明 `${filename}` 不含 `.md` 扩展名
- **AND** 显示示例 `guide.md → ./guide-images/`

#### Scenario: 自定义路径支持更多格式
- **WHEN** 图片面板显示「自定义路径」输入框
- **THEN** 占位文本为 `./images, ../assets, /absolute/path, D:\Pictures`
- **AND** 描述文字更新为：「支持相对路径（相对于文档）、绝对路径、Windows 盘符路径和 UNC 路径」

### Requirement: PlantUML 服务器地址布局调整

PlantUML 服务器地址设置 SHALL 使用改进的布局：风险提示独立一行，默认服务器地址以可选择文本显示，输入框放在所有说明下方。

#### Scenario: PlantUML 设置布局
- **WHEN** 设置面板打开
- **AND** 用户查看 PlantUML 设置
- **THEN** 风险提示文字在单独一行显示
- **AND** 默认服务器地址（`https://www.plantuml.com/plantuml`）以可选择文本形式呈现
- **AND** 输入框在所有说明文字下方排列

### Requirement: 设置面板垂直布局样式

系统 SHALL 为带有较长描述文字的设置项提供可复用的垂直布局样式。

#### Scenario: 垂直布局样式应用
- **WHEN** 设置项描述文字超过一行
- **THEN** 文字标签和控件垂直排列（非水平排列）
- **AND** 描述文字间距和字体大小与其他设置项一致
