# Tasks

## 1. 测试先行（实现前红）

- [x] 1.1 新增 `src/utils/__tests__/preview-zoom.test.ts`：clampZoom/stepZoom 边界矩阵（×1.25 步进、10%/800% 夹紧、浮点安全）、fitScale（横图/竖图/恰好填满/非正尺寸退化 1）。验证：红（模块不存在）
- [x] 1.2 更新 `src/ui/documents/__tests__/session.test.ts` 既有预览断言（toggle 文字按钮 → 图标按钮 aria-label/aria-pressed），并新增：放大/缩小步进与百分比读数、边界夹紧、1:1 高亮与恢复、`.failed` 类显隐（error 事件加类、load 移除、成功路径初始无类）。验证：红
- [x] 1.3 session.test.ts 拖拽用例：mock 视口 scrollWidth/clientWidth（Object.defineProperty）模拟溢出，pointerdown→move→up 断言 scrollLeft/scrollTop 位移与 `.panning` 类；未溢出时拖动无位移。验证：红

## 2. 缩放纯函数

- [x] 2.1 新建 `src/utils/preview-zoom.ts`：`ZOOM_STEP/ZOOM_MIN/ZOOM_MAX`、`clampZoom`、`stepZoom`、`fitScale`（按 design D1 签名，无 DOM）。验证：1.1 绿

## 3. 预览面重构

- [x] 3.1 `src/styles/editor.css` 预览段重写：视口恒 flex + `margin: auto` 居中、`.fit`/`.manual` 类、`.failed` 容器类显隐（删除 `.original-size` 与 `[hidden]` 依赖）、`.can-pan`/`.panning` 光标、四按钮 + 缩放组 + aria-pressed 高亮样式（对齐已确认原型视觉）
- [x] 3.2 `src/ui/documents/image-preview.ts` 重构：图标常量（Lucide 内联路径，zoom-in/zoom-out/maximize + "1:1" 字形）+ 四按钮工具栏（title/aria-label）+ 百分比读数 + mode/scale 状态机（load 缓存 naturalW/H）+ setFailed 改容器 `.failed` 类 + 换图重置保留。验证：1.2 对应项绿
- [x] 3.3 拖拽平移：pointerdown（仅 mouse/左键）→ capture → move 位移 scroll → up/cancel 收尾；`.can-pan` 随 render 与 ResizeObserver 重算；img draggable=false + dragstart preventDefault。验证：1.3 绿

## 4. 回归与全量门禁

- [x] 4.1 既有预览回归：换图 alt/src/缩放复位、会话挂起恢复、document-tabs 测试不受影响。验证：`npm test` 全绿
- [x] 4.2 `npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`node scripts/check-layering.mjs` 全过；无 dead code、无调试日志；`image-preview.ts` 行数 ≤500（观察区外）
