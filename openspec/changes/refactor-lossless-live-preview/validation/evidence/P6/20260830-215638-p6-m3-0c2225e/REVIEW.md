# P6 M3 Independent Review — candidate `0c2225e`

**Reviewer:** independent Reviewer sub-agent（新会话、无上下文、盲检优先）
**Review time:** 2026-08-30T22:35:00+0800
**Candidate commit:** `0c2225e`（实现）／ `a3d0d43`（evidence，HEAD）
**Branch:** `test/issue-255-lossless-byte-contract`
**Scope:** tasks.md §9.6 + §9.8 的 quote（`>`）+ ordered/unordered/task list（`1.`/`-`/`- [ ]`）+ fence（```` ``` ````）隐藏 marker；空构造可发现；P4B widget 联动；块级边界删除保留骨架

> 复核顺序声明：本复核**先**独立读码（`0c2225e` 全部 5 个变更文件 + `projection.ts` / `hiddenMarkerInteraction.ts` /
> `livePreviewFlags.ts` 全文 + M3 的 21 条单测逐条 + GOLDEN/PARITY oracle + design §10 + §4 契约），
> 独立跑完全部 gate 并形成判断，**后**读 `RUN.md` 对照。未修改任何产品代码；唯一写入文件为本文件。
> 硬约束：未发现违反三条硬约束中任意一条的情况（详见 §3）。
>
> **工作树注意（重要前置说明，见 §7）**：为验证提交测试**未覆盖**的块边界删除路径，本人创建了一个
> 临时 probe 测试，跑完并**删除**（树状态与复核开始时完全一致，`git status` 无新增项）。probe 的存在
> 与删除过程在 §7 透明记载——这不是候选的遗留物，是本人复核用的临时工具，未进入任何提交。

---

## 1. Verdict: **FAIL**（不批 Go）

无 Blocker（无字节合同 / source truth / 回滚三连违规，全部 gate 绿、与 RUN.md 一致），
但 `blockBoundaryHit` 的**块级边界删除保护存在可复现的残缺**（§4.6 / §5 F1-F5），且**提交的 21 条
M3 单测全部使用单行/单 marker 构造，未覆盖任何多行 quote / 多 marker 或 fence 语言/body 边界，
导致这些残缺被 mask 为绿**。按 P6 硬性验收口径（§7「marker 边界删除保留骨架」，§1 产品目标
「点击/键盘不得把 caret 留在不可见 source position」），这些残缺是**产品交互缺陷**，不是测试缺口。

- §1 产品目标：「用户把 caret/selection 移入 construct 时原地揭示源码并继续编辑」。
- §7「以下任一发生即对应 cohort No-Go」的判据（selection trap、不可见 caret、空构造不可发现、
  显隐产生 doc transaction、无法回 Source）虽未直接命中其中任一条，但 §10.3 契约「marker 永不被
  单独删除」被**违反了**——受保护标记的**其它行标记**可被单次用户按键在不可见状态下删除。

**不构成 FAIL 的理由已排除**：三连硬约束全部通过；所有 gate 由本人亲自跑出 exit 0、与 RUN.md 数字
完全一致。**BUT** 缺陷集群 F1-F5 是「不可见 marker 被单键删除」的产品缺陷，且为保存字节的破坏——
一旦启用便会静默改写文档。鉴于该 cohort 的验收判据是「marker 永不被单独删除」，判 **FAIL**。

**Go 未被批准**——本复核无此权限。Go 需「实现 + 独立 Reviewer + 人工验收 + Program Owner」
四者齐备后由主会话记录。本复核只判 PASS / FAIL / BLOCK，此处为 FAIL。

---

## 2. Evidence 表（本人实测，非抄录 RUN.md）

环境：node（项目 lockfile）+ darwin arm64。全部在 `/Users/xian/Project/book/MarkFlow` 执行。
所有 gate 均带 `--no-cache` / fresh（防 stale-cache 假绿）；除 §7 所述临时 probe 外为候选干净树。

| ID | Command | 我的实测结果 | Exit | 与 RUN.md 一致 |
| --- | --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | 无输出（clean） | **0** | ✔ |
| C02 | `npx vitest run --no-cache`（全量） | `Test Files 51 passed (51)` / `Tests 911 passed (911)` | **0** | ✔ (911/911) |
| C02b | `npm test` | `51 passed` / `911 passed` | **0** | ✔ (911/911) |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | `100 passed (100)` | **0** | ✔ (100/100) |
| C03m | `npx vitest run --no-cache src/lib/lossless/projection.test.ts -t 'P6 M3'` | `21 passed | 79 skipped (100)` | **0** | ✔ 21 条 |
| C08 | `npm run test:byte-contract` | L0 positive `24` / negative `23` / `ok:true`；L1 positive `95` / negative `93` / `ok:true` | **0** | ✔ (24/23；95/93) |
| C10 | `npx openspec validate --all` | `Totals: 61 passed, 0 failed (61 items)` | **0** | ✔ (61/61) |
| C11 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build` | `✓ built in 3.54s` | **0** | ✔ (3.56s，±噪声一致) |
| — | `bash scripts/check-evidence-immutable.sh 8ba0f44 HEAD` | `✅ 未发现未登记的「改写/删除已有 evidence 证据文件」提交` | **0** | ✔ |

**未亲自跑（如实标注「未验证」）**：C04-C07 Rust gates、C12-C14 桌面 E2E。理由与本 cohort 一致：
`git diff fa7d186 0c2225e --stat -- . ':(exclude)**/validation/**'` 确认 `.rs = 0 处`（纯 TS 投影层），
沿用 M1 封存绿合理；C12-C14 属真实桌面 E2E，归 PENDING-MANUAL。

### 测试真实性扫描

- `src/lib/lossless/**/*.test.ts` 内 `.skip` / `.todo` / `xit` / `xdescribe` / `.only`：**0 处**。
- **M3 的 21 条测试无 `.only`**（重点检查了是否存在遗留 debug describe——没有，测试文件尾部两个
  M3 describe 均无 `.only`/`.skip`）。
- **类型导入当值用**：`projection.test.ts:132-134` 为 `import { runScopeHandlers, EditorView } from '@codemirror/view';`
  `import { Text } from '@codemirror/state';`（值导入）+ `import type { Transaction }`（仅类型标注）。
  `blockQuoteGeometry`/`blockListGeometry`/`blockFenceGeometry` 为**值导入**（`:110-113`）；C03m 实测
  21 条通过证明三个几何纯函数在运行时真实可调（若是 type-only 擦除会 ReferenceError/假红）。**M1 Q1 模式未复现。**
- **断言确实求值**：
  - 12 条几何/回滚测试对**真实 editor** 断言 `hiddenAtomic` 精确 range、DOM `textContent` 与
    `view.state.doc.toString()` 原样；
  - 9 条边界删除测试断言 `press('Backspace'/'Delete').toBe(true)` 且 `doc` 字符串逐字节不变（NoOp 路径）
    或精确变化（普通删除路径）；`-'P6 M3'` 单独跑仍 21/21 green，说明无跨 describe 污染。
  - **覆盖面警示（本次 Verdict 核心）**：9 条边界测试全部使用**单 marker 构造**（`'> hi\n'`、
    `'- hi\n'`、`'```\nabc\n```\n'`），**没有一条覆盖多行 quote（`> a\n> b\n`）、多 item list
    （`- a\n- b\n`）、带语言 fence 的边界（`fenceMarksAt` 的 openTo 只到 ```` ``` ```` 末、不含语言）**。
    详见 §5 F1-F5。

### 越界扫描

`git diff fa7d186 0c2225e --stat -- . ':(exclude)**/validation/**'`：

- `.css` = **0 处** ✔
- `.rs` = **0 处** ✔
- `tasks.md` = **0 处**（未勾 §9.6/§9.8）✔
- 产品/测试/设计源码仅 5 文件：`livePreviewFlags.ts` / `projection.ts` /
  `hiddenMarkerInteraction.ts` / `projection.test.ts` + `design/phases/P6-true-wysiwyg-hidden-markers.md`，
  合计 889 增 3 删。
- 无 M3 外文件混入；Q3 CSS 修未混入 ✔

---

## 3. 硬约束三连核查

### 硬约束 1 — 单一 source truth ✔ 未违反

- M3 隐藏路径仅产 `Decoration.replace({})`（`projection.ts` `buildHiddenConstruct` block 分支）与
  `Decoration.mark`（quote/list content mark、fence body mark），并经 `EditorView.atomicRanges`
  发布原子区间（`projectionExtension`）。无 CSS 零宽 marker（`.css = 0`）、无 widget DOM 入正文
  （fence 的 replace 不带 widget，ThematicBreakWidget 不用于 M3）、未改写 doc（测试 12 以
  `view.state.doc` 对象同一性证明 ~ 全程仅 `setLivePreviewHidden` + `view.dispatch(selection)`），
  未调用 serializer、无 innerHTML / 用户文本进 DOM（`blockIsEmpty`/几何纯函数只读 source offset）。

### 硬约束 2 — flag 默认 OFF、可独立回滚 ✔ 未违反

- `quote`/`list`/`fence` 各有独立 `livePreview.<c>`（projection）与 `<c>.hidden`（hiding）开关
  （`livePreviewFlags.ts` 两个独立 Map + 独立 key），`createSwitch` 默认 `false`、仅字面量 `'1'` 启用。
- **关 hidden → dimmed** / **关 construct → source**：测试 11 实测 `.hidden` OFF → `dimmed`（`marker`
  弱化、`hiddenAtomic=[]`）、construct OFF → `dimmed`（无原子）。回滚前后 `view.state.doc.toString()`
  全等（测试 11/12）。
- **doc / History / dirty / revision / bytes 均不变**：测试 12 以 `EditorState.doc` **对象同一性**
  证明隐藏 marker 未派发任何 doc 变更事务；测试 1-8 另断言 `doc.toString()` 逐字节全等。
- **交互层惰性**：`hiddenMarkerInteraction` 各分支先过 `hiddenCapable`（`isLivePreviewHiddenOn(kind)`
  = proj && hidden），默认 OFF 时候选为空 → handler 返回 false → 普通源码删除。测试 20 断言 `'> hi\n'`
  flag OFF 时 Backspace 真删 `h` 成 `'> i\n'`。**但注意**：此处证明的只是 handler 惰性；见 §5 的
  F1-F5——flag ON 时 handler 的保护**不完整**。

### 硬约束 3 — 字节合同 ✔ 未违反

- `npm run test:byte-contract` → L0 positive 24 / negative 23、L1 positive 95 / negative 93，双 `ok:true`，
  EXIT=0。
- 开启/关闭 marker 不改变 L0/L1 字节：隐藏 marker 是纯 decoration，测试 12 的 doc 对象同一性同时
  排除任何 doc 变更事务。
- 零编辑打开不写盘、无关闭提示：全量 911 中的 P0S 零编辑守卫绿（C02 复跑）。

---

## 4. 重点怀疑区：逐条结论

### 4.1 fence 的固定空 markers 是否被破坏 —— **未破坏**

- GOLDEN parity oracle（`projection.test.ts:169`）`{ from: 196, to: 218, markers: [], cls: 'mf-fence' }`
  —— `fence.markers === []` **未变**（parity 测试在 C03 100/100 中绿；P4B fence cohort 断言
  `fence.markers` 仍 `[]`，`projection.test.ts:891-894` 绿）。
- 机制确认：`buildDecorations` 的 `tree.iterate` 在 `enter(FencedCode)` 时**先捕获**直接子节点
  （`CodeMark`/`CodeInfo`/`CodeText` 进 `fenceSubs`），随后 `return false` 不下钻 → 开闭 `CodeMark`
  子节点**永不**进入 `markerSpans` → fence 的 `markers` 保持冻结空。开/闭/语言几何走 `fenceSubsByConstruct`。✔

### 4.2 `fenceMarksAt` 的 `resolveInner(range.from + 1, 0)` —— **规避正确**

- `hiddenMarkerInteraction.ts:183` 用 `resolveInner(range.from + 1, 0)`。我独立验证：`side:0` 在精确的
  fence 起始位解析会落在节点边界 → 返回 Document 根 → `parent` 走不到 FencedCode；`+1` 必然落在
  开 ```` ``` ```` 内（真实 fence 开标记 ≥3 backtick），`parent` 链到达 FencedCode。probe E 实测
  Backspace @ closeFrom 为 NoOp——证明该修复在真实栈上生效。✔

### 4.3 空块可发现 —— **通过**

- `blockIsEmpty(geo, doc)`（`projection.ts:506-513`）：quote 剥每行 `>`/前导空白、list 剥前导空白、
  fence 判 body trim 空。测试 6-8 实测空 quote 留 `>`（`visibility='visible'`）、空 list item 留 bullet
  （`hiddenAtomic=[]` + 非空 item 才隐藏）、空 fence 留 shell+language。与 design §4 一致。✔
  - 注：`blockListGeometry` 的 contentFrom 取 `m[m.length-1][1]`；task item 的 markers 只有 `-`
    （TaskMarker 被 widget owner 跳过），所以 contentFrom 在 `-` 后、`[ ]` 前——checkbox 可见。
  - 空判定对「marker 后仅有空白」的 item 判空（如 `- \n` → content `' \n'` → `visible`）正确。

### 4.4 malformed（unclosed）fence —— **通过**

- `blockFenceGeometry` 对无闭 `CodeMark` 返回 null → `buildHiddenConstruct` 返回 `dimmed`。
  测试 9 实测 `visibility` 非 hidden 且 `hiddenAtomic=[]`。PROBE 系列亦证实 unclosed 时
  `fence.visibility` 非 hidden。✔（fenceMarksAt 在 unclosed 时 openTo/closeFrom 也显式容错返回 null → 边界 handler
  也惰性——flagn ON 的 unclosed fence 边界删除回普通源码，虽然是真实缺陷 F6 的一部分，见 §5。）

### 4.5 P4B widget 联动 —— **除冲突面（F4）外成立**

- `taskCheckbox` owner 默认 `source-fallback`；`p4bWidgets.ts:585` 动态注册为 `widget`。buildDecorations
  对 `TaskMarker` 且 owner=widget 时 `return true`（不上 `markerSpans`）→ task list item 的 markers 只含
  `-`。测试 4/21 实测 `hiddenAtomic=[[0,1],[11,12]]` 且 `[ ]`/`[x]` 永不进原子集。✔
- `frontmatter` owner `source-fallback` → `classifyLezerNode` 返回 null，不产 mf 构造、不可隐藏。✔
- **`codeFenceControls` 冲突面（F4）**：`p4bWidgets.ts:589` 将其注册为 `widget`，`buildWidgetDecorations` 在
  fence 的**开标记 `openMark`** 上挂语言徽标/复制控件（`builder.add(openMark.from, openMark.from, …)`）。M3 的
  fence 隐藏把 **`[open.from, open.to]` + `[info.from, info.to]` + `[close.from, close.to]`** 替换为零宽。
  当 P4B fence cohort 开启（`codeFenceControls` flag）且 M3 `fence.hidden` ON 时：语言徽标 widget 显示的是
  `info` 原文，而 M3 隐藏把同一 `info.from` 范围替换为零宽 → DOM 中二者冲突（widget slot 位置上内容对不齐 /
  控件与隐藏范围重叠）。**职责边界无冲突判定**（`buildWidgetDecorations` 只校验 owner，不检查 P6 是否已
  隐藏该 range）。这是 P4B↔M3 并存时的潜在视觉冲突，属 Minor（flag 默认 OFF，双开才触发；`fence.hidden` 只能测
  出 `[3,5]` 原子位、不覆盖并存渲染）。PENDING-MANUAL 必须覆盖「fence 语言徽标与 M3 隐藏并存」。

### 4.6 块级边界删除 —— **FAIL（F1-F5，提交单测未覆盖）**

设计 §10.3 契约：
> - quote/list：`Backspace @ markers[0][1]`（开 marker 后）→ NoOp；`Delete @ range.from` → NoOp；其余位置交回普通源码删除。
> - fence：`Backspace`/`Delete` 在开 ```` ``` ```` 后/前 → NoOp；`Backspace` 在闭 ```` ``` ```` 前 → NoOp。

实现（`hiddenMarkerInteraction.ts:142-169`）把 **quote/list 的 after-marker 保护只写在 `m[0][1]`**、
fence 的开边界只写 `marks.openTo`（即开 ```` ``` ```` 末，不含语言）。我以临时 probe **实测证伪**了
「marker 永不被单独删除」对下列位置的成立性：

| Probe | 位置 | 期望（§10.3） | 实测 | 结果 |
| --- | --- | --- | --- | --- |
| A | `> a\n> b\n` Backspace @ pos 5（第二个 `>` 后） | NoOp | `'> a\n > b\n'` → `'> a\n  b\n'`（`>` 被删） | **违反** |
| B | 同款 doc Delete @ pos 4（第二个 `>` 前） | NoOp | 同上，`>` 被删 | **违反** |
| C | `- a\n- b\n` Backspace @ pos 5（第二个 item 的 `-` 后） | —— | listItem 是**各自独立构造**，第二个 item 的 `m[0][1]=5` 被 NoOp 保护 | ✔（列表无此 gap） |
| D | `'```\nabc\n```\n'` Delete @ pos 8（闭 ```` ``` ```` 前） | 应 NoOp（probe E 证明 Backspace @ 8 是 NoOp） | 闭标记第一根 backtick 被删 → `'```\nabc\n``\n'` | **违反** |
| F | 同 A，但从 pos 0 用 **ArrowRight ×5 真实导航**到达 pos 5 再 Backspace | 同上 | `>` 被删 | **违反（真实可达）** |
| G | `'```\nabc\n```\n'` Backspace @ pos 4（body 首 / 开 ```` ``` ```` 的换行后） | 普通 delete 可接受？ | `'`\n'` 被删 → `'````abc\n```\n'` | 见 F5 |
| H | `'```js\nconst x = 1;\n```\n'` Backspace @ pos 5（语言 `js` 后） | 语言是 section `10` 说的 "open + language + close 一起隐藏"，Backspace 不应吃语言末字 | `s` 被删 → `'```j\n…'` | **违反 F4** |

每个 probe 均 `press()` 返回 `true`、**确有按键被消费**（`handled=true`）——即吃标记的不是默认 keymap，
而是 `hiddenMarkerInteraction` 的 `handleDelete` 在**未识别到边界**时落到普通删除路径。这证明缺陷在 P6
handler 内（默认源码删除本就可预期地把 marker 当字符删；handler 的职责是拦截边界位置，它没拦到位）。

- 根因（quote/list）：`m[0][1]` 只覆盖**第一个** marker 的 after 边界；多行 quote 每行一个 `>`，第 2..N 行
  marker 的 after/before 边界未保护。但**行内** quote 每条线 marker 的 `> `（第 2 行起）也是原子范围，
  pos 位于其边界时不禁用。
- 根因（fence）：`blockBoundaryHit` 的 fence 分支只 NoOp 了 *Backspace@openTo / Delete@range.from /
  Backspace@closeFrom* 三个位置。**对称缺失**：Backspace@range.from（开 ```` ``` ```` 前，可并入前一行）、
  **Delete@closeFrom**（闭 ```` ``` ```` 前 → 吃 backtick，Probe D 实证）、Backspace@info 后、Backspace@body 前
  （Probe G）。run 通告还明确列出「fence **开/闭 ```` ``` ```` 边界 NoOp 保留骨架**」——但 Delete 在闭边界不是 NoOp。
  还缺失 **Backspace 在 fence 语言后的位置**：`fenceMarksAt.openTo` 无 info → 语言末字可被删（Probe H）。

### 4.7 reveal radius = 2 陷阱 —— **通过（fixture 全部拉开）**

对全部 12 条几何测试 fixture，用脚本计算 caret 到最后一个构造末的距离：quote=5、list=5、olist=5、task=5、
fence=4、emptyquote=4、emptylist=5、emptyfence=4、unclosed=5、notx=4 —— 全部 >2，无 radius 掩盖。✔

### 4.8 `import type` 当值用 —— **通过**

`projection.test.ts` 的 M3 新增导入：`blockQuoteGeometry` / `blockListGeometry` / `blockFenceGeometry`
（值导入）、`type ConstructRange` / `type LinkSub` / `type FenceSub`（类型导出仅标注）。C01 tsc exit 0
反证无 TS1361；C03m 21/21 green 证明运行时真实求值。`hiddenMarkerInteraction.ts` 新增 `type SyntaxNode` 仅用于
类型标注。✔

### 4.9 stale-cache 假绿 —— **通过**

全部 gate 由本人带 `--no-cache` 重跑；C08 的 fixture 以 `--verify` 全量重算；无缓存复用。✔

---

## 5. Findings

| ID | 级别 | 摘要 | file:line / 复现 |
| --- | --- | --- | --- |
| F1 | **Must-fix（产品缺陷）** | 多行 quote 第 2..N 行的 `>` 在 hidden 时**可被单次 Backspace 删除**（marker 空边界保护只覆盖 `m[0]`） | `hiddenMarkerInteraction.ts:149-155`（`afterMarker = m[0][1]`）；复现 `'> a\n> b\n'` hidden ON → caret pos 5 → Backspace → `'> a\n  b\n'`；ArrowRight 导航真实可达（Probe F） |
| F2 | **Must-fix（产品缺陷）** | 多行 quote 第 2..N 行的 `>` 可被 **Delete @ 该 marker 前**删除（`Delete @ range.from` 只保护整个 block 的首 marker） | 同文件 `:154`；Probe B 复现 |
| F3 | **Must-fix（产品缺陷）** | fence 闭 ```` ``` ```` 前 **Delete @ closeFrom** 删掉一根 backtick（只 NoOp 了 Backspace，缺 Delete）；闭标记是隐藏原子，删除成为不可见单字符编辑 | `hiddenMarkerInteraction.ts:165`（仅 `backwards && pos === marks.closeFrom`）；Probe D：`'```\nabc\n```\n'` → `'```\nabc\n``\n'` |
| F4 | **Must-fix（产品缺陷）** | 带语言 fence：Backspace @ `openTo`（语言 `js` 后）删除 `s`——开标记保护边界不含语言；语言 `[info.from, info.to]` 被 replace 原子，但其后位置不受保护 | `hiddenMarkerInteraction.ts:163`（`openTo` 至开 mark 末）；`blockFenceGeometry` 隐藏 `[info]` 但 `fenceMarksAt.openTo` 不含 info → Probe H：`'```js\n…'` → `'```j\n…'` |
| F5 | **Minor（边界含混）** | fence body 首个换行（open ```` ``` ```` 与 body 间）Backspace @ pos4 被删（`'```abc'`）——契约未列该边界，但“空白骨架”类删除在 Typora 式 UX 中应 NoOp 或解得精确；至少提交应明确说明 | Probe G；`hiddenMarkerInteraction.ts:163-165` 对 `bodyFrom` 无保护。另：越位一致性——quote/list 的 `m[0][1]` 保护「marker 后的空格」，等价地 fence 开行「``` 后到行首语言/换行」也应同规则。 |
| F6 | **Minor（共存冲突）** | P4B `codeFenceControls` widget（语言徽标/复制控件）注册于开 `openMark`，与 M3 fence 隐藏 `[open]+[info]` 的 replace **位置冲突**（同一 range 上 widget 签名显示 vs 零宽替换）；两者独立 flag 可同开 | `p4bWidgets.ts:235-249`（`builder.add(target.openMark.from, target.openMark.from, …)`）对 `projection.ts:618-623`（fence hide 含 `[info]`）；双开未在任何批测试覆盖。PENDING-MANUAL 必须验。 |
| F7 | Minor | M3 的 21 条单测全部使用**单行/单 marker** 构造：quote `'> hi\n'`、list `'- hi\n'`、fence `'```\nabc\n```\n'`——没有任何多行 quote（`> a\n> b`）、多 item list（`- a\n- b`）、带语言 fence（` ```js`）的**边界删除**断言；F1-F4 因此全部被 mask 为绿 | `projection.test.ts:2773-2911` |
| F8 | Nit | `blockBoundaryHit` 的 fence 分支缺 *Backspace @ range.from / Delete @ closeFrom* 的对称矩阵；run 通告声称「开/闭 ```` ``` ```` 边界 NoOp 保留骨架」被 F3 削弱为只保一半 | `hiddenMarkerInteraction.ts:157-167` |
| F9 | Nit | 字符铅笔：`blockIsEmpty` 的 quote 正则 `replace(/^>/gm,'')` 对 `> a\n> b` 只剥行首 `>`；对 `>> nested` 只剥一个——与 hide 用 {每个 QuoteMark} 的几何一致（每行剥一个）——低危；若嵌套 quote 视觉上剥两层仍是每层各自构造——无需修，记录 | `projection.ts:506-513` |

**严重度判定**：F1-F3 为「不可见 marker 被单键删除」的**字节破坏类产品缺陷**，违反 §10.3 契约 +
§1「键盘不得把 caret 留在不可见 source position」；F4 亦销毁不可见语言字符。均可在**启用 flag** 时被
真实用户一键触发（F 用 ArrowRight 导航实证）。这些缺陷是 M3 **交互契约**（与 headless 门禁无关）不完整，
故 Verdict = FAIL 而非 PASS±Minor。

---

## 6. 测试真实性扫描

已并入 §2；此处小结：

- `.skip`/`.todo`/`xit`/`xdescribe`/`.only` 全 0。
- M3 21 条全部真实求值、无被擦除断言；C03m `-t 'P6 M3'` 21/21 green。
- **没有**遗留的 debug `.only` describe（实现方曾加临时 debug 测试——已确认未进入提交）。
- M3 的 DOM 断言（`span.mf-fence` 只含 body、`span.mf-marker` 数、content 文本）为行为级，非 offset 级；
  部分 offset 断言仍为手算（`[0,3],[3,5],[19,22]` 等）——沿 M2b Q5 的 Nit（F7 同为覆盖缺口）。

---

## 7. 工作树注意（probe 的创建与删除）

复核开始时，工作树存在 3 个**未跟踪**文件，全部为先前已归档 cohort 的产物，非本候选缺陷：
`openspec/changes/refactor-lossless-live-preview/validation/GOAL-executor-typora-complete.md`、
`.../evidence/P6/20260830-184903-p6-m2a-228220b/REVIEW.md`、
`.../evidence/P6/20260830-210103-p6-m2b-6865575/REVIEW.md`。

为独立验证 §4.6 的边界缺陷（提交单测覆盖不到），本人**创建**了一个临时 probe
`src/lib/lossless/z.z.reviewer-probe-m3.test.ts`（8 个 it：A/B/C/D/E/F/G/H），跑出 6 red / 2 green，
随后**删除**该文件。复核结束时 `git status --short` 与开始完全一致（无 probe 残留）。未写入除本
REVIEW.md 之外的任何文件；未触碰任何已封存 evidence（RUN.md / ENVIRONMENT.md / gates/*）。

---

## 8. 结论与 Go 状态说明

- **Verdict: FAIL**（不批 Go）。
- 门禁全部绿、数字与 RUN.md 完全一致；三连硬约束未违反；但 **F1-F4 为启用后可复现的不可见-marker
  单键删除缺陷**，违反 §10.3「marker 永不被单独删除」契约与 §1「键盘不得把 caret 留在不可见
  source position」，且被 §5 F7 的测试覆盖缺口 mask 为绿。
- **Go 未被批准**——本复核无此权限。Go 需「实现 + 独立 Reviewer + 人工验收 + Program Owner」四者齐备。
  本复核判定候选**需修复后重跑**（新增多行 quote / 多 item / 带语言 fence 的边界删除测试 + 补齐
  `blockBoundaryHit` 的对称矩阵），修复后由独立 Reviewer 复核通过、再经人工桌面验收与 Program Owner 决定。
- PENDING-MANUAL 项（真实 CJK/IME、a11y、SLO、三平台、视觉基线）**全部仍待人工**；新增 F6
  「fence 语言徽标与 M3 隐藏并存」必须入人工验收清单。