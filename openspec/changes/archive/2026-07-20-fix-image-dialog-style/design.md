## Context

Issue #150 报告两类弹窗样式问题，均源于 DOM 结构与 CSS 命中，无运行时异常：

1. **图片插入弹窗**（`src/components/toolbar.ts` 的 `showImageInsertDialog()`）：
   - 调用 `showModal()` 时未传 `className: 'image-insert-dialog'`，导致 `editor.css` 中 `.image-insert-dialog ...` 系列规则（宽度、URL 输入框、文件选择按钮虚线框、底部按钮区）全部失效。
   - 传给 `showModal()` 的 content 又内嵌了一层 `<div class="modal">`，而 `showModal()` 自身已创建 `.modal` 容器，形成重复的 `.modal` 结构，进一步放大尺寸、破坏布局。
   - 后果：本地文件选择按钮回退为浏览器原生 `<button>` 样式（无 `.file-pick-btn` 虚线框样式），整体布局与预期不符。

2. **未保存提示**（`src/components/sidebar.fileops.ts` 的 `confirmDocumentTransition()`）：
   - 宽度固定 `360px`；正文 `<p>` 内联 `margin-bottom:16px`；叠加 `showDialog()` 正文 `16px 24px` 与底部 `16px 24px` 内边距，使弹窗高度与垂直留白偏大。

两个弹窗的工厂函数 `showModal` / `showDialog` 行为正确，仅调用方构造内容的方式有偏差。

## Goals / Non-Goals

**Goals:**
- 图片插入弹窗仅保留一层由工厂创建的 `.modal`，并通过 `className` 正确命中 `.image-insert-dialog` 专用样式。
- 本地文件选择按钮呈现完整的虚线框交互样式，URL 输入框与底部按钮布局一致。
- 未保存提示在不影响文本可读性与三按钮可点击性的前提下，收窄宽度、内边距与垂直留白。
- 两弹窗在常见窗口尺寸下居中、内容不溢出，深浅主题均正常。

**Non-Goals:**
- 不改动 `showModal` / `showDialog` 工厂的核心行为、焦点管理、滚动锁定与关闭逻辑。
- 不改动其它对话框（新建文件、链接、外部冲突等）的尺寸或样式。
- 不引入新的弹窗类型或框架。

## Decisions

### 决策 1：图片弹窗传 `className` 并移除嵌套 `.modal`

`showImageInsertDialog()` 改为：
```ts
const modal = showModal({
  className: 'image-insert-dialog',
  content: `
    <div class="modal-header">…</div>
    <div style="padding:16px 24px;">…</div>
    <div class="modal-footer">…</div>
  `,
});
```
移除 content 最外层的 `<div class="modal">`，仅保留 `.modal-header` / 内容 / `.modal-footer`，直接作为 `showModal()` 创建的 `.modal` 的子节点。这既满足 `dialog-system` 规范「所有对话框只使用一层 `.modal`」的不变量，又让 `className` 命中。

**备选**：在 content 中继续保留嵌套 `.modal` 并仅补 `className` —— 不可取，会维持重复 `.modal` 结构，与规范冲突且加剧布局异常。

### 决策 2：修正失效的 CSS 选择器

`editor.css` 中 `.image-insert-dialog .modal { width: 480px }` 为「后代选择器」，但修复后 `image-insert-dialog` 类落在 `.modal` 自身（由 `showModal` 的 `className` 追加）。该规则改为：
```css
.image-insert-dialog { width: 480px; }
```
其余 `.image-insert-dialog .url-input` / `.image-insert-dialog .modal-footer` / `.image-insert-dialog .file-pick-btn` 均为后代选择器，修复后仍可命中（`.url-input` 等仍是 `.modal.image-insert-dialog` 的后代），无需改动。

### 决策 3：未保存提示收窄尺寸与留白

- 为 `DialogOptions` 新增可选字段 `padding?: string`（默认 `'16px 24px'`，保持现有所有对话框不变），`showDialog()` 将其用于正文与底部区域的 `<div style="padding:...">`。
- `confirmDocumentTransition()` 改为 `width: '320px'`、`padding: '12px 20px'`，并将正文 `<p>` 内联 `margin-bottom` 由 `16px` 降为 `12px`。
  - 垂直留白：原 `16(正文上)+16(p)+16(底部上)=48px` → `12+12+12=36px`。
  - 宽度：360→320px，三按钮（取消/不保存/保存）在约 280px 可用宽内仍可完整排布（实测约 206px），不溢出、可点击。
- 浅/深主题走同一 CSS 变量，无需分支。

**备选**：直接改 `showDialog()` 正文 hardcode 内边距 —— 会波及所有对话框，违反 Non-Goals，故改为可选项字段。

## Risks / Trade-offs

- [Risk] 移除嵌套 `.modal` 后，若其它代码通过 `querySelector('.modal .modal-header')` 等后代路径查找图片弹窗元素会失效。→ Mitigation：经 codegraph 排查，图片弹窗元素均按 `id`（如 `#image-close`、`#image-pick-local`）绑定，无后代 `.modal` 选择器依赖；仅 `showModal().element` 返回最外层 `.modal` 供 `hide()` 使用，行为不变。
- [Risk] 宽度 320px 在极短文案/长按钮下可能仍偏紧。→ Mitigation：三个按钮中文短且 `btn-secondary`/`btn-primary` 内边距固定为 `8px 20px`，实测不溢出；若后续需更紧，可单独调 `width`。
- [Risk] 新增 `padding` 选项遗漏默认值导致既有弹窗内边距变化。→ Mitigation：默认 `'16px 24px'` 与现状一致，仅未保存提示显式覆盖。

## Migration Plan

纯前端 CSS/DOM 改动，无数据迁移。验证方式：
1. `npm test -- src/components`（既有测试不回归）。
2. `npx tsc --noEmit`（类型：新增可选 `padding` 字段）。
3. 手动：打开编辑器 → 插入图片 → 本地文件页签查看虚线框按钮与 480px 宽度；修改文件不保存 → 切文件查看收紧后的未保存提示；深浅主题各验一次。

回滚：单 commit 反向即可，无外部依赖。

## Open Questions

（无）
