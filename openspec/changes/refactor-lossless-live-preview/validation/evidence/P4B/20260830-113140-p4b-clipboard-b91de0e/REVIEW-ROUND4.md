# REVIEW-ROUND4 — P4B 独立 Reviewer-2 第 4 轮复核

**复核对象**：`c4112ae`（B-4 处置）+ `b5ea7ee`（P4B.md 过期陈述清理）
**复核人**：独立 Reviewer-2（p4b-reviewer2）
**时间**：2026-08-30
**性质**：只复核 team-lead 提出的四项，**不重跑全量审查**。
**声明**：本文件为**新建**文件，未改写本 run 目录内任何已存在文件。

---

## 0. 复核身份与复跑记录

| # | 命令 | 结果 |
| --- | --- | --- |
| R1 | `git rev-parse --short HEAD` | `b5ea7ee` |
| R2 | `git log --oneline c4112ae..HEAD` | `b5ea7ee docs: 清理 P4B.md 三处过期陈述与标题正文矛盾` |
| R3 | `git show --name-status b5ea7ee` | 仅 `M openspec/.../validation/phases/P4B.md`（+21/-6），**未触碰 evidence/** |
| R4 | `git diff --name-only b50e392 HEAD -- src src-tauri markflow-core` | **0 个文件**（产品源码零改动仍成立） |
| R5 | `bash scripts/check-evidence-immutable.sh $(git merge-base main HEAD) HEAD` | **EXIT=0** |
| R6 | `cat …/20260830-134007-p4b-acceptance-full-b1e4c05/run.exit` | `EXIT=0` |
| R7 | `run.log` 统计 `failing` / `Error` / `timed out` | **0 / 0 / 0**；`Spec Files: 3 passed, 3 total (100%) in 00:01:33` |
| R8 | 护栏 `ALLOWED_COMMITS` 条目数 / `e653ec6` 命中数 | **11 条** / **0** |
| R9 | 7 条新登记的 `git show --name-status` | **全部为 `M`**（无一为 `A`/`D`） |
| R10 | evidence run 目录总数 / 缺 `RUN.md` / 缺 `ENVIRONMENT.md` | **58** / **5** / **8** |
| R11 | `C20-e2e-acceptance.log` 失败模式 | `2 passing`，`13 failing`，**13 条全部**指向 `p2-acceptance.e2e.mjs:67` |
| R12 | `grep -n "beforeEach\|afterEach\|dialog\|discard\|losslessDirty" e2e/specs/lossless/p2-acceptance.e2e.mjs` | **0 命中** |
| R13 | `diff -q` 归档 `specs/` 5 文件 vs `/tmp/p4b-acc` | **5/5 一致** |
| R14 | `env NODE_OPTIONS= npx openspec validate --strict` | **未完成**：前台 120s 被 SIGTERM（137），转后台后 11m38s 仍无输出、无退出。**判定为环境/工具链挂起，不作为本变更的缺陷信号**，本轮不据此下任何结论。 |

**与执行流自述的两处数字差异**（均不影响结论，登记为 M-2）：
执行流写「全仓库 **61** 个 evidence run 目录」，我实测 **58** 个；
但「缺 `RUN.md` 5 个 / 缺 `ENVIRONMENT.md` 8 个」两个数字**完全准确**，
且缺 `RUN.md` 的 5 个目录名单与执行流所列逐字一致。

---

## 1. 问题一：B-4 三项登记动作是否闭合？

**结论：闭合。B-4 解除阻断。**

| # | 我的要求 | 独立核验 | 判定 |
| --- | --- | --- | --- |
| ① | 补登记「改后 spec 的重跑」+ 撤销混淆对比的根因结论 | 新 run `20260830-134007-p4b-acceptance-full-b1e4c05` 已落地并归档（`RUN.md` / `ENVIRONMENT.md` / `run.log` / `run.exit` / `specs/` 5 文件 / `shots/` 35 文件）；P4B.md:494、:558 已把混淆对比标注为「不再作为根因依据」 | **已闭合** |
| ② | 两行 accept 场景收紧为「composition 提交**后**单次 Cmd+Z 还原」 | P4B.md:495-500 已收紧，并交叉引用 P6 open item ① | **已闭合** |
| ③ | 新增 P6 open item：`composing` 仅在 `compositionend` 复位 | P4B.md「交 P6 的 open items」① 已登记，含 `@codemirror/view` 逐行位置表 | **已闭合** |
| ＋ | （执行流自选）重跑三 spec 全量 | `run.exit` = `EXIT=0`；13/13 ✓；1m33s；`failing`/`Error`/`timed out` 均为 0 | **已闭合** |

**我对该 run 的独立复核（不采信执行流自述）**：

- `run.log` 头部 `Execution of 3 workers started at 2026-08-30T05:41:22.340Z`，
  与 `run.exit` mtime 13:42、findings 13:44 自洽。
- 13 条 ✓ 用例标题逐条提取，覆盖 clipboard 4 / editing 4 / visual 5，与 `RUN.md` 的分 spec 表一致。
- 三项曾失败用例的取值全部落在通过侧（与执行流表格一致，我逐字段复核过）：
  `item2.typing.composingAfterTyping.composing = true`、
  `hidCommit.posted = ["Return"]`、`composingAfterCommit.composing = false`、
  `singleUndoRestoredBytes = true`、`item3.fallbackEditable = true`、
  `item3.restoredByUndo = true`、`item3.saveResult = "saved"`、
  `item3.recovered.projectionState = "rendered"`、
  `item6.flagOn.sourceUnchanged = true`、`scriptExecuted = false`。
- **同口径性成立**：本 run 与 12:10:24 那次失败的全量 run 同为「三 spec 同进程、同顺序」，
  唯一变量是 spec/lib 的修复。这正是 B-4 要求的 unconfounded 对照。

**「是否要求重跑」的口径**：已统一为「不需要 P6/P7 补跑」（P4B.md:612-615），
与执行流此前消息里「要求 P6/P7 复现全量 run 才算闭合」的矛盾**已消除**。我接受该统一。

### 1.1 遗留的登记不一致（M-1，低，非阻断）

`b5ea7ee` 的提交说明自己指出「改了一处忘了另一处」在本项目已重复三次（F-1 / N-1 / 本条），
并写下了「关闭缺口的提交必须同提交内删除对应缺口陈述」的建议。**这条建议在本次处置中未被 self-apply**：

- P4B.md:562「决定」段仍写 `blocker B-1/B-2 已由执行流处置完毕`，**未提 B-3 / B-4**；
- P4B.md:570 签署表「独立 Reviewer」行仍写「Round 3：B-1/B-2/B-3 已闭合，**新增 B-4（高）**」，
  **未反映 B-4 已闭合**。

即：B-4 已在 §B-4 小节内闭合，但它上方的两处汇总仍然过期。
PO 若只读汇总，会读到一个已不存在的 blocker——与 `b5ea7ee` 修复的三处是同一形态。
**建议在下一提交内刷新这两处**，不构成 blocker。

---

## 2. 问题二：更正 A（item 6 机制）是否接受？Round 3 的「disfavoured」是否撤下？

### 2.1 接受更正 A，并且我认为它的证据等级可以再上调一档

执行流给自己的诚实边界是「机制来自代码自证，**不是受控 A/B 证明**」。
我复核时发现的那个反例（我 Round 4 中途卡住的点）现在被解掉了，因此这个边界可以收窄。

**反例**：归档 spec 3 里 item 5 以 `hidKeys('cmd+z')` 收尾，且 `item5.undoRestored = true`
在**新旧两次 run 中都为 true**——也就是说字节确实被还原了。若按「item 5 把文档改脏」的朴素读法，
item 5 结束时文档应当已经干净，item 6 不该被弹窗挡住。**这与更正 A 的因果链表面矛盾。**

**解开反例的产品代码事实**：

| 位置 | 内容 | 含义 |
| --- | --- | --- |
| `src/lib/editor.state.ts:45-53` | `dirty is revision-driven (userRevision > persistedRevision)` | dirty 是**修订号**关系，不是内容比对 |
| `src/lib/editor.state.ts:26` | `'userTransaction' // real user document edit (typing, paste, commands, **undo**…)` | **undo 被归类为用户事务** |
| `src/lib/editor.state.ts:137` | `bumpRevision() { return ++documentState.userRevision; }` | 用户事务**递增** userRevision |
| `src/lib/editor.state.ts:196-201` `resetDocumentRevision()` | 两个计数器归零 | 仅**重新打开文档（hydration）**时清零 |
| `src/lib/editor.state.ts:209-218` `markDocumentPersistedRevision()` | `persistedRevision = userRevision` | 仅**保存**时清零 |
| `src/lib/lossless/registry.ts:32-36` `activeLosslessDirty()` | `return activeBinding.isDirty()` | Lossless Core 路径同样**没有 undo 递减路径** |

**推论**：item 5 末尾那次 Cmd+Z **还原了字节，但它是 userTransaction，会继续递增 userRevision**。
全代码库不存在「undo 让 dirty 变 false」的路径。因此 `dirty` 在 item 5 结束时**仍为 true**。
于是：

```
item5 Tab 遍历 + Space 切换（dirty=true）
  → item5 末尾 cmd+z 还原字节（undoRestored=true）但 dirty 仍为 true
  → item6 openDoc('p4b-policy-html.md')
  → confirmDocumentTransition()（src/components/sidebar.fileops.ts:69-103）见 dirty=true → 弹「未保存的更改」
  → 文件树点击被弹窗挡住 → activeFilePath 不变 → 15s waitUntil 超时
```

这解释了「为什么两次 run 的 `undoRestored` 都是 true，却只有新 run 过」——
`lib.mjs` 里 `isDirty() → save(false) → waitUntil(isDirty() === false)` **正是唯一能清 dirty 的动作**，
它是**起作用的修复**，不是防御性摆设。

**因此我把更正 A 的证据等级从「代码自证」上调为「机制能预测一个否则自相矛盾的观测」**。
仍然不是受控 A/B（spec 3 的改动内容无法 diff，harness 在 `/tmp` 且未纳入版本控制），
但已不是单纯的注释吻合。

### 2.2 撤下「disfavoured」——但方向和执行流相反

执行流在 P4B.md:430-432 把结论改成：

> 本项已有独立且自洽的机制解释，**不再作为 C20 的旁证使用**。

**我认为这个方向过于保守，且丢掉了本次最有价值的一条线索。**
我 Round 3 的「disfavoured（同源未证实）」应当撤下，但不是改成「不作为旁证」，
而是改成「**同源的可能性已由『未证实』升为『高度可能』**」。

### 2.3 新发现 N-13（高，非 substrate blocker，但是 C21 裁决的前置输入）

我调取了 `20260830-113140-p4b-clipboard-b91de0e/gates/C20-e2e-acceptance.log`（EXIT=1，304 行），
逐条核了 C20 的 13 failing。**它们与 item 6 是同一条故障链，证据如下**。

**（1）失败位置完全一致**

13 条 `Error` 全部是 `Expected active document to be <file>`，且栈帧**全部**是：

```
at async openFileAndWaitActive (e2e/specs/lossless/p2-acceptance.e2e.mjs:67:7)
at async openFreshConstructs   (e2e/specs/lossless/p2-acceptance.e2e.mjs:186:3)
```

`:67` 就是那个 `waitUntil(activeFilePath.endsWith('/'+name), {timeout: 8_000, timeoutMsg: 'Expected active document to be ${name}'})`。
**13 条无一例外，全部死在「点文件树后 activeFilePath 没变」这一步**——与 item 6 的判据逐字相同。

**（2）失败是级联且连续的，不是随机的**

```
✓ P2-1 semantic decorations render
✓ P2-2 marker area editable — typing inside a marker lands there
✖ P2-3  ← 第一个失败
✖ P2-4 … P2-9
✖ P1B-1/2、P1B-3、P1B-4、P1B-5、P1B-8、P1B-10   （共 13 条，一路到底）
```

2 passing / 13 failing，`Spec Files: 0 passed, 1 failed, 1 total in 00:05:42`。
**没有任何一条失败出现在 P2-2 之前，也没有任何一条在 P2-3 之后恢复**——
这是「某个状态被置位后再也没被清除」的级联特征，不是 per-test 随机 flaky。

**（3）弄脏文档的那一步，正好卡在最后一个通过用例上**

- P2-1（`:198`）只做只读断言，不脏。
- P2-2（`:292`）`openFreshConstructs('marker')` 成功打开（说明此时文档仍干净），
  随后 `losslessType('X')`（`:304`）**把文档改脏**，用例通过，**没有收尾**。
- P2-3（`:329`）`openFreshConstructs('copy')` → `openFileAndWaitActive` **失败**。

**（4）该 spec 完全没有 dirty 清理，也没有弹窗处理**

`grep -n "beforeEach\|afterEach\|dialog\|discard\|losslessDirty" e2e/specs/lossless/p2-acceptance.e2e.mjs`
→ **0 命中**。既没有 `before/afterEach` 清理，也没有 `data-dialog` 弹窗点按。
（我 Round 3 记录里「P1B-8 显式点 `[data-dialog-value="discard"]`」一条**是我记错，予以撤回**；
该文件里不存在任何弹窗处理代码。）

**（5）耗时与「3 次重试 × 8s」吻合**

`openFileAndWaitActive` 是 `for attempt < 3` + `timeout: 8_000`。
13 × 3 × 8s = **312s**；总耗时 5m41.9s = **341.9s**；余 30s 给 2 个通过用例。
**吻合度很高**，说明 13 条失败都耗尽了 3 次重试——重试一个被弹窗挡住的点击当然没用。

**（6）结论与影响**

> C20 的 13 failing 极可能**不是 13 个产品回归，而是 1 个 harness 缺陷**，
> 且与 item 6 是**同一个**缺陷：前一个用例把文档改脏且不清理，
> 后一个用例的文件树打开被「未保存更改」弹窗挡住。

这个方向是**有利于产品的**，但它会直接改变 PO 对 **C21（acceptance 套件如何处置）**的判读：
现行 P4B.md 把 C20 当作「仓库内 e2e 套件的 13 failing」并在「套件腐烂 vs flaky」之间二选一/三选一，
而如果这 13 条是同一个可修的 harness 缺陷，「腐烂」这个定性本身就需要重新审视。

**处置建议（低成本、决定性）**：把 `lib.mjs` 里已验证有效的那段守卫搬进
`e2e/specs/lossless/p2-acceptance.e2e.mjs` 的 `openFileAndWaitActive`（`isDirty()` → `save(false)` →
`waitUntil(isDirty() === false)`），重跑 C20。**若 13 → 0，即为证实。**
在跑出来之前，本节按「高度可能，未证实」定级，不写成定论。

**为什么不算 substrate blocker**：P4B 的 substrate 结论由 `20260830-134007-*` 的 13/13 独立支撑，
不依赖 C20。N-13 影响的是 **C21 的 PO 裁决输入**，因此我登记为高优先级披露项，
而不新增 blocker。

---

## 3. 问题三：更正 B 的告警降级是否接受？有无更好方案？

### 3.1 接受「不能设为全局阻断」这一半

我提的「新 run 必须同时含 `RUN.md` 与 `ENVIRONMENT.md」是零误报不变量」——**这一条被证伪，我接受**。
我独立复核了欠账（R10）：58 个 run 目录里 **5 个缺 `RUN.md`、8 个缺 `ENVIRONMENT.md`**，
其中 `20260830-122241-p4b-human-acceptance-1f1bd3c`（缺两个）**确实落在当前 PR 区间内**。
设为阻断会让 CI 当场飘红。降级为告警的**动机**成立，我不反对。

### 3.2 但降级把牙齿全丢了，我给一个零误报的替代方案：**按创建提交划线（grandfathering）**

降级后规则 2 对**任何人、任何新 run** 都只剩一行告警，等于没有约束力。
问题从来不是「规则错了」，而是「**历史欠账**」——这两件事可以用一个提交常量分开：

```bash
# 新增一个常量：早于此提交的 run 目录属历史欠账（告警），此后一律阻断
ENFORCE_SINCE="c4112ae"   # 建议值见下
```

规则 2 改为：

```
新建 run 目录 C：
  若 C 是 ENFORCE_SINCE 的祖先（含自身） → ⚠️ 告警（历史欠账，grandfathered）
  否则                                  → ❌ VIOLATION，EXIT=2
```

**这个方案的性质**：

- **零误报**：不需要补历史、不需要回滚（回滚即第二次篡改），一次性划断。
- **单调递增**：只需一个提交号常量，不需要维护「已知欠账目录清单」。
  目录清单方案要随每次补齐而编辑，且编辑脚本本身又要走评审；划线方案不需要。
- **不逼迫执行流违规**：执行流想新建一个缺 `ENVIRONMENT.md` 的 run 时，
  正确做法本来就是**新建 corrective run 目录并在其 `RUN.md` 里链回旧 run**——
  协议允许，且不触碰旧证据。划线方案惩罚的正是「不这么做」的情形。
- **牙齿是真的**：划线之后任何新增的不完整 run 都会让 CI 飘红。

**`ENFORCE_SINCE` 取值建议（两步走）**：

1. **现在**：设为 `c4112ae`（或 HEAD），CI 保持绿。
2. **合并前**：把当前 PR 区间内唯一的那条欠账 `20260830-122241-p4b-human-acceptance-1f1bd3c`
   用**新建 corrective run**（含 `RUN.md` + `ENVIRONMENT.md` + 上游链接）的方式补上，
   然后把 `ENFORCE_SINCE` 提到本 PR 的 `merge-base`。
   注意：**不能用「就地补两个文件到旧目录」的方式**——规则 3 会把迟到的 `RUN.md` /
   `ENVIRONMENT.md` 判为告警（脚本 `:138-139` 明确覆盖），等于绕过去了。

**我不为 3.2 单独提 blocker**：B-4 的闭合 run `20260830-134007-*` 已同时含
`RUN.md` 与 `ENVIRONMENT.md`（我核过两份文件的开头，质量合格），
且它在证据链上已取代 `122241/` 的 accept 出处。旧目录的不完整属于文档欠账。
但**方案本身建议在合入前落地**，否则规则 2 形同虚设。

### 3.3 更正 C（护栏）的独立复核

- 7 条新登记全部 `git show --name-status` 复核为 **`M`**，目录与行数与 allowlist 注释一致（R9）。
- `e653ec6` 已从 `ALLOWED_COMMITS` 移除（R8 = 0 命中）。我核了它的形态：
  护栏仍把它打印在**新增文件告警**里（`P1B/…/e2e/e2e-lossless-afterfix.log`），
  即它现在被正确判为 `A`（规则 3 放行类）而非 `M`。**撤回正确。**
- 全量扫描 `bash scripts/check-evidence-immutable.sh $(git merge-base main HEAD) HEAD` → **EXIT=0**（R5），
  输出含 11 条已登记违规（保持可见）、10 条新增告警、2 条 archive 搬迁。
- 执行流说「3 个护栏 bug 已修、7 例反向测试通过」。我未逐例复跑反向测试
  （那需要构造 7 个 scratch 提交），但我核了修复点在脚本里的落地：
  字段右移（`:316-335` 的 `IFS='|'` 解析与 `%s|%s|%s\n` 输出列数一致）、
  archive 搬迁（`:99-112` `extract_run_dir()` 按 evidence 相对后缀取 `<PHASE>/<RUN-ID>`）、
  manifest 排除。EXIT=0 且输出结构正确，我接受。

---

## 4. 问题四：除 B-4 外是否还有新的 blocker？

**没有新的 blocker。**

| Blocker | 状态 |
| --- | --- |
| B-1（N-1 登记 + 机械护栏） | 已闭合（Round 3） |
| B-2（C21 归因失真） | 已闭合（Round 3） |
| B-3（raw HTML 安全/资源 owner 签字） | **未闭合** —— 执行流无权代签、也未自行放宽，已记为 `NO-GO（默认）` 保持 source fallback。等待 PO / 安全 owner。这是**保守方向**，我认可该处置。 |
| B-4（人工验收签署的可采信性） | **本轮闭合** |

新增问题按严重度：

| 编号 | 严重度 | 内容 |
| --- | --- | --- |
| **N-13** | **高** | C20 的 13 failing 与 item 6 极可能同源（未保存更改弹窗挡住文件树打开）。**撤下我 Round 3 的「disfavoured」**，改为更高可能性的同源判定。非 substrate blocker，但**必须在 PO 裁决 C21 之前披露**。建议用「给 `openFileAndWaitActive` 加同一段 dirty 守卫再跑 C20」做决定性验证。 |
| M-1 | 低 | P4B.md:562 / :570 两处汇总未随 B-4 闭合刷新（同一处「改了一处忘了另一处」形态，正是 `b5ea7ee` 自己刚修的三处）。 |
| M-2 | 低 | P4B.md:276「61 个 run 目录」应为 **58**。缺 `RUN.md` 5 / 缺 `ENVIRONMENT.md` 8 两个数字准确。 |

---

## 5. 结论

**判定：PASS WITH CONDITIONS**（与 Round 3 同级；blocker 由 B-1/B-2/B-3/B-4 减为 B-3 一项）。

- **Substrate 技术结论可信**：`20260830-134007-p4b-acceptance-full-b1e4c05` 提供了
  与失败全量 run 同口径、单变量的通过证据（EXIT=0、13/13、1m33s），
  且产品源码在 `b50e392..HEAD` 区间内零改动。B-4 要求的「重跑」这条路已真正走通。
- **item 6 定性已澄清且比执行流的自评更硬**：不是 flaky、不是环境风险，是 harness 缺陷，
  且我能用 `dirty` 的修订号语义解释「undoRestored=true 却仍失败」这个表面反例。
- **C20 的定性需要更新（N-13）**：13 failing 极可能是 1 个与 item 6 相同的 harness 缺陷。
  这一条对 PO 的 C21 裁决是实质性输入，且方向对产品有利。**请勿让 PO 在不知情的情况下裁决 C21。**
- **护栏已具备阻断能力（`R5` EXIT=0），但规则 2 目前只是建议**。建议按 §3.2 的
  `ENFORCE_SINCE` 划线方案恢复其约束力——零误报、不需回滚、不需维护欠账清单。
- **B-3 仍开**：`P4B-ITEM-rawHtmlPolicy-GO` 缺安全/资源 owner 签字。
  默认 `NO-GO 保持 source fallback` 是保守方向，不阻塞其余三项。
- **未验证项（声明）**：`npx openspec validate --strict` 本轮**没能跑出结果**（R14），
  因此本轮结论**不包含** openspec 结构校验这一维度。若 PO 需要该项，请另行安排一次能跑通的执行。
  我不把「跑不出来」当成通过，也不当成失败。
- **环境观察（非本轮结论）**：仓库工作区另有一个非本 Reviewer 产生的未跟踪文件
  `validation/GOAL-executor-typora-complete.md`。我未改动它，也未将它加入索引，仅在此登记。

**本 Reviewer 不批准最终 Go。**

按治理要求，P4B 的 Go 须由 **实现（AI gate）+ 独立 Reviewer + 人工验收 + Program Owner**
四者齐备后由主会话记录；执行流不自我批准。本轮我只解除 B-4，不签署最终 Go。

---

## 6. 副作用声明

本轮为**只读复核 + 新建一份报告**，未改写本 run 目录内任何已存在文件，
未修改 `src/`、`src-tauri/`、`markflow-core/`、`e2e/**`、护栏脚本与阶段文档。
唯一新建产物：本文件 `REVIEW-ROUND4.md`。
临时文件写在 `/tmp`（`r4-guard.txt`、`r4-os.txt`），不入库。
