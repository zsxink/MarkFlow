# Proposal

## Why

Issue #441：#433 落地的图片预览在实际使用中暴露两个缺陷与两个体验缺口：

1. **误报**：「图片加载失败」占位符从创建起常显（`.image-preview-error` 的作者 CSS `display: grid` 覆盖 `[hidden]` 的 UA 样式），加载成功也挂在图片旁。
2. **不居中**：原始尺寸模式视口切 `display: block`，图片垂直方向顶格。
3. **缩放控制弱**：仅「适应窗口/原始尺寸」两态文字按钮，无逐步缩放。
4. **大图浏览难**：1:1/放大后超出视口只能靠滚动条，无拖拽平移。

## What Changes

- 工具栏改为**四个图标按钮**（复用 `src/ui/file-tree/header.ts` 的 Lucide v1.17.0 内联路径模式，图标同源）：适应窗口（maximize 四角）、1:1（"1:1" 字形图标）、放大（zoom-in）、缩小（zoom-out），均带 title/aria-label；缩放组合保留百分比读数（− | 68% | + 一体式）
- 统一缩放状态机：`mode: fit | manual` + `scale`；放大/缩小 ×1.25 步进、夹紧 10%–800%，从 fit 起步以当前适配比例为基数；1:1 = 精确 100%；fit/1:1 按钮按当前状态高亮（aria-pressed）
- **鼠标拖拽平移**：图片超出视口时按住拖动滚动查看，grab/grabbing 光标反馈，仅鼠标指针生效、不影响普通滚动与点击
- 视口恒 flex 居中 + `margin: auto`，任意缩放模式水平垂直居中，溢出可滚动
- 失败占位改容器 `.failed` 状态类控制显隐（弃用 `hidden` 属性），加载成功绝不显示

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `image-preview-tabs`：MODIFIED「预览渲染与缩放」——四图标控制 + 百分比读数、步进缩放、恒居中、拖拽平移；新增「成功加载不显示失败占位」场景

## Impact

- `src/ui/documents/image-preview.ts`：工具栏与缩放状态机、拖拽平移重构（保持 ≤200 行目标；图标常量 + build 函数结构沿用）
- `src/utils/preview-zoom.ts`（新）：步进/夹紧/适配比例纯函数（无 DOM，单测友好）
- `src/styles/editor.css`：预览段重写（恒 flex 居中、`.failed` 类显隐、拖拽光标类）
- 测试：`src/utils/__tests__/preview-zoom.test.ts`（新）；`src/ui/documents/__tests__/session.test.ts` 既有预览断言更新（toggle 文字按钮 → 图标按钮）+ 新增缩放/拖拽/失败类用例
- 无 Rust / 设置 / 规范外变更
- Non-Goals：触摸板/滚轮缩放、键盘缩放、百分比点击输入、旋转、双击切换模式、多图翻页
