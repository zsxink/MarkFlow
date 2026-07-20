## MODIFIED Requirements

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
