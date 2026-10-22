# Tasks

## 1. 样式契约回归（失败先行）

- [x] 1.1 新增 `src/lib/task-list-styles.test.ts`，读取 `src/styles/editor.css` 断言任务列表规则的关键声明：复选框 `width`/`height` 为 `1em` 且 `flex: none`、内容区 `flex: 1 1 0` 且 `min-width: 0`、任务项内部段落 `margin: 0`、任务项 `li` 下边距小于 `.ProseMirror p` 下边距；验证方式：`npx vitest run src/lib/task-list-styles.test.ts` 在改样式前失败。
- [x] 1.2 新增 e2e 场景 `e2e/specs/smoke/task-list.e2e.mjs` 并在 `all-smoke.e2e.mjs` 注册，加载含空任务项/非空任务项/嵌套任务项的任务列表夹具，断言空任务项内容区宽度 > 0、复选框宽高约等于正文字号（±2px）、相邻任务项间距小于相邻段落间距；验证方式：`npm run test:e2e` 在改样式前对应断言失败。

## 2. 任务列表布局修复

- [x] 2.1 在 `src/styles/editor.css` 任务列表样式段为 `input[type="checkbox"]` 增加 `width: 1em; height: 1em; flex: none`，并按行高调整 `margin-top` 使复选框与首行文字视觉居中；验证方式：`npx vitest run src/lib/task-list-styles.test.ts` 的复选框断言通过。
- [x] 2.2 为任务项内容 `div`（`.ProseMirror ul[data-type="taskList"] li > div`）设置 `flex: 1 1 0; min-width: 0`，使空内容时内容区仍占满剩余宽度；验证方式：样式契约测试与 e2e 的"空任务项内容区宽度 > 0"断言通过。
- [x] 2.3 在任务列表范围内把任务项内部段落边距归零（`li > div > p { margin: 0 }`）并给多段落保留 `p + p { margin-top: 0.4em }`，任务项之间使用 `0.25em` 下边距，嵌套任务列表 `ul` 下边距同步收窄；验证方式：样式契约测试的间距关系断言与 e2e 的"任务项间距 < 段落间距"断言通过。

## 3. 交互与绘制验证

- [x] 3.1 在 e2e 中把光标移入空任务项（鼠标点击内容区与键盘移动两条路径），断言 DOM selection 落在该任务项内容区内、内容区宽度可测，并输入字符确认落点正确；验证方式：`npm run test:e2e` 对应场景通过。
- [x] 3.2 在 e2e 中覆盖复选框点击切换勾选状态、已勾选/未勾选尺寸一致、嵌套任务项布局一致，并保存窗口截图作为绘制证据到 `e2e/artifacts/`；验证方式：`npm run test:e2e` 对应场景通过且截图可见光标与复选框尺寸。
- [x] 3.3 人工原生窗口复核：在 `npm run tauri dev` 中新建含空任务项的文档，用系统鼠标点击空任务项与切换字号设置，确认光标立即出现、复选框随字号缩放、任务项间距小于段落间距，并记录结论到 `tasks.md` 的 Validation Evidence。验证方式：复核记录写入本节。

## 4. 集成验证

- [x] 4.1 运行 `npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec` 全绿；验证方式：命令输出记录到 Validation Evidence。
- [x] 4.2 运行 `npm run test:e2e` 全量 smoke 套件确认任务列表场景与既有场景（含 startup-caret、document-tabs）均通过；验证方式：命令输出记录到 Validation Evidence。

## 5. 独立复核修复轮

- [x] 5.1 让 e2e 间距断言具备判别力：段落间距改为只统计 DOM 相邻的 `<p>` 兄弟，新增 computed-style 契约（`li` = 0.25×字号、`li > div > p` = 0、`.ProseMirror p` = 0.75×字号且 `itemMargin < paragraphMargin`），并用「撤回 CSS → 用例失败」的负向对照证明；验证方式：见 Validation Evidence 的负向对照表。
- [x] 5.2 指针路径用例按实际覆盖改名（`places a caret inside an empty task item via coordinate mapping and keyboard movement`），保留「合成事件不产生光标、绘制由原生截图 + 人工复核覆盖」的说明，`posAtCoords` 回退保留并收紧为失败即报错的断言。
- [x] 5.3 字号路径降级不再静默：保留原生 `<select>` → `change` 回退，但把「字号已生效」的等待改为无条件执行，可见终态（22px → 复选框 22px → 18px 复原）仍为硬断言。
- [x] 5.4 删除 `task-list.e2e.mjs` 里 3 处 `console.log`，改由断言对象携带诊断信息；`grep -rn 'console.log' e2e/specs/` 无输出。
- [x] 5.5 扩展 `src/lib/task-list-styles.test.ts` 的外溢检查到 `margin` / `margin-top` / `margin-bottom` / `padding` / `padding-left` / `gap` / `row-gap` / `column-gap` 的 `0.25em` / `0.4em` 取值，只白名单变更前就存在的 `.ProseMirror li { margin-bottom: 0.25em }`；验证方式：临时注入两条越界规则时该用例失败，恢复后 7/7 通过。

## 6. 独立复核修复轮 2

- [x] 6.1 修正 CSS 外溢：嵌套列表规则由 `.ProseMirror ul[data-type="taskList"] li > div > ul` 收窄为 `.ProseMirror ul[data-type="taskList"] li > div > ul[data-type="taskList"]`，不再连带命中任务项里嵌套的普通项目符号/有序列表；验证方式：新增 e2e 用例对普通嵌套 `<ul>` 与嵌套任务列表分别实测 computed `margin-bottom`。
- [x] 6.2 修掉「测试验证泄漏」：`src/lib/task-list-styles.test.ts` 的 `NESTED_LIST` 改成修正后的选择器，并新增结构检查——把选择器拆成 combinator 分隔的复合选择器，解析末位复合选择器的类型选择器与限定符，凡「任务列表范围内」的规则若末位是裸 `ul`/`ol`（既无 `[data-type="taskList"]` 也无 class/id）即失败；同时断言 `.ProseMirror ul` / `.ProseMirror ol` 的 `margin-bottom` 仍为 `1em`。
- [x] 6.3 清理 `e2e/specs/smoke/task-list.e2e.mjs` 的死代码：删除未引用的 `CHECKBOX`、未被断言的 `itemGaps` / `lineHeight`、`describeItem` 里无人读取的 `label` / `paragraph` 盒模型、`measure()` 里没人用的 `x` / `y`，并删除只被一条 `expect` 用来数数的 `paragraphs` 数组（改为 `paragraphCount`）。未读数与未用局部变量用脚本核对为 0（`timeout` / `timeoutMsg` / `clientX` 属 WDIO `waitUntil` 选项与 `MouseEvent` 构造参数，不是死代码）。顺带把已采集但无人断言的两项接上断言：`collapsed`（指针路径断言选区是折叠光标）、`activeIsCheckbox`（切换用例断言点击复选框后焦点没跑到 input）。
- [x] 6.4 新增泄漏回归覆盖：夹具 `task-list-nested-lists.md`（item 0 内嵌普通项目符号列表、item 1 内嵌任务列表）写入 `e2e/run.mjs`，新用例 `keeps an ordinary list nested in a task item at the generic list margin` 断言普通嵌套 `<ul>` 无 `data-type`、`list-style-type` 非 `none`、`padding-left` 为 24px、`margin-bottom` = 1em×字号，嵌套任务列表 `margin-bottom` = 0.25em×字号，且前者严格大于后者；验证方式：见下方负向对照。

## 7. 终轮复核清理（复核轮 3 残余项）

- [x] 7.1 删除 `e2e/specs/smoke/task-list.e2e.mjs` 中未被读取的采集值（`caret` 的宽高、`pointerIntoContent` 的 `target`、两处返回的 `pos`），并把有价值的 `contentWidth` 接上断言（> 100）；验证方式：`node --check` + `npx tsc --noEmit` 通过且 `npm run test:e2e` 16 passing。
- [x] 7.2 把嵌入 WebDriver 下永不执行的 `Range.getBoundingClientRect()` 三维断言替换为选区锚点元素几何断言（`anchorBox` 落在空任务项内容框内、宽度 > 100）；验证方式：把内容区 `flex: 1 1 0` 临时改回 `flex: 0 1 auto`，`npm run test:e2e` 必须失败（实测 3 failing，`Expected: > 100 / Received: 0`），恢复后全绿。
- [x] 7.3 记录与本改动无关的既存缺陷（任务项内嵌套普通列表的 `::marker` 被 `li{display:flex}` 抑制），确认把任务列表 CSS 整块回退到 `origin/main` 后表现相同，另行登记跟进而不阻塞本分支；验证方式：结论写入 Validation Evidence。

## Validation Evidence

### 1.1 样式契约单测（失败先行 → 修好后通过）

改动前后第一次运行（`npx vitest run src/lib/task-list-styles.test.ts`，此时 CSS 仍是旧的三条规则）：

```
 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 复选框是 1em 的可视尺寸且在 flex 布局中不被压缩
 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 复选框按行高做垂直居中偏移 ...
 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 任务项内容区用 flex: 1 1 0 保证空内容时宽度仍大于零
 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 任务项内部段落不再叠加段落下边距，多段落保留 0.4em 间隔
 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 连续任务项间距小于段落间距，嵌套任务列表尾部留白同步收窄
      Tests  5 failed | 2 passed (7)
```

修复后（同一命令）：

```
 ✓ src/lib/task-list-styles.test.ts (7 tests) 2ms
      Tests  7 passed (7)
```

覆盖的 7 条断言：复选框 `width`/`height` = `1em` + `flex: none` + `font-size: inherit` + `accent-color: var(--accent)`、`margin-top` 落在 `(0.2em, 0.5em)`、内容区 `flex: 1 1 0` + `min-width: 0`、`li > div > p` 的 `margin: 0` 与 `p + p` 的 `0.4em`、`li` 下边距 `0.25em` < `.ProseMirror p` 的 `0.75em` 且嵌套 `ul` 下边距等于 `0.25em`、`li` 仍是 `display: flex` + `align-items: flex-start`、以及"新规则全部限定在 `data-type="taskList"` 范围内、通用段落/列表规则未被改动"的外溢检查。

> 实施中发现的一处补充：表单控件默认不继承字体，只写 `width: 1em` 时 `em` 取的是 UA 默认字号（实测复选框 11px，与 18px 正文相差 7px），因此 2.1 额外加了 `font-size: inherit`，并同步把该声明纳入 1.1 的契约断言。

### 1.2 / 3.1 / 3.2 e2e 场景（先失败 → 修好后通过）

新增 `e2e/specs/smoke/task-list.e2e.mjs`（4 个用例），在 `all-smoke.e2e.mjs` 末尾注册；夹具 `task-list-layout.md` 在 `e2e/run.mjs` 的 `writeFile` 段写入（空任务项 / 已勾选项 / 带嵌套列表的父项 / 嵌套空项 / 两个尾随段落作为段落间距基线）。

用 `git stash` 之外的等价手段做过失败对照：临时把 `src/styles/editor.css` 的任务列表段还原成改动前的三条规则后重跑 `npm run test:e2e`：

```
Expected: > 100      Received:   0     (空任务项内容区宽度)
Expected: > 0        Received:   0     (空任务项聚焦后光标矩形)
Expected: <= 2       Received:   6     (复选框尺寸 vs 正文字号，两处)
[webkit ...] 11 passing (11.8s)
[webkit ...] 4 failing
```

恢复修复后的样式（`diff` 确认字节相同）再跑：

```
[0-0] task-list geometry: {"fontSize":18,"checkbox":{"w":18,"h":18},"emptyContentWidth":822,"itemWidth":848,"itemGaps":[4.5,4.5],"paragraphGaps":[202.46875,13.5],"nested":[{"checkbox":18,"content":796},{"checkbox":18,"content":796}]}
[0-0] task-list: pointer path = posAtCoords, caret rect = {"bottom":0,"height":0,"left":0,"top":0,"width":0}
[0-0] task-list: font-size path = change-event, font = 22, checkbox = 22
```

- 空任务项内容区宽度 822px（项宽 848px − 复选框 18px − gap 8px），改动前为 0。
- 复选框 18×18px，等于 `.ProseMirror` 的 18px 字号；字号切到 22px 后复选框 22px（字号选择走 `change` 事件路径：嵌入式 WebDriver 无法激活原生 `<option>`，e2e 里显式记录了 `font-size path = change-event`）。
- 相邻任务项间距 4.5px（`0.25em`）< 相邻段落间距 13.5px（`0.75em`）。
- 嵌套任务项复选框同为 18px，内容区 796px（比顶层窄 26px，即嵌套缩进），未出现横向溢出。

### 3.3 原生窗口复核（替代方案，含限制说明）

**未能执行交互式人工复核**（本环境无法运行 `npm run tauri dev` 并做真实系统鼠标/键盘操作），按变更要求采用可用的最佳替代：真实原生 WebKit 窗口内的 e2e 几何实测 + 原生窗口截图，并在下面如实记录替代方案与残余缺口。

已通过替代方案确认的部分：

1. **光标可见性前提**：空任务项内容区宽度 822px（非 0），聚焦后存在 DOM range；`Range.getBoundingClientRect()` 在本 WebKit 版本对空段落返回全 0 矩形，因此光标"是否被绘制"无法从矩形本身断言，改为断言可绘制的两个前提（非零宽度内容区 + 落在该内容区内的 selection）并在截图中人工确认光标/落点。
2. **截图证据**（`e2e/artifacts/`，均为 2400×1600 原生窗口截图）：
   - `task-list-layout.png`：空任务项、已勾选、父项、嵌套空项、嵌套已勾选并排，复选框尺寸一致、与文字首行对齐，任务项之间明显比下方两个段落更紧。
   - `task-list-empty-caret.png`：状态栏显示 `行 4, 列 0`——光标落在第 4 行即空任务项所在行，说明键盘路径的落点正确。
   - `task-list-typed-caret.png`：空任务项内出现字符 `k`，状态栏 `行 4, 列 1`，证明字符进入的是该空任务项而非相邻块。
   - `task-list-checkbox-toggle.png`：勾选切换后的布局，未出现复选框或内容区宽度抖动。
   - `task-list-font-scale.png`：字号设置往返（18 → 22 → 18）后的布局，复选框随之缩放。
3. **未覆盖的残余缺口**：e2e 的指针路径由脚本合成 `mousedown`/`mouseup` 并经 ProseMirror `posAtCoords` 落位（日志 `pointer path = posAtCoords`），WebDriver 的合成事件本身不会触发 WebKit 的原生光标绘制；`task-list-empty-caret.png` / `task-list-typed-caret.png` 里能看到落点与输入结果，但**"系统鼠标点击后光标立即绘制"这一点仍需真人在 `npm run tauri dev` 里目视确认**。这是本替代方案的已知限制，已在 PR 说明中标注为待人工复核项。

### 4.1 静态与单元测试

```
$ npx tsc --noEmit        → exit 0（无输出）
$ npm run build           → exit 0（✓ built in 3.53s）
$ npm test                → exit 0
      Test Files  86 passed (86)
           Tests  820 passed (820)
$ npm run validate:openspec → exit 0
      ✓ change/task-list-checkbox-caret-spacing
      Totals: 67 passed, 0 failed (67 items)
```

### 4.2 全量 smoke e2e

`npm run test:e2e`（含 `tauri build --debug --features e2e` 重建 + 全量 smoke）：

```
[webkit 605.1.15 macos #0-0] MarkFlow smoke: first open from the startup blank tab
[webkit 605.1.15 macos #0-0]    ✓ clears the startup caret before replacing content and keeps input on the new document
[webkit 605.1.15 macos #0-0] MarkFlow smoke: launch
[webkit 605.1.15 macos #0-0]    ✓ starts a real Tauri window with an isolated workspace
[webkit 605.1.15 macos #0-0] MarkFlow smoke: file open
[webkit 605.1.15 macos #0-0]    ✓ opens welcome.md and displays structured content in WYSIWYG editor
[webkit 605.1.15 macos #0-0] MarkFlow smoke: editor mode
[webkit 605.1.15 macos #0-0]    ✓ edits content and preserves it across WYSIWYG and source modes
[webkit 605.1.15 macos #0-0] MarkFlow smoke: edit save reload
[webkit 605.1.15 macos #0-0]    ✓ edits content, saves to disk, and persists
[webkit 605.1.15 macos #0-0] MarkFlow smoke: settings panel
[webkit 605.1.15 macos #0-0]    ✓ opens settings, switches tabs, toggles theme, and persists state on reopen
[webkit 605.1.15 macos #0-0] MarkFlow smoke: disk safety (5.5)
[webkit 605.1.15 macos #0-0]    ✓ keeps a NO-EDIT fixture byte-identical across open/switch/save/reload
[webkit 605.1.15 macos #0-0] MarkFlow: KaTeX math formula integration
[webkit 605.1.15 macos #0-0]    ✓ preserves inline and block formulas through source/wysiwyg round-trip and save
[webkit 605.1.15 macos #0-0]    ✓ editor remains functional (no crash/blank) with formula content present
[webkit 605.1.15 macos #0-0] MarkFlow smoke: document tabs
[webkit 605.1.15 macos #0-0]    ✓ keeps three file sessions independent and supports tab shortcuts and close/restore
[webkit 605.1.15 macos #0-0]    ✓ restores the visible WYSIWYG caret and insertion point when switching from a blank tab
[webkit 605.1.15 macos #0-0] MarkFlow smoke: task list layout
[webkit 605.1.15 macos #0-0]    ✓ renders empty task items with a measurable content area and a 1em checkbox
[webkit 605.1.15 macos #0-0]    ✓ shows a caret inside an empty task item for both pointer and keyboard paths
[webkit 605.1.15 macos #0-0]    ✓ toggles the checkbox without moving the caret and keeps nested items consistent
[webkit 605.1.15 macos #0-0]    ✓ scales the checkbox with the body font-size setting
[webkit 605.1.15 macos #0-0] 15 passing (21.7s)
Spec Files:	 1 passed, 10 skipped, 11 total (100% completed)
```

### 环境备注

首次运行 `npm run test:e2e` 失败于 `Failed to start embedded WebDriver ... Tauri app exited before ... ready (code=0)`，日志停在 `Application starting`。原因是本机已安装的 `/Applications/MarkFlow.app` 持有 `tauri-plugin-single-instance` 的 `/tmp/com_markflow_editor_si.sock`，新起的 e2e 二进制被单实例逻辑直接退出。退出该已安装实例后全部通过。跑 e2e 前需先关掉正在运行的 MarkFlow。

## Validation Evidence — 复核修复轮（fix round 1）

独立复核指出的 5 个缺陷（A 间距断言不可判别、B 指针路径用例命名夸大、C 字号路径静默降级、D 残留 `console.log`、E 外溢检查过窄）已修复，证据如下。

### A. 间距断言现在真的会因 CSS 回归而失败

`e2e/specs/smoke/task-list.e2e.mjs` 的几何快照改了三处，让断言具备判别力：

1. `adjacentParagraphGaps` 只取 **DOM 相邻** 的两个 `<p>` 兄弟（surface 子节点 i-1 与 i 都是 P），跨越整个列表的那个 ≈202px 间隙不再参与比较；夹具里这样的配对恰好 1 组，用 `toHaveLength(1)` 显式锁住。
2. `itemTextGaps` 用任务项自身段落的 border box 计算各项之间的实际空白（border box 不含自身 margin，所以这段空白正是本变更合并掉的 `li margin-bottom + 内层 p margin-bottom` 之和），断言 `max(itemTextGaps) < min(adjacentParagraphGaps)`。
3. 新增与 margin collapsing 无关的 computed-style 契约：`li` 的 `marginBottom` = `0.25 * fontSize` px、`li > div > p` 的 `marginBottom` = `0px`、`.ProseMirror p` 的 `marginBottom` = `0.75 * fontSize` px，并断言数值关系 `itemMargin < paragraphMargin`。

负向对照（全部真实执行，非推演）：

| 改动 | 结果 |
|------|------|
| 同时撤回 `li { margin-bottom: 0.25em }` 与 `li > div > p { margin: 0 }` | **FAIL** — `Expected: "0px" / Received: "13.5px"`（computed-style 断言，`task-list.e2e.mjs:318`），14 passing / 1 failing |
| 只撤回 `li > div > p { margin: 0 }` | **FAIL** — 同上 `Expected: "0px" / Received: "13.5px"` |
| 只撤回 `li > div > p { margin: 0 }`，并临时注释掉 computed-style 整块（只留几何断言） | **FAIL** — `Expected: < 13.5 / Received: 18`（`itemTextGaps` 18px 不再小于段落间距 13.5px），证明纯几何断言也具备判别力 |
| 恢复两条规则（`diff` 确认与修复版字节相同） | **PASS** — 15 passing (18.6s) |

### B. 指针路径用例改为如实命名

`shows a caret inside an empty task item for both pointer and keyboard paths` → `places a caret inside an empty task item via coordinate mapping and keyboard movement`。用例上方保留内联说明：合成的 `mousedown`/`mouseup` 不会移动 WebKit 光标，因此实际走 `posAtCoords` + `setTextSelection`（程序化选区）；**系统鼠标绘制光标由 `e2e/artifacts/` 的原生窗口截图 + 人工复核覆盖，不由这条合成路径覆盖**。`posAtCoords` 回退逻辑原样保留，并把回退结果收紧为 `expect(mapped).toMatchObject({ applied: true })`（静默失败不再能通过）。

### C. 字号路径降级不再掩盖失败

`applyFontSize` 保留原生 `<select>` → `change` 事件的两条路径，但把「字号是否真的生效」的 `waitUntil` 提升为**无条件**执行（不再只挂在 fallback 分支里），并保留对可见终态的硬断言：`fontSize` = 22（终态断言用 `expect({ path: enlargedMode, fontSize }).toEqual(...)` 携带路径信息）→ 复选框宽度 ≈ 22px 且大于初始值 → 收回 18px → 复选框回到初始尺寸。任一过程若字号未变化，`waitUntil` 与 `toBe(22)` 都会失败。

### D. 移除 `console.log`

`e2e/specs/smoke/task-list.e2e.mjs` 内 3 处 `console.log` 全部删除；`grep -rn 'console.log' e2e/specs/` 无输出（与其它 spec 一致）。原本要打印的诊断信息改为携带在断言对象的 matcher 里（`{ pointerMode, caretIndex }`、`{ path, fontSize }`），失败时照样可见。

### E. 外溢检查扩展到间距类声明

`src/lib/task-list-styles.test.ts` 的「不外溢」用例新增第二组检查：任何非 `data-type="taskList"` 选择器上出现 `margin` / `margin-top` / `margin-bottom` / `padding` / `padding-left` / `gap` / `row-gap` / `column-gap` 且取值为本变更引入的 `0.25em` / `0.4em`（正则 `^0?\.(?:25|4)em$`）即失败。唯一白名单是变更前就存在的 `.ProseMirror li { margin-bottom: 0.25em }`，按「选择器 + 属性 + 值」三元组精确放行，因此给 `.ProseMirror li` 新增 `margin-top: 0.4em` 之类仍会被抓到。原有断言（`.ProseMirror p` 0.75em、`.ProseMirror li` 0.25em、`.ProseMirror ul` padding-left 24px）保留。

负向对照：临时往 `editor.css` 追加 `.ProseMirror blockquote { margin-bottom: 0.25em }` 与 `.ProseMirror li { margin-top: 0.4em }` →

```
 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 新规则全部限定在任务列表范围内，不外溢到普通段落与列表
- Array []
+ Array [
+   ".ProseMirror blockquote { margin-bottom: 0.25em }",
+   ".ProseMirror li { margin-top: 0.4em }",
+ ]
      Tests  1 failed | 6 passed (7)
```

恢复后 `Tests  7 passed (7)`。

### 修复轮门禁复跑（真实输出）

```
$ npx vitest run src/lib/task-list-styles.test.ts
 ✓ src/lib/task-list-styles.test.ts (7 tests) 2ms
      Test Files  1 passed (1)
           Tests  7 passed (7)

$ npx tsc --noEmit            → exit 0（无输出）

$ npm test
      Test Files  86 passed (86)
           Tests  820 passed (820)

$ npm run validate:openspec
      Totals: 68 passed, 0 failed (68 items)

$ npm run test:e2e
[webkit 605.1.15 macos #0-0] MarkFlow smoke: task list layout
[webkit 605.1.15 macos #0-0]    ✓ renders empty task items with a measurable content area and a 1em checkbox
[webkit 605.1.15 macos #0-0]    ✓ places a caret inside an empty task item via coordinate mapping and keyboard movement
[webkit 605.1.15 macos #0-0]    ✓ toggles the checkbox without moving the caret and keeps nested items consistent
[webkit 605.1.15 macos #0-0]    ✓ scales the checkbox with the body font-size setting
[webkit 605.1.15 macos #0-0] 15 passing (18.6s)
Spec Files:  1 passed, 10 skipped, 11 total (100% completed)
```

> 上表 4.2 中旧用例名 `shows a caret inside an empty task item for both pointer and keyboard paths` 已按 B 项改名为 `places a caret inside an empty task item via coordinate mapping and keyboard movement`，其余用例名未变。

### 未改动（复核确认不属于缺陷）

- 工作区仍是脏的（改动待提交），提交发生在工作流后续步骤。
- `openspec/specs/task-list-wysiwyg/spec.md` 在归档前先行同步主规范，符合 AGENTS.md 规则 1。
- `git status --short` 与 `git ls-files --others --exclude-standard` 确认没有 `src/lib/__probe*.test.ts` 残留。


## Validation Evidence — 复核修复轮 2

独立复核第 2 轮指出 3 个缺陷（F 嵌套列表规则用裸 `ul` 外溢到普通列表、G 样式契约测试把泄漏的选择器当作契约、H e2e 死代码），已全部修复，证据如下。

### F. 嵌套列表规则收窄到嵌套任务列表

修正后的规则（`src/styles/editor.css`）：

```css
/* 嵌套任务列表收窄尾部留白，避免嵌套块在任务项末尾撑出段落级空白。
   选择器必须再限定 `[data-type="taskList"]`：只写裸 `ul` 会连带命中任务项里
   嵌套的普通项目符号/有序列表，把它们的 `.ProseMirror ul` 1em 下边距改成 0.25em。 */
.ProseMirror ul[data-type="taskList"] li > div > ul[data-type="taskList"] {
  margin-bottom: 0.25em;
}
```

普通列表的通用规则（`.ProseMirror ul, .ProseMirror ol { margin-bottom: 1em }`）与其下方的 `.ProseMirror ul { padding-left: 24px }` 未改动，第 6.2 项用单测锁住。

真实 WebKit 实测（新 e2e 用例，18px 字号）：

| 嵌套列表 | `data-type` | `list-style-type` | `padding-left` | `margin-bottom` |
|----------|-------------|-------------------|----------------|-----------------|
| 普通项目符号列表（任务项内） | `null` | `disc`（非 `none`） | `24px` | **`18px`** = 1em |
| 嵌套任务列表 | `taskList` | `none` | `0px`（任务列表自身规则） | **`4.5px`** = 0.25em |

两个列表的宿主任务项也一并锁定（`parentItemIndex` = 0 / 1，各 2 个子项），确保实测的是夹具里预期的那两个节点。

### G. 样式契约测试改为结构性判断

`src/lib/task-list-styles.test.ts` 的改动：

1. `NESTED_LIST` 改为 `.ProseMirror ul[data-type="taskList"] li > div > ul[data-type="taskList"]`，断言 `margin-bottom` 仍是 `0.25em`。
2. 新增 `compounds()` / `parseCompound()` / `endsWithPlainList()`：把选择器拆成 combinator 分隔的复合选择器，解析末位复合选择器的类型选择器与限定符（`[attr]` / `.class` / `#id` / 伪类）；末位是 `ul`/`ol` 且**不带** `[data-type="taskList"]`、也不带 class/id 即判为「裸列表」，会在任务列表范围外命中普通列表。
3. 新用例先做结构检查（任何含 `data-type="taskList"` 的规则若末位是裸 `ul`/`ol` 即失败），再断言修正后的规则存在，最后自检该检查本身有判别力：`… li > div > ul` → `true`、`… li > div > ol` → `true`、`… li > div > ul[data-type="taskList"]` → `false`、`… > li` → `false`。
4. 断言通用规则未变：`.ProseMirror ul` 与 `.ProseMirror ol` 的 `margin-bottom` 均为 `1em`。

负向对照（临时把 CSS 还原成裸 `ul`，真实执行）：

```
$ npx vitest run src/lib/task-list-styles.test.ts

 ❯ src/lib/task-list-styles.test.ts (8 tests | 2 failed)
   × 任务列表样式契约 > 嵌套列表规则只命中嵌套的任务列表，不会外溢到任务项里的普通列表
     → expected [ Array(1) ] to deeply equal []
   × 任务列表样式契约 > 连续任务项间距小于段落间距，嵌套任务列表尾部留白同步收窄
     → 嵌套任务列表 margin-bottom 缺失: expected undefined to be defined

 FAIL  src/lib/task-list-styles.test.ts > 任务列表样式契约 > 嵌套列表规则只命中嵌套的任务列表，不会外溢到任务项里的普通列表
AssertionError: expected [ Array(1) ] to deeply equal []

- Array []
+ Array [
+   ".ProseMirror ul[data-type=\"taskList\"] li>div>ul",
+ ]

 ❯ src/lib/task-list-styles.test.ts:142:39
      Tests  2 failed | 6 passed (8)
```

恢复修正后的选择器（`diff` 确认与修复版一致）后：

```
 ✓ src/lib/task-list-styles.test.ts (8 tests) 5ms
      Tests  8 passed (8)
```

### H. e2e 死代码清理

`e2e/specs/smoke/task-list.e2e.mjs` 删除的内容：未引用的 `const CHECKBOX`、未被断言的 `geometry.itemGaps` 与 `geometry.lineHeight`（以及只服务于 `itemGaps` 的 `gaps()` 辅助函数）、`describeItem()` 里无人读取的 `label` / `paragraph` 盒模型、`measure()` 里无人读取的 `x` / `y`、以及仅用于 `expect(geometry.paragraphs.length)` 的 `paragraphs` 数组（改为 `paragraphCount`，注释说明段落间距基线仍由 `adjacentParagraphGaps` 与 `computedStyles.paragraph` 覆盖）。

保留并接上断言的两处已采集数据：
- `selectionState().collapsed` → 指针路径断言 `expect(afterClick.collapsed).toBe(true)`（WebKit 需要折叠选区才会绘制光标）。
- `selectionState().activeIsCheckbox` → 切换用例断言 `expect(afterToggleSelection.focused).toBe(true)` 与 `expect(...activeIsCheckbox).toBe(false)`（点击复选框后焦点没跑到 input，这正是真实鼠标点击会抢光标的地方）。

核对脚本（未用局部变量 + 未被读取的采集键）：

```
unused top-level decls: none
unread collected keys: [ 'clientX', 'timeout', 'timeoutMsg' ]
```

剩下 3 个都是外部契约字段而非死数据：`timeout` / `timeoutMsg` 是 WDIO `browser.waitUntil` 的选项键，`clientX` 是 `new MouseEvent(type, { clientX, clientY, … })` 的构造参数。`grep -rn 'console.log' e2e/specs/` 无输出。

### 新增泄漏回归 e2e（含负向对照）

夹具（`e2e/run.mjs`，紧邻既有 `task-list-layout.md`）：

```js
await writeFile(
  path.join(workspace, 'task-list-nested-lists.md'),
  '# Task List Nesting\n\n- [ ] item with a plain list\n  - plain bullet one\n  - plain bullet two\n- [ ] item with a nested task list\n  - [ ] nested task item\n  - [x] nested task done\n\nTail paragraph.\n',
);
```

用例 `keeps an ordinary list nested in a task item at the generic list margin` 断言：普通嵌套 `<ul>` 的 `data-type` 为 `null`、`list-style-type` 非 `none`、`padding-left` = `24px`、`margin-bottom` = `18px`（1em×18px）；嵌套任务列表 `margin-bottom` = `4.5px`（0.25em×18px）；且 `parseFloat(plain.marginBottom) > parseFloat(task.marginBottom)`。

**负向对照（真实执行）** — 临时把 CSS 还原成裸 `ul` 后跑全量 smoke：

```
[0-0] Error in "MarkFlow smoke: task list layout.keeps an ordinary list nested in a task item at the generic list margin"
Error: expect(received).toBe(expected) // Object.is equality

Expected: "18px"
Received: "4.5px"
    at Context.<anonymous> (file:///…/e2e/specs/smoke/task-list.e2e.mjs:532:34)

[webkit 605.1.15 macos #0-0]    ✖ keeps an ordinary list nested in a task item at the generic list margin
[webkit 605.1.15 macos #0-0] 15 passing (19.8s)
[webkit 605.1.15 macos #0-0] 1 failing
Spec Files:	 0 passed, 1 failed, 10 skipped, 11 total (100% completed) in 00:00:24
```

恢复修正后的选择器后重跑（`diff` 确认字节相同）：

```
[webkit 605.1.15 macos #0-0] MarkFlow smoke: task list layout
[webkit 605.1.15 macos #0-0]    ✓ renders empty task items with a measurable content area and a 1em checkbox
[webkit 605.1.15 macos #0-0]    ✓ places a caret inside an empty task item via coordinate mapping and keyboard movement
[webkit 605.1.15 macos #0-0]    ✓ toggles the checkbox without moving the caret and keeps nested items consistent
[webkit 605.1.15 macos #0-0]    ✓ keeps an ordinary list nested in a task item at the generic list margin
[webkit 605.1.15 macos #0-0]    ✓ scales the checkbox with the body font-size setting
[webkit 605.1.15 macos #0-0] 16 passing (21.2s)
Spec Files:	 1 passed, 10 skipped, 11 total (100% completed) in 00:00:26
```

截图 `e2e/artifacts/task-list-nested-lists.png`：上方任务项内的普通项目符号列表与下方嵌套任务列表并存，普通列表行间距明显更宽（1em）。

### 修复轮 2 门禁复跑（真实输出）

```
$ npx vitest run src/lib/task-list-styles.test.ts
 ✓ src/lib/task-list-styles.test.ts (8 tests) 2ms
      Test Files  1 passed (1)
           Tests  8 passed (8)

$ npx tsc --noEmit            → exit 0（无输出）

$ npm test
      Test Files  86 passed (86)
           Tests  821 passed (821)

$ npm run validate:openspec
      Totals: 68 passed, 0 failed (68 items)
```

（`npm test` 由 820 → 821 条，新增的正是第 6.2 项那个结构检查用例；`npm run test:e2e` 由 15 → 16 条，新增第 6.4 项的泄漏回归用例。）

### 修复轮 3（终轮清理与门禁复核）

独立复核第 3 轮结论：`passed: true`，全部门禁绿，工作树与复核前逐字节一致（md5 校验），F/G/H 与第 1 轮各项均被负向对照证明确实修复。复核留下 3 条残余项，其中 2 条在本轮清理，1 条确认与本改动无关。

- 残余 1（已清理）：`e2e/specs/smoke/task-list.e2e.mjs` 仍有未被读取的采集值（`caret.width/bottom/right`、`pointerIntoContent` 返回的 `target`、`mapCoordsToSelection`/`caretIntoItemParagraph` 返回的 `pos`）。已删除未读字段，并把真正有价值的 `contentWidth` 接上断言（`> 100`）。
- 残余 2（已替换为有效断言）：原 `if (afterClick.caret.height > 0)` 三条断言在嵌入 WebDriver 下永不执行——`Range.getBoundingClientRect()` 对空块返回全零矩形，是死代码。改为量测**选区锚点元素的**几何（`anchorBox`），断言其落在空任务项内容框内且宽度 `> 100`。这才是"内容区未塌陷为 0 宽"的真实证据，也是 WebKit 能绘制光标的先决条件。
- 残余 3（不属本改动，另开 issue）：`.ProseMirror ul[data-type="taskList"] li` 是后代选择器，任务项内嵌套的**普通**列表项也会继承 `display: flex; gap: 8px`，导致其 `::marker` 项目符号被抑制、`li` 高度被抬到 44.1px（顶层普通列表项为 30.6px）。复核确认把任务列表 CSS 整块换回 `origin/main` 版本后表现完全相同，即本分支既不引入也不加重该问题；不在 #349 范围内处理，另行登记跟进。

### 修复轮 3 负向对照（证明光标断言有判别力）

把内容区 `flex: 1 1 0` 临时改回 `flex: 0 1 auto`（即修复前状态）后重跑，任务列表用例如期失败：

```
$ npm run test:e2e
[webkit 605.1.15 macos #0-0] 13 passing (19.6s)
[webkit 605.1.15 macos #0-0] 3 failing

1) MarkFlow smoke: task list layout renders empty task items with a measurable content area and a 1em checkbox
   expect(received).toBeGreaterThan(expected)
   Expected: > 100
   Received:   0
```

失败点正是 `anchorBox` 宽度与内容区宽度回到 0 —— 即"空任务项内容区塌陷"这一根因被真实守住。恢复 `flex: 1 1 0` 后（`src/styles/editor.css` md5 恢复为 `2ec58fc2cd318b4ae19f9d548cc17a4f`，与负向对照前一致）重跑全绿。

### 最终门禁（本分支定稿，真实输出）

```
$ npx tsc --noEmit
→ exit 0（无输出）

$ npm run build
→ ✓ built（tsc && vite build）

$ npm test
  Test Files  86 passed (86)
       Tests  821 passed (821)

$ npm run validate:openspec
  Totals: 68 passed, 0 failed (68 items)

$ bash scripts/check-archive-synced.sh
  OK: all archived delta specs (on/after 2026-07-21) are synced to main specs

$ npm run test:e2e
  MarkFlow smoke: task list layout
    ✓ renders empty task items with a measurable content area and a 1em checkbox
    ✓ places a caret inside an empty task item via coordinate mapping and keyboard movement
    ✓ toggles the checkbox without moving the caret and keeps nested items consistent
    ✓ keeps an ordinary list nested in a task item at the generic list margin
    ✓ scales the checkbox with the body font-size setting
  16 passing (20.1s)
  Spec Files: 1 passed, 10 skipped, 11 total — exit=0
```

`cargo` 相关门禁不适用：`git diff --name-only origin/main -- src-tauri/` 为空，本分支未触及 Rust。
