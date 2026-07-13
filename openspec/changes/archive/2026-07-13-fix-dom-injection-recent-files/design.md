## Context

`src/components/menu.ts` 的 `renderMenu()` 函数使用字符串拼接 + `innerHTML` 构建最近文件/文件夹菜单项。文件路径和名称来自 `settings.json`（用户可控），未经转义直接插入 DOM。文件树已使用 `document.createElement` + `textContent` 安全构建，但菜单未同步该模式。

## Goals / Non-Goals

**Goals:**
- 消除 `menu.ts` 中所有用户可控内容进入 `innerHTML` 的路径
- 文件名纯文本显示，路径绑定在 `dataset` 上
- 事件绑定改用事件委托，消除每次 render 重建 listener 的开销
- 审计全项目 `innerHTML` 调用，识别残留风险

**Non-Goals:**
- 不改动外部 API 或 settings 结构
- 不改动菜单的视觉样式或布局
- 不引入新的 CSP 策略（维持现有安全边界）

## Decisions

### Decision 1: document.createElement 替代 innerHTML + escapeHtml
用 `document.createElement('button')` + `el.textContent = name` + `el.dataset.path = f` 替代字符串模板拼接。相比先 escape 再 innerHTML 的方案，createElement 语义更清晰，且不可能出现转义遗漏。

### Decision 2: 事件委托替代逐个绑定
当前代码对每个 `.app-menu-item` 分别 `addEventListener`，每次 render 重建。改为在 `filesContainer` / `foldersContainer` 上挂单次点击委托，通过 `closest('.app-menu-item')` + `dataset.path` / `dataset.type` 派发。

### Decision 3: 不引入外部安全库
`textContent` + `dataset` 是原生 DOM API，零依赖。`contextMenu.ts` 中的 `escapeHtml` 辅助函数在此场景不再需要。

### Decision 4: 审计策略
分三类审计 `innerHTML`：
- **静态 SVG/模板**（无用户数据）：标记安全，不做改动
- **用户可控数据**（如 menu.ts）：修复
- **其他**：逐条评估

## Risks / Trade-offs

- [重构后的事件委托] → 需确保 `e.currentTarget` 行为正确，使用 `closest` 定位实际按钮
- [遗漏 innerHTML] → 审计列表需跟踪，在 tasks 中建立检查项
