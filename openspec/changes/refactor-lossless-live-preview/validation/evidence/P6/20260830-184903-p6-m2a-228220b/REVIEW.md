# P6 M2a Independent Review — candidate `228220b`

**Reviewer:** independent Reviewer sub-agent（新会话、无上下文、盲检优先）
**Review time:** 2026-08-30T20:12:23+0800
**Candidate commit:** `228220b`（实现）／ `bae6def`（evidence，HEAD）
**Branch:** `test/issue-255-lossless-byte-contract`
**Scope:** §9.4 M2a（strong / emphasis / strikethrough / inlineCode 隐藏 marker）+ §9.8 M2a 相关项

> 复核顺序声明：本复核**先**独立读码、独立跑 gate、形成判断，**后**读 `RUN.md` 对照。
> 全过程未修改任何产品代码；唯一写入文件为本文件。
> 硬约束：未发现违反三条硬约束中任意一条的情况（详见 §5）。

---

## 1. Verdict: **PASS**

无 Blocker。所有 gate 由本人亲自跑出 exit 0（唯一例外 C11，见 §2 注解，已用等价命令证实）。
`Minor ×5`、`Nit ×5`。

**不构成 FAIL 的理由**：5 条 Minor 全部满足其一或全部——(a) 不影响 doc / History / dirty /
revision / 字节；(b) 仅发生在 flag ON 路径（默认 OFF 惰性），不触碰默认行为；(c) 属覆盖缺口或
陈述强度问题，非实现错误。无一条可判定为字节合同破坏、source truth 破坏或回滚失效。

**Go 未被批准**——本复核无此权限。Go 需「实现 + 独立 Reviewer + 人工验收 + Program Owner」四者齐备后由主会话记录。

---

## 2. Evidence 表（本人实测，非抄录 RUN.md）

环境：node `v22.22.2` / npm `10.9.7` / darwin arm64。全部在 `/Users/xian/Project/book/MarkFlow` 执行。

| ID | Command | 我的实测结果 | Exit | 与 RUN.md 一致 |
| --- | --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | 无输出（clean） | **0** | ✔ |
| C02 | `npx vitest run --no-cache` | `Test Files 51 passed (51)` / `Tests 873 passed (873)` | **0** | ✔ (873/873) |
| C02b | `npm test` | `51 passed` / `873 passed` | **0** | ✔ (873/873) |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | `1 passed` / `62 passed` | **0** | ✔ (62/62) |
| C08 | `npm run test:byte-contract` | L0 positive `count:24` / negative `count:23` / `ok:true`；L1 positive `count:95` / negative `count:93` / `ok:true` | **0** | ✔ (24/23；95/93) |
| C10 | `npx openspec validate --all` | `Totals: 61 passed, 0 failed (61 items)` | **0** | ✔ (61/61) |
| C11 | `npm run build` | **EXIT=1** — vite `emptyDir` 清空 `dist/assets`（78 项）被环境 `safe-delete` 护栏拦截（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, threshold 50） | **1** | ✘ 见 Q10 |
| C11′ | `npx vite build --emptyOutDir false` | `✓ built in 4.22s`（`tsc` 已由 C01 单独 exit 0，故 `npm run build = tsc && vite build` 的两个阶段均已分别证实） | **0** | 结论一致 |
| — | `bash scripts/check-evidence-immutable.sh 8ba0f44 HEAD` | `✅ 未发现未登记的「改写/删除已有 evidence 证据文件」提交。` | **0** | ✔ |
| — | `npx vitest run --no-cache src/lib/lossless/projection.test.ts -t 'P6 M2a'` | `Tests 15 passed | 47 skipped (62)` | **0** | ✔ 15 条 |

**未亲自跑（如实标注「未验证」）**：C04 `cargo fmt` / C05 `cargo clippy` / C06 `cargo test`
markflow-core / C07 `cargo test` src-tauri / C12-C14 桌面 E2E。理由采纳实现方陈述：本 cohort 为纯
TypeScript 投影层，`git diff b949fb0 HEAD --stat` 确认 `.rs = 0 处`，沿用 M1 封存绿结果合理。

### 测试真实性扫描（M1 Q1 教训的专项复查）

- `src/lib/lossless/**` 内 `.skip` / `.todo` / `xit` / `xdescribe`：**0 处**。
- **类型导入当值用**：`projection.test.ts:126` 为
  `import { runScopeHandlers, EditorView } from '@codemirror/view';` —— 两者均为**值导入**。
  `projection.test.ts:127` 的 `import type { Transaction }` 仅用于 `txs: Transaction[]` 类型标注位。
  `tsc --noEmit` exit 0 亦可反证全树无 TS1361。**M1 Q1 模式未复现。**
- **断言确实求值**（关键证据，非仅凭"通过"）：
  - 测试 8 断言 `h.press('Backspace')` 返回 `true` 且 doc 由 `**bold**` 变 `**bol**` —— 若
    `runScopeHandlers` 未真正触发 handler，doc 不会变化，测试必红。
  - 测试 10/11 断言 `press()` 返回 `true` **且** `h.txs.length === 0` —— 证明 handler 真实执行、
    消费了按键、且未派发事务。
  - 测试 14（flag OFF）不断言返回值，只断言 doc 变成 `**bold* tail` —— 若 Backspace 未生效则
    doc 不变，测试必红；现为绿，证明默认路径真的删掉了一个 `*`。
  - 结论：**本轮 15 条断言均为真实求值，不存在"擦除后空跑显示绿"。**

### 越界扫描

`git diff b949fb0 HEAD --stat`：

- `.css` = **0 处** ✔
- `.rs` = **0 处** ✔
- `tasks.md` = **0 处**（未勾 §9.4/§9.8）✔
- 产品代码仅 5 文件：`hiddenMarkerInteraction.ts`(新) / `livePreviewFlags.ts` / `losslessSourceEditor.ts`
  / `projection.test.ts` / `projection.ts`，合计 1475 增 9 删（含 evidence 文档）。
- Q3 CSS 修（`.mf-hr:not(.mf-construct)`）**未**混入 ✔

---

## 3. 重点怀疑区：逐条结论

### 3.1 marker 归属变更（最高优先级）—— **成立，理由站得住；但连带影响被低估（→ Q1）**

**变更内容**（`projection.ts:673-694`）：在原有「marker 落在构造区间内」的过滤之上，追加一条：
若存在**严格嵌套**于本构造的另一个构造包含该 marker，则本构造不认领它。

**① 是否真的只影响 nested 场景？**
是。追加过滤的触发条件本身即「存在严格嵌套构造且 marker 落在其内」，非嵌套场景该 `.some()`
恒为 `false`。定义上不可能影响非嵌套构造。

**② GOLDEN parity 是否逐一保持？**
是，但**该绿不构成此改动的回归保护**（关键发现）。核验 `projection.test.ts:551-592` 的 `PARITY_DOC`：
全文唯一的嵌套是 `[l](https://u.example)` 中的 Link/URL（`GOLDEN` 的 `from:128,to:150` 与
`from:132,to:149`）。逐一验算 Link 的 4 个 LinkMark `[128,129] [130,131] [131,132] [149,150]`
是否落入 URL `[132,149)`：

- `[131,132]`：`mf=131 >= 132` 为假 → 保留
- `[149,150]`：`mt=150 <= 149` 为假 → 保留
- 其余两个更远 → 保留

故 Link 的 markers 在新规则下**完全不变**，`GOLDEN` 全绿。但 `PARITY_DOC` 中**没有**
`> **bold**` / `# **bold**` / `**\`code\`**` 这类真正会触发归属变更的嵌套，
**GOLDEN parity 对此改动的覆盖率为零**。唯一覆盖来自新增的测试 3（nested）。

**③ 是否存在其他被连带改动的构造？**
有，且**不止 nested 隐藏路径**。markers 列表还有 3 个消费点：

| 消费点 | 是否受影响 | 判定 |
| --- | --- | --- |
| `pairedInlineGeometry`（M2a 隐藏） | 是（本意） | 必要修正 |
| `resolveConstructVisibility`：`markers.length === 0 ? 'visible' : 'dimmed'` | 理论可达 | 低危，见下 |
| `cohortRevealActive`：link 队列要求 `markers.length === 4` | 理论可达 | 低危，见下 |
| dimmed 路径的 `.mf-marker` 装饰 | **是（实际发生）** | → Q1 |

- `markers.length === 0 → 'visible'`：需要构造**全部** marker 都被内层夺走。对 heading，
  HeaderMark 永远在内容之前；对 `**x**` / `*x*` / `~~x~~`，两侧 delimiter 总在嵌套构造之外
  （嵌套构造起点 ≥ openTo、终点 ≤ closeFrom）。逐一推演 `**\`code\`**`、`**_a_**`、`_**a**_`
  均未出现被夺空。判为**理论风险，实际不可达**。
- `markers.length === 4`（link 队列）：LinkMark 恒在 URL 之外（URL 起点 = `(` 后一位、
  终点 = `)` 前一位，LinkMark 恰好贴在两侧），逐一验算 `[a](b)`、`[![alt](img)](url)`、
  `[l](https://u.example)` 均未吞掉任何一个。判为**理论风险，实际不可达**；但属新增的隐式耦合，记为 Nit 并入 Q1。

**④ 改动理由是否站得住？**
站得住，且是**必需**的：旧规则下 `**\`code\`**` 的 StrongEmphasis 拿到 4 个 marker，
`pairedInlineGeometry` 的 `markers.length !== 2` 直接返回 `null` → 该嵌套 strong **永远无法隐藏**。
不修则 M2a 在嵌套场景根本不可用。测试 3 的
`expect(strong.markers).toEqual([[0,2],[8,10]])` 与 `expect(code.markers).toEqual([[2,3],[7,8]])`
正是这条修正的回归测试。**修正必要且正确。**

### 3.2 `hiddenMarkerInteraction.ts`（新增交互代码）—— **符合 ADR，逐条核对通过**

对照 `adr-typora-projection-interaction-contract.md` 与文件头注释所述矩阵：

| ADR 要求 | 实现位置 | 核对 |
| --- | --- | --- |
| Backspace 在闭 marker 后 → 删 content 末 grapheme，成对保留 | `:102-104` 返回 `delete-content-end`；`:134-144` 执行 | ✔ |
| Delete 在开 marker 前 → 删 content 首 grapheme，成对保留 | `:109-111` + `:146-154` | ✔ |
| Backspace 在开 marker 后（内边界）→ 只 reveal 不删 | `:106` 返回 `noop`；`:131` 返回 `true` 消费按键 | ✔ |
| Delete 在闭 marker 前（内边界）→ 只 reveal 不删 | `:113` + `:131` | ✔ |
| 空 content → NoOp | `:133` `if (text === '') return true` | ✔ |
| flag OFF → 返回 `false` 交回默认 keymap | `:73-75` `hiddenCapable` 在开关 OFF 时为假 → `:96` 候选为空 → `:128` 返回 false | ✔，测试 14 实测 |

**是否可能在某些未覆盖情况下改动 doc 或破坏字节合同？**

- 删除范围**严格限制在 `contentFrom..contentTo` 之内**（`:139` / `:149`），两个 delimiter 区间
  从不进入 `changes`。**不可能产生孤儿 delimiter。**
- `readOnly`（`:123`）、`composing`（`:124`）、非空选区（`:126`）、`state !== 'rendered'`（`:88`）
  四处提前 `return false`，交回默认路径。
- 越界防护：`:94` 的 `constructs.every(c => c.from >= 0 && c.to <= docLength)` 保证
  `contentTo <= doc.length`，`view.dispatch` 不会因越界抛错。
- **未发现**可破坏字节合同的路径。唯一的 doc 变更就是"删一个 grapheme"这一种普通 CM 事务。
- 隐患：`:94` 是**弱校验**（只要长度不越界即通过），且 `getProjectionSnapshot()` 是模块级单例 → Q7。

**与 P4B `structuralInteractionKeymap` 的优先级冲突？**
两者同为 `Prec.highest`。静态分析未发现可达冲突：

- `structuralInteraction.deleteForward` 在**空选区**直接 `return false`（`structuralInteraction.ts:755`）
  → Delete 的四个边界位置必然落到 M2a。
- `structuralInteraction.backspace` 只处理 heading/quote/list 的 `contentStart`
  （`:730-748`）。M2a 的 Backspace 只认 `closeTo` 与 `contentFrom`，**不认 `openFrom`**，
  故与 `contentStart`（通常在 `openFrom` 或更早）不重叠；即便重叠，也是 structural 先处理
  块级语义，符合预期。
- 非空选区：structural 走 `rangeBackspace`，M2a 在 `:126` 主动让路 —— 两者互补，无双处理。
- 注：同优先级下的相对先后**未由单测直接证明**（M2a 测试通过只能说明在那些位置 structural 让了路），
  但上述分析表明不存在会导致契约被绕过的可达位置。记为观察项，不立项。

**grapheme 切分对 surrogate pair / 组合字符 / CJK：**

| 类别 | 是否正确 | 依据 |
| --- | --- | --- |
| surrogate pair（🚀） | ✔ 正确 | `:49-54` 前向、`:58-62` 后向均做高低代理配对；测试 13 实测 `**a🚀**` → `**a**` |
| CJK（单 BMP 字符） | ✔ 正确 | 单 UTF-16 单元，`offset ± 1` 正确 |
| 组合字符（`e`+U+0301） | ✘ 会留下孤立组合符 | `stepGrapheme` 无 combining mark 处理 |
| ZWJ 序列（👨‍👩‍👧） | ✘ 会留下孤立片段 | 同上 |
| 变体选择符（❤️） | ✘ 同上 | 同上 |
| 区域指示符（🇨🇳） | ✘ 会留下半面旗 | 同上 |

→ 记为 **Q3（Minor）**：CM 自带 `deleteCharBackward` 使用 `findClusterBreak`，比此处更严格。

### 3.3 空构造 / malformed —— **分支存在且方向正确，但零测试覆盖（→ Q5）**

- 空 content → `'visible'`（`projection.ts:330`）：方向正确（保持可发现，不隐藏）。
- malformed（`markers.length !== 2` 或 marker 重叠）→ `'dimmed'`（`projection.ts:329` + `:300`/`:303`）：
  方向正确（绝不隐藏半个配对）。
- **但 15 条新测试无一覆盖这两条分支**。测试 4（input rule）证明的是未闭合 `**bold` 根本不产生
  构造节点（`toBeUndefined()`），并未走到 `return 'dimmed'`。
- 在 marker 归属修正之后，完整节点恒为 2 个 marker，故这两条**基本是防御性代码**。
  但 commit 与 RUN.md 均将"空 content 回 visible 保持可发现"作为已实现保证来陈述，
  证据强度超出实际覆盖。
- 另见 Q4：content 退化到长度 1 时的收尾行为未被契约定义。

### 3.4 越界扫描 —— **通过**

见 §2 越界扫描：`.css` / `.rs` / `tasks.md` 均为 0。

---

## 4. Q 列表

| ID | 级别 | 摘要 |
| --- | --- | --- |
| Q1 | **Minor** | marker 归属修正连带改变默认 OFF 路径的 dimmed 渲染，且 GOLDEN parity 对该改动零覆盖 |
| Q2 | **Minor** | 「关 construct → source」对四个行内构造未真正实现，与 RUN.md "双层回退" 陈述不符 |
| Q3 | **Minor** | `stepGrapheme` 未处理组合字符 / ZWJ / 变体选择符 / 区域指示符 |
| Q4 | **Minor** | content 长度为 1 时边界规则被绕过；空配对下 Backspace/Delete 可能被吞 |
| Q5 | **Minor** | 空 content → `visible`、malformed → `dimmed` 两条分支无测试覆盖 |
| Q6 | Nit | 测试 5 标题称 "double-click"，实际只 dispatch selection，未发真实 dblclick 事件 |
| Q7 | Nit | 边界删除依赖模块级单例快照，其 staleness 护栏为弱校验 |
| Q8 | Nit | 嵌套归属判定为 `O(C × M × C)`，需 Large 档 SLO 实测 |
| Q9 | Nit | `gates/C01.tsc.log` 为 0 字节空文件，无法自证"确实跑过" |
| Q10 | Nit | C11 的绿依赖 `CODEBUDDY_SAFE_DELETE_ENABLED=0`，未禁用时 `npm run build` 实际 EXIT=1 |

### Q1 — Minor — marker 归属修正的连带视觉影响 + GOLDEN 零覆盖

`projection.ts:673-694` 在**所有 flag 状态下**生效（不在任何开关之后）。除修正 nested 几何外，
它还移除了祖先构造对嵌套 delimiter 的 **重复** `.mf-marker` 装饰。

`src/styles/editor.css:770-773`：
```css
.mf-construct .mf-marker { opacity: 0.45; color: var(--muted); }
```
`opacity` 会嵌套复合。此前 `> **bold**` / `# **bold**` 中的 `**` 被祖先和自身各施加一次
`.mf-marker`，有效不透明度约 `0.45 × 0.45 ≈ 0.20`；现在只施加一次 → `0.45`。

**这等于默认 OFF 配置下，嵌套 delimiter 会 visibly 变亮。**

- 不构成硬约束违反：字节 / doc / History / dirty / revision 均未变，dimmed 本就是可视状态。
- 方向上是修 bug（双重变暗大概率非本意），但**属于默认路径的可见变更且无任何单测覆盖**。
- **处理建议**：人工视觉基线必须包含「嵌套构造的 marker 亮度」一项（已列入 §6）；建议补一条
  断言嵌套场景下 `.mf-marker` 只施加一次的回归测试。

同项附记（Nit 级）：link 队列的 `cohortRevealActive` 依赖 `markers.length === 4`
（`projection.ts:424`），现在隐式依赖"LinkMark 不被任何嵌套构造吞掉"。逐一验算目前不可达，
但这是一条新增的、无测试守护的隐式耦合。

### Q2 — Minor — 「关 construct → source」未真正实现

`isLivePreviewProjectionOn` 在生产代码中的唯一切入点是 `projection.ts:221`（且仅用于
`thematicBreak`）。四个行内构造的 projection 开关只作为 `.hidden` 的前置条件
（`isLivePreviewHiddenOn = proj && hidden`，`livePreviewFlags.ts:126-128`），
**不会撤除 `mf-construct` / `.mf-marker` 装饰**。

rollback 测试自身即为佐证：
```js
// The construct switch OFF → source fallback for it (no projection/hiding).
setLivePreviewProjection('strong', false);
...
expect(snap.constructs.find((c) => c.cls === PROJECTION_CLASSES.strong)!.visibility).toBe('dimmed');
```
注释说 "source fallback"，断言却是 `'dimmed'` —— 两者矛盾，且 RUN.md §"Rollback proof"
的"双层回退…construct OFF → source fallback" 沿用了注释而非断言。

**为何仍判 Minor 而非 Blocker**：
1. 对行内构造，"source" 的实质是「全部字符可见」。`dimmed` 正是全部字符可见（仅标记弱化），
   与 thematicBreak（会被替换成 rule widget）性质不同，可视为行内语义下的合理等价。
2. 与既有 M1 heading 的处理**完全一致**（heading 的 projection 开关同样不撤除装饰）——
   非 M2a 新引入的偏差。
3. 字节 / doc / History 全程不变；**隐藏行为（M2a 的实际功能）确实可逐构造独立回滚**，
   测试 6 已证明（关 `strong.hidden` 后 `hiddenAtomic` 由 4 条降为 2 条，inlineCode 仍 hidden）。

**处理建议**：RUN.md 与测试注释应改为"对行内构造，construct OFF 等价于 dimmed（全部源字符可见），
而非移除装饰"；或若确需真 source fallback，应在 `classifyLezerNode` 为四个行内 kind 补上开关判定。

### Q3 — Minor — grapheme cluster 切分不完整

`hiddenMarkerInteraction.ts:46-64` 的 `stepGrapheme` 只处理 UTF-16 代理对。
以下会留下孤立碎片：组合字符（`e` + U+0301）、ZWJ 表情序列（👨‍👩‍👧）、变体选择符（❤️）、
区域指示符（🇨🇳）。CM 自带 `deleteCharBackward` 使用 `findClusterBreak`，比此处严格。

**限定条件**：仅 flag ON 时生效（默认 OFF 惰性），且只影响"边界删除"这一条路径，其他删除仍走 CM 默认。
不产生孤儿 delimiter，不破坏字节（只是删除粒度偏细，用户多按一次）。

**处理建议**：改用 `Intl.Segmenter`（或复用 CM 的 `findClusterBreak`）；至少补一条 ZWJ / 组合字符用例。
人工验收需覆盖 CJK / 日文 IME 下的连续 Backspace。

### Q4 — Minor — content 退化到长度 1 时边界规则被绕过

静态推演（**未实测**，标注为分析结论）：

`**a**`（Strong `[0,5)`，markers `[0,2]`/`[3,5]`，content `[2,3)`），caret 在 3：
- backwards 分支只匹配 `pos === closeTo(5)` 与 `pos === contentFrom(2)`，均不等 → 返回 `null`
- → 交回默认 Backspace → 删掉 `a` → `****`，caret 落 2

结果：字节层面 `**` + `**` 仍在（**无孤儿 delimiter**，契约未被破坏），但构造语义消失
（`****` 会被重新解析为内容为空的 strong 或纯文本）。

延伸：若 `****` 被解析为空 content 的 StrongEmphasis，则 pos=2 命中 `contentFrom` → NoOp（吞键），
pos=4 命中 `closeTo` 且 `text === ''` → `return true`（吞键）。用户可从 pos=1 用默认删除脱困，
故非死锁，但"按 Backspace 无反应"是明确的体验陷阱。

**判定**：ADR 只定义了"空 content → NoOp"，未定义 content 收尾；实现与 ADR 一致。
判 Minor，建议由 Program Owner 决定是否需要"空配对时整体删除构造"的 Typora 式收尾行为。

### Q5 — Minor — 两条防御分支零覆盖

`projection.ts:329`（malformed → `dimmed`）与 `:330`（空 content → `visible`）在 15 条新测试中
均无对应用例。理由见 §3.3。属**覆盖缺口 + 陈述强度超出证据**，非实现错误。

### Q6 — Nit — 测试标题超出证据

测试 5 名为 "double-click and cross-marker selections reveal the construct"，但用例通过
`view.dispatch({ selection: { anchor: 2, head: 6 } })` 直接派发选区，**未派发真实 dblclick 事件**。
其实际验证的"选区 reveal"是有效且必要的，但"double-click"这一交互未经证明。
建议改名，或补真实 `dblclick` 事件派发。

### Q7 — Nit — 单例快照与弱 staleness 护栏

`boundaryHitAt` 依赖模块级 `getProjectionSnapshot()`。护栏 `:94` 仅校验
`c.from >= 0 && c.to <= docLength` —— 只要文档长度不越界即通过，无法识别"同长度但内容已变"的
陈旧几何。与 M1 Q4（`hiddenAtomicRanges` 单例）同源。当前应用为单一 surface，不可达。

### Q8 — Nit — 嵌套判定复杂度

`projection.ts:682-693` 在 `markerSpans.filter()` 内嵌套 `constructs.some()`，
复杂度 `O(C × M × C)`，随 viewport 内构造数平方增长。正常档（C 数十）无碍；
Large 档或超长行需实测。已列入 §6 PENDING-MANUAL。

### Q9 — Nit — 空 gate 日志

`gates/C01.tsc.log` 为 **0 字节**。tsc 无输出时该文件无法自证"确实执行过"。
建议至少追加一行 `exit code: 0`，与其他 gate 保持一致的可审计性。

### Q10 — Nit — C11 的绿依赖环境变量，未禁用时实际为红

RUN.md 记录 C11 为 `npm run build` **PASS（`CODEBUDDY_SAFE_DELETE_ENABLED=0`）**。
本人在**未**禁用该护栏的环境复跑 `npm run build`，得 **EXIT=1**：

```
[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":78,"threshold":50,"scope":"turn",
 "targets":["/Users/xian/Project/book/MarkFlow/dist/assets"],"targetCount":1}
    at checkBulkDeleteGuard (.../node-safe-delete-shim.cjs:214:19)
    at emptyDir (.../vite/dist/node/chunks/dep-BK3b2jBa.js:17082:19)
```

**非产品缺陷**（拦截发生在 vite 清空输出目录阶段，与本次改动无关）。改用
`npx vite build --emptyOutDir false` 后 **EXIT=0，`✓ built in 4.22s`**；配合 C01 `tsc` exit 0，
`npm run build` 的两个阶段均已分别独立证实。

处理建议：RUN.md 应把 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 从括注提升为**显式前置条件**，
否则他人在默认环境下复现会直接得到红。

---

## 5. 硬约束逐条核验

### 硬约束 1 — 单一 source truth ✔ 未违反

- `EditorState.doc` 唯一正文：M2a 隐藏路径只产出 `Decoration.replace({})`（`projection.ts:332-333`）
  与 `Decoration.mark`（`:334-338`），并通过 `EditorView.atomicRanges`（`:852`）发布原子区间。
- **无 CSS 零宽 marker**：本 cohort `.css` 改动为 0。
- **无 widget DOM 入正文**：M2a 的 replace **不带 widget**（与 M1 thematicBreak 的
  `ThematicBreakWidget` 不同，后者为本 cohort 范围外的既有代码）。
- **未改写 doc**：`projection.ts` 头部契约 + 测试 7 以 `EditorState.doc` 对象同一性证明。
- **未调用 serializer**、**无 `innerHTML` / 用户文本进 DOM**：新增文件全文无 DOM 写入，
  决策全部基于 source offset；`ThematicBreakWidget.toDOM`（M1 既有）只写静态 class 与
  `aria-hidden`，不含用户文本。

### 硬约束 2 — flag 默认 OFF、可独立回滚 ✔ 未违反（Q2 为措辞/语义级偏差）

- 四个构造各有 `projection` 与 `.hidden` 分离开关（`livePreviewFlags.ts:38-48`，
  两个独立 `Map` + 独立 localStorage key `markflow.livePreview.<c>[.hidden]`），
  `createSwitch` 默认 `false`（`:73`），仅字面量 `'1'` 才启用（`:76-78`）。
- **关 hidden → dimmed**：测试 6 实测（关 `strong.hidden` → strong `dimmed`，
  `span.mf-marker` 内容为 `**`）。
- **关 construct**：见 Q2 —— 对行内构造不撤除装饰，停于 `dimmed`。判定为 Minor，
  因与 M1 heading 一致、字节不变、隐藏行为仍可独立回滚。
- **doc / History / dirty / revision / bytes 均不变**：测试 7 以 `view.state.doc`
  **对象同一性**（`toBe(docBefore)`）证明隐藏 marker 未派发任何 doc 变更事务
  （比字符串/长度比较更强）；测试 1 证明默认 OFF 下 doc 与原文全等。
- **交互层惰性**：测试 14 实测 flag OFF 时 Backspace 就是普通源码删除（`**bold**` → `**bold*`）。

### 硬约束 3 — 字节合同 ✔ 未违反

- `npm run test:byte-contract` → L0 positive 24 / negative 23，L1 positive 95 / negative 93，
  双 `ok: true`，EXIT=0。
- 开启/关闭 marker 不改变 L0/L1 字节：隐藏 marker 是纯 decoration；测试 7 的 doc 对象同一性
  同时排除了任何 doc 变更事务。
- 零编辑打开不写盘、无关闭提示：`src/main.lifecycle.guard.test.ts` 21 条 P0S 守卫全绿
  （含 BOM/CR/CRLF/mixed 各类尾缀，`mtimeDelta=0.0ms`、`dirty=false`、`saves=0/0`、`prompt=null`），
  已在全量 873 中复跑通过。

---

## 6. PENDING-MANUAL（必须留真实桌面验收，非本 run 可证）

**实现方已列（本人确认均仍需人工）：**

1. 真实 CJK / 日文 IME composition 期间的隐藏 marker 行为（单测只覆盖 `composing` 纯函数分支）
2. Screen reader / a11y descriptor 读取 source range
3. Normal / Large 文档 SLO 与长时稳定观察
4. 三平台（macOS / Windows / Linux）桌面回归
5. 视觉基线（visible / dimmed / hidden / revealed 与三主题）

**本人复核新增（由 Q 列表派生）：**

6. **嵌套构造 marker 亮度的视觉基线**（Q1）—— 重点比对 `> **bold**` / `# **bold**` /
   `**\`code\`**` 与本 cohort 之前的截图，确认 `opacity` 由 ~0.20 变 0.45 是可接受的修正
7. **CJK / 日文 IME 下连续 Backspace 的删除粒度**（Q3）—— 组合字符、ZWJ 表情、国旗的收尾
8. **空配对（`****`）与 content 长度 1 时的删除手感**（Q4）—— 确认"按 Backspace 无反应"
   是否被判定为可接受
9. **Large 档下 viewport 内高构造密度时的按键延迟**（Q8）—— 验证 `O(C × M × C)` 归属判定的实际开销
10. **三主题下 hidden marker 的零宽渲染与光标跨越**（ADR §2 的 atomicRanges 行为需真实 WebView 验证）

---

## 7. 与 RUN.md 声称不一致之处

| # | RUN.md 声称 | 本人实测 / 核验 | 性质 |
| --- | --- | --- | --- |
| 1 | C11 `npm run build` **PASS**（`CODEBUDDY_SAFE_DELETE_ENABLED=0`） | 未禁用护栏时 **EXIT=1**；改用 `npx vite build --emptyOutDir false` 得 EXIT=0 | Q10，环境依赖未显式化 |
| 2 | "双层回退：…再关 construct → source fallback" | 断言实为 `'dimmed'`，construct 开关不撤除行内装饰 | Q2，陈述与断言矛盾 |
| 3 | "既有 `GOLDEN` parity 全部保持不变" 被用作 marker 归属修正的安全性论据 | 事实成立，但 `PARITY_DOC` 无触发该修正的嵌套，**GOLDEN 对此改动零覆盖** | Q1，论据强度不足 |
| 4 | "此前内层 CodeMark 会被外层重复打 `.mf-marker`" | 属实，且**默认 OFF 路径因此发生可见变更**（opacity 复合解除） | Q1，影响面被低估 |
| 5 | 测试 5 "double-click …" | 未派发真实 dblclick 事件，仅 dispatch selection | Q6，标题超出证据 |
| 6 | 未声明 | `gates/C01.tsc.log` 为 0 字节 | Q9，证据可审计性 |

除上述 6 项外，RUN.md 的其余声称（C01/C02/C02b/C03/C08/C10 数字、15 条新测试、
越界扫描、immutability EXIT=0、feature flag 默认 OFF）**与本人实测全部一致**。

---

## 8. 复核过程声明

- 盲检顺序：先独立读 `git show 228220b` 全部 5 文件 + `projection.ts` 全文 +
  `structuralInteraction.ts` 的 Backspace/Delete 路径 + `editor.css` 的 `.mf-marker` 规则 +
  ADR 契约，独立跑完全部 gate 并形成判断，**之后**才读 `RUN.md` 对照。
- 未修改任何产品代码。发现的所有缺陷仅记录不修复。
- 唯一写入文件：本文件 `REVIEW.md`。未改写或删除本 run 目录下任何已封存文件
  （`RUN.md` / `ENVIRONMENT.md` / `gates/*`）。
- 所有 gate 均为本人亲自执行。未亲自执行的部分（C04-C07 Rust gates、C12-C14 桌面 E2E）
  已在 §2 明确标注「未验证」。
- 未复现 M1 Q1 类型缺陷；本轮 15 条断言经交叉验证确认真实求值。

**本复核不批准 Go。**
