# Design

## 调研结论（已实测，apply 时可直接引用）

- 现实现 `src/ui/documents/image-preview.ts`（104 行）：模块级单例（container/image/error/toggle/shownPath/originalSize），`build(path)` 一次性建 DOM，`showImagePreview(path)` 换图重置（alt/src/fit 态），`hideImagePreview()` 拆除。
- **误报根因**（`src/styles/editor.css:116-123`）：`.image-preview-error { display: grid }` 作者样式覆盖 `[hidden]` UA 默认，`failure.hidden = true`（build 时）从不生效——占位符常显。`img` 无作者 `display`，其 `hidden` 生效，但一并改为状态类最稳。
- **不居中根因**（editor.css:103-114）：`.original-size` 视口切 `display: block`，`margin: auto` 仅水平居中，垂直顶格。
- **图标同源模式**（`src/ui/file-tree/header.ts:15-40`）：Lucide v1.17.0 路径内联 `ICONS` 常量 + `actionButton(label, icon, onClick)`——`title`/`aria-label` + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">`。与已确认原型（可视化沙箱 Lucide 同版本）同源。
- 既有测试：`src/ui/documents/__tests__/session.test.ts` 的 `image preview tabs` describe——断言 alt/src、换图重置（toggle 文案回「适应窗口」）。工具栏按钮形态变化需同步更新这些断言。
- 原型已获用户确认（保留四按钮 + 百分比；本变更即原型的工程落地 + 拖拽平移）。

## D1 缩放纯函数（新 `src/utils/preview-zoom.ts`，无 DOM）

```ts
export const ZOOM_STEP = 1.25;
export const ZOOM_MIN = 0.1;   // 10%
export const ZOOM_MAX = 8;     // 800%
export function clampZoom(scale: number): number       // 夹紧 [0.1, 8]，防浮点漂移
export function stepZoom(base: number, direction: 1 | -1): number  // base × 1.25 或 ÷1.25 后夹紧
export function fitScale(viewportW: number, viewportH: number, naturalW: number, naturalH: number, padding = 48): number
// min((vw-pad)/nw, (vh-pad)/nh)；非正尺寸入参返回 1（退化安全）
```

## D2 状态机与工具栏（`image-preview.ts` 重构）

- 状态：`mode: 'fit' | 'manual'`、`scale: number`（manual 下生效，1 = 100%）；模块级变量随现有单例风格。
- 天然尺寸：`img` load 事件缓存 `naturalW/H`（换图时清空）；fit 基数需要它，未加载完成时 `fitScale` 退化 1。
- 工具栏 DOM（filename 左；controls 右）：
  - 缩放组（一体式边框容器，同原型）：`[缩小 −图标]` `[百分比 span，min-width 定宽 tabular-nums]` `[放大 +图标]`
  - `适应窗口` 按钮：maximize 四角图标（lucide：`M8 3H5a2 2 0 0 0-2 2v3` / `M21 8V5a2 2 0 0 0-2-2h-3` / `M3 16v3a2 2 0 0 0 2 2h3` / `M16 21h3a2 2 0 0 0 2-2v-3`），title/aria-label「适应窗口」
  - `1:1` 按钮：`<text x="12" y="16" text-anchor="middle" font-size="10.5" font-weight="600" fill="currentColor" stroke="none">1:1</text>` 字形图标（24 viewBox），title/aria-label「原始尺寸 (1:1)」
  - zoom-in/zoom-out 图标：lucide `circle cx11 cy11 r8` + 把柄 `m21 21-4.3-4.3` + `±` 笔画（`M11 8v6` `M8 11h6` / 仅 `M8 11h6`）
- aria-pressed：`适应窗口` = mode==='fit'；`1:1` = mode==='manual' && |scale−1|<0.001；CSS `.image-preview-btn[aria-pressed="true"]` 高亮（accent-soft 背景 + accent 文字，同原型）。
- 百分比：fit 态显示 `round(fitScale×100)%`；manual 态显示 `round(scale×100)%`。
- 换图重置：既有行为保留（alt/src/文件名 + 回 fit 态），缩放状态一并复位。

## D3 CSS 重写（`editor.css` 预览段）

- 视口恒 `display: flex; overflow: auto;`；`.image-preview-img { margin: auto; display: block; }`（flex + margin auto：小于视口时居中，大于视口时可滚动到边缘——两个 bug 同时消除）。
- 尺寸控制改类切换：`.fit` → `max-width: calc(100% - 48px); max-height: calc(100% - 48px)`；`.manual` → `width` 由 JS 内联（`naturalW × scale` px）、`height: auto; max-width/height: none`。删除 `.original-size` 旧方案。
- 失败占位：容器 `.failed` 状态类——`.image-preview-error { display: none; }`、`.image-preview.failed .image-preview-error { display: grid; }`、`.image-preview.failed .image-preview-img { visibility: hidden; }`（占位与图片互斥；setFailed(true/false) 只 toggle 容器类）。
- 拖拽光标：`.image-preview-viewport.can-pan { cursor: grab; }`、`.image-preview-viewport.panning { cursor: grabbing; }`。

## D4 鼠标拖拽平移

- viewport 上监听 `pointerdown`（`e.pointerType === 'mouse'` 且 `e.button === 0` 才启动）：记录起点 `x/y/scrollLeft/scrollTop`，`setPointerCapture`，加 `.panning` 类。
- `pointermove`：`scrollLeft = startLeft - (e.clientX - startX)`、scrollTop 同理（浏览器自动夹紧到滚动范围）。
- `pointerup`/`pointercancel`：释放捕获、去类。
- 可拖判定：`scrollWidth > clientWidth || scrollHeight > clientHeight` → `.can-pan` 类；在每次 render（缩放变化）与 ResizeObserver 回调后重算。
- 防冲突：`img.draggable = false` + `dragstart` preventDefault（避免原生图片拖拽幽灵）；`.image-preview-img { user-select: none }`；单击（无位移）不产生副作用（纯滚动位移，无 click 拦截）。
- 不拦截触摸/触控板：pointerType 过滤为 mouse；触摸板双指滚动走原生 wheel 滚动不受影响。

## D5 resize 联动

`ResizeObserver` 观察视口：fit 态下 CSS 自动重适配，仅需刷新百分比文本与 `.can-pan` 重算（复用同一 render 辅助）。

## Non-Goals

- 滚轮/触摸板捏合缩放、键盘 +/− 缩放、百分比点击输入
- 双击切换 fit/1:1（未在确认原型中）
- 旋转/翻页/多图画廊

## 测试落点

- `src/utils/__tests__/preview-zoom.test.ts`（新）：clamp/step 边界矩阵（10%/800% 夹紧、÷1.25 回退、浮点）、fitScale（横/竖图、padding、非正入参退化 1）
- `src/ui/documents/__tests__/session.test.ts` 更新 + 扩充：
  - 既有 toggle 文案断言 → 图标按钮（aria-label/title/aria-pressed）
  - 放大/缩小点击：pct 文本变化、fit 高亮消失；连续到边界夹紧
  - 1:1 → aria-pressed、再点适应窗口恢复
  - `.failed` 类：img error 事件 → 容器加类；load → 移除类；加载成功路径不出现失败占位（初始无 `.failed`）
  - 拖拽：jsdom 模拟 pointer 事件序列（pointerdown/move/up）断言 scrollLeft/scrollTop 变化与 `.panning` 类（jsdom 无真实布局，`can-pan` 判定需 mock scrollWidth/clientWidth——用 `Object.defineProperty` 覆写视口元素度量）
  - 换图重置断言更新（图标态 + 缩放复位）
- 门禁（纯前端，无 src-tauri 变更）：`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs`；Rust 门禁 skip（无变更）
