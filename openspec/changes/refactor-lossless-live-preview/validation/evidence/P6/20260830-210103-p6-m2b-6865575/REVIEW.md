# P6 M2b Independent Review — candidate `6865575`

**Reviewer:** independent Reviewer sub-agent（新会话、无上下文、盲检优先）
**Review time:** 2026-08-30T21:32:00+0800
**Candidate commit:** `6865575`（实现）／ `fa7d186`（evidence，HEAD）
**Branch:** `test/issue-255-lossless-byte-contract`
**Scope:** §9.5 M2b（inline / reference / autolink 隐藏 marker + 可编辑 dest/title）+ §9.8 M2b 相关项

> 复核顺序声明：本复核**先**独立读码（`6865575` 全部 5 个源码文件 + 测试断言 + design §9 契约），
> 独立跑全部 gate，形成判断，**后**读 `RUN.md` 对照。未修改任何产品代码；唯一写入文件为本文件。
> 硬约束：未发现违反三条硬约束中任意一条的情况（详见 §5）。

> **工作树注意（重要前置说明，见 Q1）**：复核开始时，工作树中存在一个**未跟踪**文件
> `src/lib/lossless/zzz-reviewer-probe.test.ts`（REVIEWER 遗留的临时 probe，`mtime` 21:18，
> 晚于候选 evidence 提交 21:01，头注释自称 "verified deleted before write-up" 但**未删除**）。
> 为使门禁在候选的真实干净树上复现，本人将该文件**临时移出**树外，跑完全部 gate 后**原样恢复**。
> 下述实测数字均为干净树（probe 缺席）所得；probe 的污染效应在 Q1 详述，**不构成候选缺陷**
> （候选提交的 evidence 在 21:01，probe 当时并不存在）。

---

## 1. Verdict: **PASS**

无 Blocker。所有 gate 由本人亲自在干净树上跑出 exit 0，数字与 RUN.md 完全一致。
`Minor ×3`、`Nit ×2`（另含 1 条工作树完整性观察，列为高优先级 Minor）。

**不构成 FAIL 的理由**：(a) 未发现任何 byte 合同/source truth/回滚失效；(b) 三条 Minor 均为
覆盖缺口或工作树卫生问题，非实现错误，且 flag 默认 OFF（惰性）不影响默认行为；(c) 重点怀疑区
逐条独立验证通过，实现与 design §9 契约一致。

**Go 未被批准**——本复核无此权限。Go 需「实现 + 独立 Reviewer + 人工验收 + Program Owner」
四者齐备后由主会话记录。

---

## 2. Evidence 表（本人实测，非抄录 RUN.md）

环境：node（项目 lockfile）+ darwin arm64。全部在 `/Users/xian/Project/book/MarkFlow` 执行。
所有 gate 均带 `--no-cache` / fresh（防 stale-cache 假绿）；除 Q1 所述 probe 外为候选干净树。

| ID | Command | 我的实测结果 | Exit | 与 RUN.md 一致 |
| --- | --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | 无输出（clean）—— **但须在 probe 缺席的干净树上**，见 Q1 | **0** | ✔ |
| C02 | `npx vitest run --no-cache` | `Test Files 51 passed (51)` / `Tests 890 passed (890)` | **0** | ✔ (890/890) |
| C02b | `npm test` | 见 Q1：probe 在场时 `52 passed / 899 passed`；probe 缺席的干净树 = `51/890` | **0** | 见 Q1 |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | `1 passed` / `79 passed` | **0** | ✔ (79/79) |
| C03m | `npx vitest run --no-cache src/lib/lossless/projection.test.ts -t 'P6 M2b'` | `Tests 17 passed / 62 skipped (79)` | **0** | ✔ 17 条 |
| C08 | `npm run test:byte-contract` | L0 positive `count:24` / negative `count:23` / `ok:true`；L1 positive `count:95` / negative `count:93` / `ok:true` | **0** | ✔ (24/23；95/93) |
| C10 | `npx openspec validate --all` | `Totals: 61 passed, 0 failed (61 items)` | **0** | ✔ (61/61) |
| C11 | `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build` | `✓ built in 3.68s` | **0** | ✔ |
| — | `bash scripts/check-evidence-immutable.sh 8ba0f44 HEAD` | `✅ 未发现未登记的「改写/删除已有 evidence 证据文件」提交` | **0** | ✔ |

**未亲自跑（如实标注「未验证」）**：C04-C07 Rust gates、C12-C14 桌面 E2E。理由与本 cohort 一致：
`git diff 228220b HEAD --stat` 确认 `.rs = 0 处`（纯 TS 投影层），沿用 M1 封存绿合理；C12-C14 属
真实桌面 E2E，归 PENDING-MANUAL。

### 测试真实性扫描（M1 Q1 教训的专项复查）

- `src/lib/lossless/**/*.test.ts` 内 `.skip` / `.todo` / `xit` / `xdescribe` / `.only`：**0 处**。
- **类型导入当值用**：`projection.test.ts:128` 为
  `import { runScopeHandlers, EditorView } from '@codemirror/view';` —— **值导入**；`Text` 亦是值导入
  （`:129`）。`import type { Transaction }`（`:130`）仅用于类型标注。干净树上 `tsc --noEmit` exit 0
  反证无 TS1361。**M1 Q1 模式未复现。**
- **断言确实求值**（关键证据）：
  - 边界删除 5 条用例（测试 12-17）全部断言**具体变更后的 doc 字符串**（例如
    `[text](…)` Backspace → 断言 doc `=== '[tex](https://example.com) tail'`、`press()` 返回 `true`、
    `txs.length === 1`）。若 handler 未真触发（类型擦除/未注册），doc 不会变 → 测试必红。
    现为绿，证明 `runScopeHandlers` 真触发了 `handleDelete` 且派发了正确事务。
  - 内边界用例（测试 16）断言 `press('Backspace')` 返回 `true` **且** `txs.length === 0` ——
    handler 真执行、消费按键、未派发事务。
  - flag OFF 用例（测试 17）断言 doc 变成 `'[text](https://example.com tail'`（`)` 真被普通删除）——
    若 handler 误拦截则 doc 不变，测试必红；绿证明默认路径真删了 `)`。
  - 几何用例（测试 1-11）均对**真实 editor** 断言 `hiddenAtomic` 精确 range、DOM `textContent`
    （如 `span.mf-link` 只含 `'text'`）与 `view.state.doc.toString()` 原样。断言类型为值判断，
    非被擦除的类型导入。
  - **结论：17 条 M2b 断言全部真实求值，不存在"擦除后空跑显示绿"。**

### 越界扫描

`git diff 228220b HEAD --stat -- . ':(exclude)**/validation/**'`：

- `.css` = **0 处** ✔
- `.rs` = **0 处** ✔
- `tasks.md` = **0 处**（未勾 §9.5/§9.8）✔
- 产品/测试/设计源码仅 5 文件：`livePreviewFlags.ts` / `projection.ts` /
  `hiddenMarkerInteraction.ts` / `projection.test.ts` + `design/phases/P6-true-wysiwyg-hidden-markers.md`，
  合计 729 增 7 删。
- 无 M3（quote/list/fence）/ image / widget 相关的产品代码文件混入。Q3 CSS 修
  （`.mf-hr:not(.mf-construct)`）**未**混入 ✔

---

## 3. 重点怀疑区：逐条结论

### 3.1 非对称多段 marker 的隐藏几何（最高优先级）—— **正确**，但嵌套 link-in-link 无提交断言（→ Q2）

**① 五形态几何是否精确？** 是。逐一验算：

| 形态 | markers | hide（replace+atomic） | 显示 | 实测（DOM/hiddenAtomic） |
| --- | --- | --- | --- | --- |
| inline `[text](url)` | `[` `]` `(` `)`（4） | `[`+`]`+`(`+`(`后`url`+`)` | 文本 `[1,5)` | 测试 1：hiddenAtomic `[[0,1],[5,6],[6,7],[7,26],[26,27]]`；DOM `.mf-link` 只含 `'text'` ✔ |
| inline `[text](url "title")` | 4 | +`title` | 文本 | 测试 2：hiddenAtomic `[[7,26],[27,34],[34,35]]`；DOM `'text'` ✔ |
| autolink `<https://x>` | `<` `>`（2） | `<`+`>` | URL `[1,20)` | 测试 3：`[[0,1],[20,21]]`；DOM 显示 URL ✔ |
| reference full `[text][ref]` | `[` `]`（2） | `[`+`]`+LinkLabel `[ref]` | 文本 `[1,5)` | 测试 4：`[[0,1],[5,6],[6,11]]`；DOM `'text'` ✔ |
| reference collapsed/shortcut | `[` `]`（2） | `[`+`]`(+Label) | 文本 | 测试 5：`[a][]`→`[[0,1],[2,3],[3,5]]`；`[b]`→`[[10,11],[12,13]]` ✔ |
| 定义行 `[ref]: dest` | `:`（1） | LinkLabel `[ref]`+`:`(+title) | dest URL | 测试 6：`[[0,5],[5,6]]`；DOM 显示 dest ✔ |

隐藏范围 = 全部 LinkMark + dest/title/label，仅留显示文本。**与 design §9.2 逐一吻合。** autolink 与
reference 均 `m.length===2`，通过「首 marker 字符 `'<'`」区分——autolink 首 marker 为 `<`、
reference 为 `[`，分支正确互斥（验证了代码 `doc.sliceString(m[0][0],m[0][1])==='<'`）。

**② 最内层 link-form 分配是否对嵌套正确？** 是（静态推演 `[A[B](c)](d)`）：
- 内层 `[B](c)`（`[2,8)`）与 URL `c`（`[6,7]`）→ 分配器取「最小包含 link-form」→ `c` 归内层 ✔
- 外层 `[A[B](c)](d)`（`[0,12)`）与 URL `d`（`[10,11]`）→ 仅外层包含 → `d` 归外层 ✔
- 内层隐藏 `[2,3][4,5][5,6][6,7][7,8]`（留 `B`）；外层隐藏 `[0,1][8,9][9,10][10,11][11,12]`
  （留 `A[B](c)`，其中内层 skeleton 已被取代）。**不会**把内层 URL 误归属外层，也不会在不该隐藏时误隐藏。

**③ 是否可能误隐藏（malformed）/ 内层 url 错误归属？** 否。`linkFormGeometry` 对 `markers=[]`（裸 URL）
返回 null → dimmed；`m.length` 不匹配任何分支（1/2/4）或 `textFrom>textTo` → null → dimmed，绝不半隐藏
（测试 9 实测 unclosed `[text` 无构造、裸 URL 无 hiddenAtomic、`visibility` 非 hidden）。内层 url 归属
正确（见 ②）。**GOLDEN parity 未破坏**：`PARITY_DOC` 含 inline `[l](https://u.example)` 与裸 URL
`Auto https://ex.example/a`，但**不含** `<…>` autolink / `[ref]:` 定义行；新分类门控仅 ON 时提升
Autolink/LinkReference（见 3.2），默认 OFF 下构造集不变，parity 测试在 79/79 中绿。

**④ 覆盖面缺口**：提交的 17 条只覆盖 `[**b**](u)`（strong 套 link），**没有**嵌套 link-in-link
`[A[B](c)](d)` 的提交断言（正是一个遗留 probe 欲探而未断言的点，见 Q2）。静态推演正确，但缺回归锁。

### 3.2 `classifyLezerNode` 分类门控 —— **成立，默认 OFF 保持 PARITY**

`classifyLezerNode`（`projection.ts:228-233`）仅当 `isLivePreviewProjectionOn('link')` ON 时把
`Autolink` / `LinkReference` 提升为本地 `mf-link`；OFF 时二者归 `default → 'unknown'` → 返回 null
（无装饰、精确实源码）。inline `Link` / `URL` 在 M2b 之前已是 link-local（非本 cohort 新增），
故默认 OFF 的构造集与 M2a 完全一致：

- `PARITY_DOC` 无 autolink/定义行节点 → 门控不会作用于 oracle 文档 → GOLDEN 绿（实测，79/79 含 parity）。
- 门控不漏不重：`Autolink`/`LinkReference` 只在此一处被提升；`Link`/`URL` 走既有 'local' owner 分支，
  二者不重叠。
- 网状确认：reference `[text][ref]` 与定义行在 ON 时产生构造（测试 4/6 断言 `def`/`ref` 均 defined、
  `markers.length` 正确），证明门控与真实 lezer 节点名匹配。

结论：**默认 OFF 保持 oracle；门控正确。**（与 RUN.md 声称一致。）

### 3.3 `hiddenMarkerInteraction.ts` link 边界删除 —— **符合 design §9.5 / ADR，逐条核对通过**

对照 design §9.5 契约：

| design §9.5 要求 | 实现（`linkBoundaryHit`） | 实测 |
| --- | --- | --- |
| inline/autolink/reference `Backspace @ range.to` → 删 link 文本末 grapheme、保骨架 | m.length>1：`backwards && pos===range.to` → `delete-content-end [m[0][1], m[1][0]]` | 测试 12/14/15：`[text](…)`→`[tex](…)`、`<https://ex>`→`<https://e>`、`[text][ref]`→`[tex][ref]` ✔ |
| `Delete @ range.from` → 删 link 文本首 grapheme | `!backwards && pos===range.from` → `delete-content-start` | 测试 13：`[text](…)`→`[ext](…)` ✔ |
| 其余 marker 内边界 → NoOp（不删 delimiter） | `backwards&&pos===textFrom` / `!backwards&&pos===textTo` → `noop` | 测试 16：`press` 返回 `true`、doc 逐字节不变、`txs.length===0` ✔ |
| 定义行仅 NoOp 保护 label | m.length===1：`backwards&&pos===m[0][1]`（`:` 后）/`!backwards&&pos===range.from`（`[` 前）→ `noop`，其余 null | 见 3.4；RUN.md 已披露"经普通 caret 编辑" |
| flag OFF → handler 返回 false，交回默认源码删除 | `hiddenCapable` 依赖 `isLivePreviewHiddenOn('link')`（OFF → 候选空 → 返回 null → false） | 测试 17：真删掉 `)` ✔ |

**是否可能在未覆盖情况下改动 doc / 破坏字节合同？** 否。逐条：
- 删除范围严格限于 `m[0][1]..m[1][0]`（显示文本），**从不进入** `[ref]` label、定义行 label、dest/title
  骨架区间 → 不可能在 reference `[ref]` label 上误删、不可能产生孤儿 delimiter。
- `readOnly`/`composing`/非空选区/`state!=='rendered'` 四处提前 `return false` 交回默认。
- 越界：`boundaryHitAt` 的 `:136` `constructs.every(c => c.from>=0 && c.to<=docLength)` 弱护栏 +
  `view.dispatch` 的 changes 严格在 `[contentFrom,contentTo]`（受 `range.to <= docLength` 约束）→ 无越界事务。
- **grapheme 切分**：`stepGrapheme` 仅代理对安全；组合字符 / ZWJ / 变体选择符 / 区域指示符不完整
  （M2a Q3 同款，RUN.md 已列为受限项）。CJK（单 BMP 单元）与 surrogate pair 正确 → Q4（Nit，沿用）。

**与 P4B 优先级冲突？** 静态分析未见可达冲突：M2a/M2b 与 `structuralInteraction` 同为 `Prec.highest`，
但 link 边界位置（`range.to`/`range.from`/内边界）与 structural 的 heading/quote/list `contentStart`
不重叠，非空选区由 `:176` 主动让路。未发现被绕过契约的可达位置。

### 3.4 定义行 dest 编辑 / 边界 —— **充分，无 trap；dest 经普通路径编辑（已披露，不越界）**

design §9.5 说定义行 `Backspace @ range.to` 删 dest 末 grapheme。实现让该位置返回 `null` → 走
**普通源码删除**。这不是偏差：定义行 inactive 时 dest URL 本来就**可见**（design §9.2 只隐藏
`[ref]:` 标签，dest 显示），故不存在"不可见 source 被删"——用户看到 dest 再删，且 CM 普通 Backspace
按 cluster（grapheme）删，效果等同于"删 dest 末 grapheme"且更严格。实现方在 RUN.md "受限项 2" 明确
披露"dest 经定义行普通 caret 编辑"，**未静默做一半**。安全（永不吞 `:`/`[ref]` label）。

### 3.4b 活动态编辑 dest/title（§9.5 硬性要求）—— **满足**

实现采用 design §9.1 规范的**整条 `revealed`**（active 时全字段可见可就地编辑，不建 active-field
边状态）。测试 7 实测：caret 进 dest（pos 20）→ `link.visibility==='revealed'`、`hiddenAtomic.length===0`、
DOM `.mf-link` 含 `'https://example.com'`；随后 dispatch 清除 URL range → doc 变 `[text]( "T")`。
**caret 在 link 内即整条显示 dest/title 且可就地编辑**——满足 §9.5 硬性要求。整条 reveal 使 caret
不可能落到不可见 source（全部源码可见），无 trap。字段级仅揭示作为 P7 增强候选，RUN.md 已披露为
降级受限项（reference dest 跨行 edit 不实现，经定义行编辑），**未静默做一半**。

### 3.5 越界扫描 —— **通过（见 §2）**

`.css` / `.rs` / `tasks.md` 均为 0；无 M3/image/widget 产品代码混入。

---

## 4. Q 列表

| ID | 级别 | 摘要 |
| --- | --- | --- |
| Q1 | **Minor（高优先级：工作树完整性）** | 遗留未跟踪 probe `src/lib/lossless/zzz-reviewer-probe.test.ts` 使 `tsc` EXIT=2、并把 vitest 计数从 51/890 抬到 52/899 |
| Q2 | **Minor** | 嵌套 link-in-link `[A[B](c)](d)` 的「最内层子节点归属」无提交断言（仅静态推演正确） |
| Q3 | **Minor** | 定义行边界删除（m.length===1）无提交断言；其"dest 经普通路径编辑"行为仅靠 RUN.md 披露 + 静态分析 |
| Q4 | Nit（沿用 M2a） | `stepGrapheme` 未处理组合字符 / ZWJ / 变体选择符 / 区域指示符 |
| Q5 | Nit | 几何测试用**手算偏移**断言精确 range；若 lezer 语法或字符集漂移，测试可能"错而绿"（由 DOM textContent 断言部分对冲） |

### Q1 — Minor（高优先级）— 遗留 probe 文件污染工作树与门禁重跑

复核开始时工作树存在未跟踪 `src/lib/lossless/zzz-reviewer-probe.test.ts`（`mtime` 21:18，晚于候选
evidence 21:01；头注释自称 "REVIEWER-ONLY scratch probe (temporary — verified deleted before
write-up)"）。该文件：

- 使 `npx tsc --noEmit` **EXIT=2**（4 条 TS6133 未用变量：`expect`/`vi`/`EditorView`/`farFrom`）——
  在它缺席的干净树上 tsc 是 exit 0（我实测证实）；
- 其 8 个 `it()` 被 vitest 纳入：`npm test` 在 probe 在场时 = **52 files / 899 tests**，absent 时 =
  **51/890**（与 RUN.md 一致）。

**判定**：不是候选缺陷——probe 未进入任何提交，候选提交的 evidence 在 21:01（probe 当时不存在），
且我在干净树上的重跑与 RUN.md 全部一致，证明候选的绿是真实的。但这是一个**货真价实的工作树卫生/可复现性
隐患**：任何人在当前工作树上直接复跑 C01 会得到红（tsc EXIT=2），复跑 C02 会得到 899 而非 890，
与封存 evidence 不一致，易造成假红/假计数。**建议主会话清理该文件**（或至少将其移出 `src/`），并复核
是否还有其它遗留 probe 类文件。我未删除它（本复核只写 REVIEW.md），已原样恢复树上状态。

### Q2 — Minor — 嵌套 link 归属无提交回归锁

提交的 17 条覆盖 `[**b**](u)`（strong 套 link，测试 8），但**没有** `[A[B](c)](d)` / `[A[**b**](c)](d)`
这类 link-in-link 的归属断言。最内层分配逻辑经我静态推演正确（URL `c`→内层、`d`→外层），但这是
重点怀疑区点名处，宜补一条提交断言固化为回归锁（当前唯一相关探测只存在于遗留 probe，且只有
`console.log`、无断言）。非实现错误。

### Q3 — Minor — 定义行边界删除无提交断言

m.length===1（定义行）分支只在"delimiter 邻接处 NoOp"路径上定义，且该分支的 4 条候选里没有对应
提交用例（17 条无定义行边界删除 assertion）。行为经静态分析正确且 RUN.md 已披露"经普通 caret 编辑"，
但契约矩阵对定义行这一行的实测覆盖为空。建议补一条：Backspace @ 定义行范围中段 → 普通删除 dest 字符、
Backspace @ `:` 后 / Delete @ `[` 前 → NoOp 不吞 label。

### Q4 — Nit（沿用 M2a）— grapheme 集群切分不完整

`stepGrapheme` 只处理 UTF-16 代理对。组合字符（`e`+U+0301）、ZWJ 表情（👨‍👩‍👧）、变体选择符（❤️）、
区域指示符（🇨🇳）会留孤立碎片。仅 flag ON 生效、不破坏字节、不产生孤儿 delimiter（只是删除粒度偏细）。
与 M2a Review Q3 同款，RUN.md 已列为受限项。建议补一条组合字符 / ZWJ 用例；人工验收需覆盖 CJK/日文
IME 连续 Backspace。

### Q5 — Nit — 手算偏移断言

几何用例多以**手写 UTF-16 偏移**断言 `hiddenAtomic` 精确 range（如 `[[0,1],[5,6],[6,7],[7,26],[26,27]]`）。
这些偏移若因未来字符集/语法调整而漂移，测试会"错而绿"（断言的是旧偏移）。已由 DOM `textContent` 断言
（`.mf-link` 只含显示文本）部分对冲——后者是行为级、非偏移级。低风险，建议注释标注偏移来源。

---

## 5. 硬约束逐条核验

### 硬约束 1 — 单一 source truth ✔ 未违反

- link 隐藏路径仅产 `Decoration.replace({})`（空 widget，`projection.ts` `buildHiddenConstruct` link 分支）
  与 `Decoration.mark`，并经 `EditorView.atomicRanges` 发布原子区间。**无 CSS 零宽 marker**
  （`.css = 0 处`）、**无 widget DOM 入正文**（replace 不带 widget）、**未改写 doc**（测试 11 以
  `view.state.doc` **对象同一性** `toBe(docBefore)` 证明）、**未调用 serializer**、**无 innerHTML /
  用户文本进 DOM**。`linkFormGeometry` 纯函数只读 source offset，不触碰 DOM。

### 硬约束 2 — flag 默认 OFF、可独立回滚 ✔ 未违反

- `link` 有独立 `livePreview.link`（projection）与 `livePreview.link.hidden`（hiding）开关
  （`livePreviewFlags.ts` 两个独立 Map + 独立 key），`createSwitch` 默认 `false`、仅字面量 `'1'` 启用。
- **关 hidden → dimmed** / **关 construct → source**：`isLivePreviewHiddenOn('link')` = proj && hidden；
  测试 17 实测 flag OFF 时 Backspace 是普通源码删除（`[text](…)` → `[text](…` 真删 `)`）。
- **doc / History / dirty / revision / bytes 均不变**：测试 11 以 `view.state.doc` 对象同一性证明
  隐藏 marker 未派发任何 doc 变更事务；测试 1/6 另断言 `doc.toString()` 与原文全等。

### 硬约束 3 — 字节合同 ✔ 未违反

- `npm run test:byte-contract` → L0 positive 24 / negative 23、L1 positive 95 / negative 93，双 `ok:true`，
  EXIT=0。
- 开启/关闭 marker 不改变 L0/L1 字节：隐藏 marker 是纯 decoration，测试 11 的 doc 对象同一性同时排除
  任何 doc 变更事务。
- 零编辑打开不写盘、无关闭提示：全量 890 中的 P0S 零编辑守卫绿（已在 C02 复跑）。

---

## 6. PENDING-MANUAL（必须留真实桌面验收，非本 run 可证）

**实现方已列（本人确认均仍需人工）：**

1. 真实 CJK / 日文 IME composition 期间 link 隐藏 marker 行为
2. Screen reader / a11y descriptor 读取 source range（含 link text / dest / title）
3. Normal / Large 文档 SLO 与长时稳定（link 几何解析 + 子节点捕获开销）
4. 三平台（macOS / Windows / Linux）桌面回归
5. 视觉基线（visible / dimmed / hidden / revealed 与三主题）——尤其 inactive 只显示 link text、
   reference 定义行显示 dest、active 整条 reveal 的观感

**本人复核新增（由 Q 列表派生）：**

6. 嵌套 link-in-link `[A[B](c)](d)` 在实际渲染中的观感（Q2）——骨架/字段替换后的组合显示是否正确
7. 定义行在 active 与 inactive 切换时的可编辑性与观感（Q3）
8. 大文档 + 高链接密度时 link 边界删除的按键延迟（`linkSubsByConstruct` 为 `O(C×M×C)` 归属判定）
9. **清除遗留 probe 后，工作树上的门禁复跑是否回到 51/890、tsc exit 0（Q1）**——属流程卫生，建议
   Program Owner 核实
10. 三主题下 hidden link marker 的零宽渲染与光标跨越（atomicRanges 需真实 WebView）

---

## 7. 与 RUN.md 声称不一致之处

| # | RUN.md 声称 | 本人实测 / 核验 | 性质 |
| --- | --- | --- | --- |
| 1 | C01 `npx tsc --noEmit` PASS (clean, exit 0) | 干净树上确为 exit 0；但**当前工作树**因遗留 probe 文件实为 **EXIT=2**（probe 非候选产物，见 Q1） | Q1，工作树卫生（非候选缺陷） |
| 2 | 「新增 17 条 M2b 单测（值导入，无 import type 当值用）」 | 17 条全部真实求值，`-t 'P6 M2b'` 实测 `17 passed / 62 skipped` —— **一致**；无 M1 Q1 模式 | ✔ |
| 3 | vitest 全量 890/890 | 干净树 890/890；probe 在场时 899 —— RUN.md 数字为干净树，正确 | ✔（Q1 例外已注明） |
| 4 | 越界扫描 `.css/.rs/tasks.md` = 0 | 实测一致 | ✔ |
| 5 | 定义行边界删除"不删除 dest grapheme，经普通 caret 编辑" | 与 design §9.5"删 dest 末 grapheme"经普通路径达成，非契约违背；实现方披露诚实 | ✔（披露一致） |

除 Q1 的"当前工作树 C01 实为红"这一环境层面异常外（非候选违反，候选提交的 evidence 为真），
RUN.md 其余声称（数字、17 条、越界扫描、immutability、flag 默认 OFF、受限项披露）**与本人实测全部一致**。

---

## 8. 复核过程声明

- 盲检顺序：先独立读 `git show 6865575` 全部 5 个源码文件 + `projection.ts` 全文 + `hiddenMarkerInteraction.ts`
  全文 + `livePreviewFlags.ts` 全文 + M2b 测试 17 条逐条 + design §9 契约 + GOLDEN/PARITY 相关段落，
  独立跑完全部 gate 并形成判断，之后才读 `RUN.md` 对照。
- 未修改任何产品代码。发现的所有缺陷仅记录不修复。
- 允许的例外：为在候选干净树上复现门禁，将遗留 probe（非候选产物）临时移出/移回 `src/`，最终**原样恢复**，
  工作树状态与开始时一致；未删除该文件。
- 唯一写入文件：本文件 `REVIEW.md`。未改写或删除本 run 目录下任何已封存文件
  （`RUN.md` / `ENVIRONMENT.md` / `gates/*`）。
- 所有 gate 均为本人亲自执行。未亲自执行部分（C04-C07 Rust gates、C12-C14 桌面 E2E）已在 §2 明确标注「未验证」。
- 未复现 M1 Q1 类型缺陷；17 条 M2b 断言经交叉验证确认真实求值。
- 发现一个非候选缺陷的工作树问题（遗留 probe，Q1），已完整记录并建议主会话清理。

**本复核不批准 Go。**
