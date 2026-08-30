# Independent Review — Round 2（复核轮）· P4B corrective run #2

| Field | Value |
| --- | --- |
| Reviewer 角色 | 独立 Reviewer（复核轮），**未参与实现、未参与本轮执行、未参与人工验收** |
| 被复核 run | `20260830-113140-p4b-clipboard-b91de0e`（候选 commit `b91de0e`） |
| 复核时 HEAD | `949419bc147be8f834cd1baabee235861a362055`（`949419b`） |
| 基线 | `b50e392` |
| Supersedes | `../20260830-102354-p4b-ime-7869de8`（其上 REVIEW.md 为本轮前任所写，含 F-1..F-10） |
| 复核时间 | 2026-08-30 12:31–12:44 CST |
| 本轮性质 | **复核，不是 corrective** —— 故不新建 run-id，本报告落在被复核 run 目录内 |
| Protocol | `validation/VALIDATION-PROTOCOL.md` §6 / §7；`GOAL-executor-typora-complete.md` §2.6 / §2.8 |
| Verdict | **PASS WITH CONDITIONS**（3 项阻断条件；见第 6 节） |

> **本 Reviewer 不批准最终 Go。**
> `P4B-SUBSTRATE-GO` 与各 `P4B-ITEM-*-GO/NO-GO` 必须由主会话在
> 「实现 + 独立 Reviewer + 人工验收 + Program Owner」四者齐备后记录。

**副作用声明**：本报告是本次复核新建的唯一文件。未修改 `src/`、`src-tauri/`、`markflow-core/`、
`e2e/**`、`tasks.md`、任何既有 `RUN.md` / `ENVIRONMENT.md` / `REVIEW.md` / `gates/**`，
也未修改 `validation/phases/**`、`validation/issues/**`。仅读取。所有命令为只读或测试命令；
测试命令只写入 gitignore 的 `e2e/artifacts/` 与临时目录。

---

## 1. Identity：亲自重跑的命令与退出码

| # | 命令 | 结果 | 退出码 |
| --- | --- | --- | --- |
| R1 | `git diff --stat b50e392 HEAD -- src src-tauri markflow-core` | **输出为空**（0 行） | 0 |
| R2 | `env NODE_OPTIONS= npx vitest run --config vitest.config.ts src/lib/lossless` | `Test Files 16 passed (16)` / `Tests 433 passed (433)` | **0** |
| R3 | `env NODE_OPTIONS= npm test` | `Test Files 51 passed (51)` / `Tests 845 passed (845)` | **0** |
| R4 | `env NODE_OPTIONS= npx tsc --noEmit` | 输出 0 字节 | **0** |
| R5 | `env NODE_OPTIONS= npm run test:byte-contract` | L0 `24+/23-`、L1 `95+/93-`、`"ok": true`、`failed: []` | **0** |
| R6 | `env NODE_OPTIONS= npx openspec validate refactor-lossless-live-preview --strict` | `Change 'refactor-lossless-live-preview' is valid` | **0** |
| R7 | `env NODE_OPTIONS= npx openspec validate --all` | `Totals: 61 passed, 0 failed (61 items)` | **0** |
| R8 | `bash scripts/check-archive-synced.sh` | `OK: all archived delta specs (on/after 2026-07-21) are synced to main specs` | **0** |
| R9 | `git diff --check b50e392 HEAD` | 见 §5-N-2（**不止 C21 记录的那一条**） | 2 |
| R10 | `shasum -a 256 ENVIRONMENT.md` | `9e413755fffdfd07de3c52661df4d5b76b2e61b44b27729ff2357ee5c65b5a03` | 与 RUN.md 记录**一致** |
| R11 | 重算 `git diff --no-color --no-ext-diff b50e392 b91de0e -- . ':(exclude).../validation' \| shasum -a 256` | `3152d359a7fc59fca420f14e87d97097720bcb4e324f1ca8a30ccefef57885af` | 与 ENVIRONMENT.md 记录**一致** |
| R12 | `git log --oneline -- <各 run 目录>` | 见 §5-N-1 | 0 |
| R13 | `printf <fence source> \| shasum -a 256` | `faeda8aef88be91e9b6ddf84ebab258235ef78c36d296a7dbcf61d3e70b2b1b4`，长度 **51** | 与人工验收记录**一致** |

**未重跑**：桌面套件（`node e2e/run.mjs *`）。理由：C15–C19 的日志内部时间戳、用例名与计数已逐项
核对一致（详见 §3），且本轮复核的重点是证据链与断言强度；重跑会抢占前台 2–6 分钟而边际收益低。
**我认为现有桌面证据可信**，故未触发重跑。

**核心事实 R1 已独立验证**：`git diff --stat b50e392 HEAD -- src src-tauri markflow-core`
输出为空 —— 「产品源码零改动」对当前 HEAD `949419b` 依然成立。

---

## 2. F-1..F-10 逐条闭合判定

| ID | 前任结论 | 本轮判定 | 依据 |
| --- | --- | --- | --- |
| **F-1** 历史 run `083435` 被 `7869de8` 回写 ｜Process｜高 | Go 阻断 | **closed**（登记完整且准确） | 见 Q1 |
| **F-2** 本 run hygiene 声明与事实不符 ｜Process｜中 | Go 阻断 | **closed**（但闭合方式本身构成 N-1） | 见 Q1 / N-1 |
| **F-3** P4B.md 低估 clipboard 覆盖 ｜中 | 已由 `cce1a55` 修正 | **closed** | `P4B.md:181-196` 已列出 `p4b-widgets.e2e.mjs:199` / `:233` 两条实存断言 |
| **F-4** 选区 copy/cut pasteboard 载荷缺口 ｜中 | 部分闭合 | **closed（带明确范围限定）** | 见 Q2 |
| **F-5** per-item 缺独立 RUN 记录 ｜中 | 未闭合 | **closed** | `phases/P4B-{task-checkbox,code-fence-controls,frontmatter,raw-html}.md` 四份已落盘，各自含 maturity/default/fallback/已知缺口/裁决表 |
| **F-6** `080554` 未封存 ｜中低 | 已封存 | **closed** | `git log -- .../080554/` 仅 `b50e392`（建）+ `cce1a55`（封存为 SUPERSEDED） |
| **F-7** C19 检查范围过窄 ｜低 | 建议 | **partially-closed** | 已改为候选范围（C21），但该范围**结构性看不到本 run 自身产物** —— 见 N-2 |
| **F-8** `.exit` 格式不一致 ｜低 | 建议 | **closed** | 实测 21 个 `.exit` 全为 1 字节纯数字（C20=1、C21=2，其余 0） |
| **F-9** 日文「右方向键」叙述与 git 历史不符 ｜低 | 建议 | **closed** | `102354/RUN.md` 与 `P4B.md:44-48` 均已更正为「从未发送确认键」 |
| **F-10** `lossless-acceptance` 无 gate ｜低 | 建议 | **closed（取「显式声明不在范围内」分支）** | `issues/20260830-p4b-lossless-acceptance-suite-rotted.md` 已落盘并三次取证；代价（P2-3 等 15 条无回归保护）已如实登记 |

---

## 3. 对 21 个 gate 的独立核对

- **退出码**：`for f in gates/*.exit` 逐个读取 —— C01–C19 全 `0`，C20=`1`，C21=`2`。与 RUN.md 表**逐行一致**。
- **日志内部时间戳（用于 Q4）**：`C01-focused-unit.log` 尾部 `Start at 11:35:38 / Duration 3.41s`；
  `C02-npm-test.log` 尾部 `Start at 11:35:42 / Duration 12.17s`。与 RUN.md「Started 11:35:38」**吻合**。
- **C08 计数（用于 Q5）**：`gates/C08-core-test.log` 的 `test result:` 行为
  `40 / 18 / 4 / 3 / 17 / 8 / 6 / 0`（7 target + doc-tests）= **96**，与 RUN.md 的「96」一致。
- **C15 用例名**：从日志逐条抽取共 **30 条 ✓**，含两条新增
  `selection copy on the rendered surface yields exact Markdown source, not DOM text` 与
  `selection cut payload is source, removes the range, and one Undo restores bytes`。与「30 passing，较上一 run +2」一致。
- **C16/C18 的 skipped**：`C16` 尾 `Spec Files: 1 passed, 5 skipped, 6 total` 且 `5 passing` ——
  skipped 在 **Spec Files** 层级（聚合入口的 5 个模块顶层零测试），测试层 0 skipped。
  `C18` 同构（`1 skipped, 2 total`，`4 passing`）。RUN.md:61-63 的口径**准确**。
- **我独立复现的计数**：R2 = 433、R3 = 845、R5 = L0 24/23 + L1 95/93 —— 与 C01/C02/C10 完全一致。

---

## 4. 七个问题的回答

### Q1. F-1 是否真闭合？不回滚是否可接受？登记是否完整？

**结论：登记完整且经我独立核实；「不回滚」可接受；但闭合方式在 F-2 上衍生了 N-1。**

**(a) 改动清单登记是否完整 —— 完整，且我用 `git show 7869de8` 逐项复现：**

```
.../20260830-083435-p4b-corrective-a8c73de/RUN.md            |  49 ++++--
.../gates/C04-build.log                                      | 166 +++---
.../gates/C14-e2e-build.log                                  |  56 ++---
.../gates/C15-e2e-lossless.log                               |  26 ++--
.../gates/C15-rerun1.log                                     |  16 +-
.../gates/C16-e2e-smoke.log                                  |  26 ++--
.../gates/C17-e2e-regression.log                             |  26 ++--
.../gates/C18-e2e-p0s.log                                    |  26 ++--
.../gates/C19-diff-check.log                                 |   4 +
.../gates/C20-e2e-ime.log                                    | 140 +++++
10 files changed, 329 insertions(+), 206 deletions(-)
```

前任 Reviewer 列的五项（状态行 / C20 gate 行 / hygiene 段落 / 8 个被覆盖的 gate 日志 / 新增
`C20-e2e-ime.log`）**逐项命中**。且 `RUN.md` 的 diff 里我亲眼看到：
标题 `Corrective Run` → `Corrective Run/IME`、状态行 `19/19` → `20/20`、新增 C20 行、
`## Run hygiene note (two discarded runs)` 整段被替换为 `## Real IME evidence (C20)` +
改写版 hygiene note。P4B.md:117-142 的登记**与 git 事实一致，无遗漏、无淡化**。

**(b) 不回滚是否可接受 —— 可接受，且是唯一正确解。**
回滚（`git revert` 或重写历史）既是对 `083435` 的**第二次写入**（F-1 明令禁止），
又会重写已发布的 commit 历史，代价远大于收益。前任的定性我也认同：改动方向是「补记一个缺口」
（`083435/RUN.md` 现在把日文记为 product gap 而非通过），**不是把失败伪装成通过**。
「登记 + 新建 corrective run 前向链接」是协议 §2.6 要求的正解，执行流做到了。

**(c) 但闭合过程本身制造了 N-1（见 §5）**：
F-2 的闭合方式是**就地改写已封存的 `102354/RUN.md`**（commit `4ed51b9`，+25/-3），
即重复了 F-1 所谴责的同一类行为，且发生在 P4B.md:141-142 写下「corrective run 的目录一旦建立，
后续任何提交都不得再触碰它」这条教训的**同一份文档所描述的同一次 corrective 中**。
需说明的是：前任 Reviewer 的 F-2 条件原文是「修正被复核 RUN.md…的不实陈述」——
该措辞**要求了一件协议禁止就地执行的事**，责任并非全在执行流。但执行流选择了就地改写而非
「在新 run 中登记更正」，且 P4B.md:138 把这件事记为「已完成」而**未标为同类违规**，属定性错误。

### Q2. F-4 是否真闭合？新断言强度够不够？

**结论：闭合。断言强度**高于**前任要求，且我已从 CodeMirror 源码层面验证其判别力。
存在一处**前向局限**（不是缺陷），必须在 P6 重新验证。**

我读了 `e2e/specs/lossless/p4b-widgets.e2e.mjs:32-71`（`clipboardRoundTrip`）与
`:256-307`（两条用例），并回溯了 `node_modules/@codemirror/view/dist/index.js` 的真实代码路径。

**(a) `defaultPrevented === true` 是否足以证明是 CodeMirror handler 接管？—— 足以，且有机制级依据。**

```
@codemirror/view/dist/index.js:4531-4545  runHandlers(type, event)
    for (let handler of handlers.handlers) {
        if (event.defaultPrevented) break;
        if (handler(this.view, event)) { event.preventDefault(); break; }   // :4539-4541
    }

:5144-5172  handlers.copy = handlers.cut = (view, event) => {
    if (!hasSelection(view.contentDOM, view.observer.selectionRange)) return false;   // :5150
    let { text, ranges, linewise } = copiedRange(view.state);
    if (!text && !linewise) return false;                                            // :5153
    if (event.type == "cut" && !view.state.readOnly) view.dispatch({changes: ranges, ...});
    let data = brokenClipboardAPI ? null : event.clipboardData;                      // :5162
    if (data) { data.clearData(); data.setData("text/plain", text); return true; }   // :5163-5166
    else      { captureCopy(view, text); return false; }                             // :5168-5170
}
:5121-5142  copiedRange(state) → state.sliceDoc(range.from, range.to)                 // :5125
:4842       brokenClipboardAPI = ie<15 || (ios && webkit_version<604)  → 本环境为 false
```

因此 `defaultPrevented === true` **等价于**「某个 handler 返回了真值」；而对 `copy`/`cut` 而言
返回真值**只有一条路径**——:5166 的 `data` 分支，也就是**对测试自己创建的那个 `DataTransfer`
执行了 `setData("text/plain", copiedRange(...))`**。若走 :5170 的 `captureCopy` 兜底分支
（隐藏 DOM + `execCommand`），返回 `false` → `defaultPrevented` 为 false → 断言失败。
所以该断言**精确排除了兜底路径**，判别力比我预期的更强。

补充排查：MarkFlow 只注册了 `paste` 的 `domEventHandlers`
（`src/lib/lossless/losslessSourceEditor.ts:228-260`），**没有 copy/cut 的自定义 handler**；
全仓 `src/` 亦无 `clipboardOutputFilter`（`copiedRange` 的 `textFilter` facet 为空 → 原文返回）。
故 payload 就是纯粹的 `state.sliceDoc()`。不存在「别的 handler 抢先 preventDefault」的可能。

**(b) 「payload 不含 DOM chrome」能否区分「从 source 取」与「从 DOM 取」？有没有第三条路径？**

- **在 CodeMirror 内部没有第三条路径**：只有 `data.setData`（payload 进我们的 `dt`）与
  `captureCopy`（进系统 pasteboard，我们的 `dt` 为空 → `payload` 为 `''` → `toBe(before)` 失败）。
- **「不含 chrome」这条单独看不够，但用例没只靠它。** 真正的关键断言是
  `expect(copy.payload).toBe(copy.expected)`，其中 `expected = view.state.doc.sliceString(range.from, range.to)`
  （`p4b-widgets.e2e.mjs:54`）。这是把 payload 与**文档切片**做严格相等，而非与 DOM 做不等式。
  `expect(copy.domText).toContain('复制')` + `expect(copy.domText).not.toBe(copy.payload)` 只是**旁证**。
- **存在的第三条路径（前向局限，非本轮缺陷）**：P4B 不输出 `hidden`（`P4B.md:32`），
  因此「`sliceDoc`」与「遍历 DOM 文本节点并剔除 widget 节点」在本阶段**产出完全相同**。
  二者的分歧点恰好是 ADR #5 要保护的场景（marker 隐藏后复制）。**这条断言在 P4B 无法证伪那条路径，
  在 P6 打开 `hidden` 后才能证伪。** 这构成我 Q7 建议的技术根据。

**(c) 有没有断言过强/过弱、或自欺欺人的地方？**

- **没有过强。** 唯一「严格」的点是 `hasSelection` 的异步同步，helper 已用 `waitUntil`（:42-47）处理，
  且失败会 `timeoutMsg` 明确报错，不会静默通过。
- **没有自欺欺人。** 期望值取自 `view.state.doc`，与被测的 payload 来源**不同**
  （payload 经 CodeMirror handler 写入 `DataTransfer`，期望值直接读 doc）。
  唯一同源风险是「doc 本身已被污染」，但用例另有
  `expect((await fixtureBytes(...)).equals(originalBytes)).toBe(true)`（磁盘字节）兜底。
- **有一处被主动识别并修掉的坑值得肯定**：注释 :58-60 指出 CodeMirror 的 `doc` 不可变，
  cut 的 dispatch 会产生新的 `Text`，若沿用 dispatch 前捕获的 `view.state.doc` 引用会读到裁剪前内容。
  代码在 dispatch **之后**重新读 `view.state`（:68）。这正是最容易自欺欺人的地方，作者没踩。
- **一处真实的覆盖边界（已由 per-item 记录自认，不算缺陷）**：两条用例都用
  `p4b-widget-fence.md` 且只开 `codeFenceControls`。`P4B-task-checkbox.md`、`P4B-frontmatter.md`、
  `P4B-raw-html.md` 三份都明确写了「本项区域的选区 copy 仍未闭合，不能因全局缺口关闭就顺手勾掉」。
  **记录是诚实的。**

**(d) cut 用例的还原放 `finally`、断言在 finally 之后 —— 有没有「断言实际没跑」的风险？**

**没有假通过风险。** 逐路径分析：
- `clipboardRoundTrip` 抛错 → `cut` 保持 `undefined` → `expect(cut.ok)` 抛 `TypeError` → 用例**失败**。
- `finally` 内的 `waitUntil`/`saveRestoredSource` 抛错 → 异常向上传播，断言被跳过 → 用例**失败**。
- 断言依赖的 `cut`/`cut.docAfter` 都是在 `browser.execute` 内 **dispatch 之后同步快照**的（:63-68），
  与 finally 的还原动作无关，还原不会篡改已捕获的值。
- 唯一代价是**可观测性**：断言失败时无法区分「文档是否被还原」。可接受。

**F-4 判定：closed。** 前任要求的 4 点（走真实 handler 而非自证 / 补 cut / 新建 run-id /
桌面无法回读则登记人工项）**全部满足**，且系统 pasteboard 那一环已由人工验收真正补上（见 Q6）。

### Q3. 两条 FAIL 的处置是否可接受？

#### C20 `lossless-acceptance`（EXIT=1，13 failing）—— **定性成立，可接受；但对照实验的证据价值被高估（N-4），且拟议根因未验证。**

**支持「不纳为 P4B gate」的三条硬依据，我逐条独立验证：**

1. **import 图**：`e2e/specs/lossless/all-lossless-acceptance.e2e.mjs` 全文只有
   `import { registerP2AcceptanceTests } from './p2-acceptance.e2e.mjs'` —— **不 import**
   `p4b-widgets.e2e.mjs`。故 P4B 新增的两条断言在机械上不可能影响该套件。✓
2. **失败形态单一且自洽**：C20 日志 13 条失败**全部**是 `Expected active document to be <fixture>.md`
   （`p2-acceptance.e2e.mjs:67` 的 `openFileAndWaitActive`）。通过的只有 P2-1、P2-2 ——
   **恰好是两个不切换文档的用例**。这是「文件切换链路坏了」的强一致信号，不是产品功能回归。✓
3. **三次运行 EXIT 均为 1**，且不是逐用例随机红绿（13 / 5 / 13 双峰，issue 已修正 flaky 措辞）。✓

**但有一处高估（N-4）**：issue:26 把「`p4b-widgets.e2e.mjs` 回退到 `b50e392`」称为**对照实验**。
既然该 suite 根本不 import 这个文件（依据 1），这次回退是**零信息量的 null experiment**
——它的 5-vs-13 差异只能来自环境/时序，与被回退的文件无关。结论（非 P4B 引入）仍然正确，
但支撑它的是依据 1 和 2，不是这个对照。issue 把它并列为证据之一是**证据强度的夸大**，建议改写。

**风险是否被低估？—— 部分低估，两处：**

- **(i) 「harness 腐烂」仍是假设，未被验证。** issue:72-81 的拟议根因（P2-2 弄脏文档后
  「未保存变更」对话框挡住切换）**明确标注「待验证，不要当结论用」**，这个对冲是对的。
  但它同时是一条**产品行为假设**——P3 主动引入了未保存变更守卫，切换被挡住可能是**预期行为**，
  也可能是对话框在自动化下无法被 dismiss 的**真缺陷**。在验证之前把它归档为「P2 遗留债」
  有可能把一条真实的可达性问题推到 P7。
  **新增旁证（我本轮发现）**：人工验收的聚合运行 `run.log:164-165,265` 出现过**完全相同的失败形态**
  —— item 2 / item 3 / item 6 全部 `waitUntil condition timed out after 15000ms` @ `openDoc`
  （`/tmp/p4b-acc/lib.mjs:58`）。两套**独立**的 harness（`e2e/page-objects` 与 `/tmp/p4b-acc/lib.mjs`）
  都栽在「切文件后 activeFilePath 不更新」。这说明它是**环境/产品级的复现性危害**，
  不是某一套 harness 独有的腐烂。issue 应补上这条旁证。
- **(ii) 代价可能比登记的更宽。** issue:96 登记「P2-3 及 15 条 P1B/P2 用例无自动化回归保护」。
  看失败清单，其中含 **P1B-1/2（byte-fixture open）、P1B-3（clean Cmd+S 不写）、
  P1B-10（conflict toast 不泄漏正文）** —— 这些正是本 program 最看重的字节与数据安全性质。
  诚实登记了，但 Program Owner 在权衡时应知道**失去的是字节/冲突保护，不只是交互验收**。

#### C21 `git diff --check b50e392 b91de0e`（EXIT=2）—— **「不修 083435 那一条」可接受；但 C21 的归因必须更正后才能交 Program Owner 裁决（N-2）。**

- 我复现：`git diff --check b50e392 b91de0e` 输出**唯一一条**，与 `gates/C21-diff-check-range.log`
  **逐字节一致**。
- 「修它 = 第二次篡改」的推理**正确且自律**：修它必须写入已封存的 `083435` 目录，
  与 F-1 处置原则直接冲突。执行流**拒绝自行选择选项 B** 并把处置权上交，这是正确的治理行为。
- **但归因是错的（N-2）**：RUN.md:117 与 P4B.md:155 称「**F-1 留下的伤疤是可被机器检测的**」，
  暗示这条 FAIL 是 F-1 独有的残留。实测：

  ```
  git ls-tree -r --name-only b91de0e | grep -c 20260830-113140   →  0
  git ls-tree -r --name-only 1f1bd3c | grep -c 20260830-113140   →  44
  ```

  C21 检查的范围以 **b91de0e**（本 run 的**基线与父提交**）为终点，而本 run 目录在**下一个提交
  `1f1bd3c`** 才落盘 —— **C21 在结构上永远看不到本 run 自己的产物**。而本 run 自己的日志
  **大量携带同一缺陷**（`git diff --check b50e392 HEAD`）：

  ```
  .../113140/gates/C01-focused-unit.log:72: new blank line at EOF.
  .../113140/gates/C02-npm-test.log:172:   new blank line at EOF.
  .../113140/gates/C08-core-test.log:145:  new blank line at EOF.
  .../113140/gates/C09-tauri-test.log:180: new blank line at EOF.
  .../113140/gates/C15-e2e-lossless.log:175: new blank line at EOF.
  .../113140/gates/C16-e2e-smoke.log:152:  new blank line at EOF.
  .../113140/gates/C17-e2e-regression.log:140: new blank line at EOF.
  .../113140/gates/C18-e2e-p0s.log:143:     new blank line at EOF.
  .../113140/gates/C19-e2e-ime.log:140:     new blank line at EOF.
  .../113140/gates/C04-build.log / C14 / C15 / C16 / C17 / C18 / C19 / C20: trailing whitespace
  ```

  即：`tee` 式日志捕获**系统性**在文件尾留下空行，`083435` 那条只是**恰好落在 C21 范围内的那一个**。
  **后果**：Program Owner 正被要求在「保持不修（A）/ 授权一次性卫生修复（B）」之间裁决，
  而选项 B 会被理解为「给 F-1 那一条开例外」。真实情况是两个不同的问题被捆成了一条 gate：
  - (a) `083435/C20-e2e-ime.log` —— 在已封存目录内，**确实不可修**。→ 保持 A，正确。
  - (b) 本 run 自己的 9 个日志 —— 属于**当前候选、尚未封存时的产物**，本可在提交前清理，
    但因 C21 看不见而从未被清理；一旦提交又变成「不可回写」。**这是捕获流程的缺陷，不是 F-1 的伤疤。**

  **建议**：更正 C21 的归因；把捕获脚本改为落盘前 strip 尾随空行；把 C21 的口径改为
  「以本 run 提交后的 HEAD 为终点」（即先提交 run，再跑 C21，或把 C21 拆成两个：候选产品 diff +
  本 run 产物自检）。否则**每个后续 run 都会继续制造同一缺陷，并继续把它归因给上一个 run**。

### Q4. 自报的协议偏离，补救是否充分？被中止那次的日志是否残留？

**结论：补救充分且诚实。我用日志内部时间戳独立证实「gates/ 只有一套日志」。**

自查结果：

1. **只有一套日志**：`gates/` 内恰好 21 对（42 个文件），无 `C15-rerun*`、无 `-2`/`.bak` 等重复命名。
2. **决定性证据是日志内部时间戳，不是 mtime**：
   - `C01-focused-unit.log` 尾部 `Start at 11:35:38 / Duration 3.41s`
   - `C02-npm-test.log` 尾部 `Start at 11:35:42 / Duration 12.17s`
   - 二者与 RUN.md「Started 11:35:38」**逐秒吻合**。若 C01/C02 是 11:32:20 那次 sweep 的残留，
     其 `Start at` 必然落在 11:32–11:35:12 区间。
3. **C13 是重跑产物**：被中止那次在 C13 处中断（11:35:12），若 `C13-archive-sync.log` 是残留，
   其 mtime 应在 11:35:12 之前；实测为 **11:38**，是重跑写出的。
4. **ENVIRONMENT.md 早于第一条 gate**：`stat` 实测 mtime **11:35:01**，C01 启动 **11:35:38** ——
   先后顺序**真实成立**。

因此「被中止那次的 C01–C13 日志已被本次重跑整体覆盖，目录内不存在两套日志」**属实**。

**一处未披露的小偏差（N-7）**：ENVIRONMENT.md 正文记录的 `Captured` 是 **11:34:50**，
而文件实际 mtime 是 **11:35:01**，差 11 秒，方向是**把快照时间写得比实际更早**。
不改变「先落环境后跑 gate」的结论（11:35:01 仍早于 11:35:38），但记录值不是实测值，应更正。

**评价**：主动披露 + 中止 + 整体重跑 + 付出约 3 分钟低成本 gate 的代价，是正确的补救。
这是本轮我看到的最值得肯定的治理行为之一。

### Q5. C08 记录错误（96 记成 0）与 flag 门控两条新发现，定性是否准确？

**C08 那条：我独立核实，执行流的陈述完全准确。**

```
$ grep -E "^test result" 102354/gates/C08-core-test.log
test result: ok. 40 passed; ...
test result: ok. 18 passed; ...
test result: ok.  4 passed; ...
test result: ok.  3 passed; ...
test result: ok. 17 passed; ...
test result: ok.  8 passed; ...
test result: ok.  6 passed; ...
test result: ok.  0 passed; ...      ← doc-tests，尾部那一行
40+18+4+3+17+8+6+0 = 96

$ diff <(grep "^test result" 102354/.../C08-core-test.log) <(grep "^test result" 113140/.../C08-core-test.log)
（无输出 —— 逐 target 完全一致）
```

- **总数真是 96** ✓
- **两 run 逐 target 一致** ✓
- **不是回归** ✓
- **是记录缺陷、方向为低估** ✓（`102354/RUN.md:58` 原文：
  `| C08 | Core tests | PASS (0 tests；core 当前无 test target) |`）
- 两日志仅 1 字节之差（7022 vs 7023），差异是：cargo 多线程导致的**用例执行顺序**不同、
  一个计时数字（0.10s → 0.09s）、以及新 run 多出的**一个尾随换行**（即 N-2 那条系统性缺陷）。

**连带发现（N-8）**：`102354/REVIEW.md` §1.2 写的
「C08（core tests）：日志为 `running 0 tests` / `0 passed`，与 RUN.md…一致」**现在已知是错的**
（前任 Reviewer 在同一处犯了与执行流相同的错误：都只读了尾部那行）。该 REVIEW.md 已封存不可改，
于是在证据目录里出现两处互相矛盾的历史记录。执行流选择了「在此登记、不改写历史」，处理正确。

**flag 门控那条：事实成立，但表述过度（N-6）。**

我核实了三处门控确实存在：
`src/lib/lossless/flag.ts:40`、`livePreviewFlag.ts:36`、`cohortFlags.ts:211`（均 `import.meta.env.MODE === 'e2e'`），
且 `cohortFlags.test.ts:185` 有一条单元测试专门断言 `window.__setP4bFlag is NOT exposed outside e2e builds`。
但报告 §3.1「普通 dev/生产构建**没有任何入口**可启用这些项」**不准确**：

```
cohortFlags.ts:75-84  createSwitch():
  if (localStorage.getItem(`markflow.p4b.${name}`) === '1') enabled = true;
```

即**任何构建**（含 release）都可通过 `localStorage['markflow.p4b.<name>']='1'` 打开这 4 项，
只是**没有 UI**。准确表述应是「无 UI 入口，仅 localStorage 手工 opt-in；release 默认不可达」。
方向是**低估可达性**（偏保守），不会误导出危险的批准，但 `P4B.md:92` 沿用了这句
「这 4 项在任何 release 包中不可达」，建议一并更正。

**另一处方向相反的澄清（对报告有利，应补上）**：`livePreviewFlag.ts:10` 是 `let enabled = true`
—— Live Preview 在 release 中**默认开启**（仅 `localStorage` 显式 `'0'` 才关）。
因此人工验收的 item1/2/3（dimmed marker 可发现、方向键逐格、失败后回源码并仍可编辑）
跑在**默认开启的路径上**，这些观察**可以**外推到 release 用户。
报告 §3.1 把 item1–3 与 item4/6 一起笼统套上「release 不可达」的限定，是**过度收缩**。
真正不可外推的只有**需要 P4B flag ON 的** item4（task/fence widget 视觉）与 item6（raw HTML policy）。

### Q6. 人工验收报告的方法学是否站得住？

**结论：主体站得住，且我做了超出报告的独立验证；但有 3 处方法学缺陷（N-3、N-5，及 (b) 的负向对照缺失）。**

我直接读了**未在仓库中归档**的验收脚本源码（`/tmp/p4b-acc/lib.mjs`、
`/tmp/p4b-acc/specs/1-clipboard.e2e.mjs`、`/tmp/p4b-acc/hid.swift`）。

**(a) `pbpaste` 读的是系统 general pasteboard 吗？有没有可能读到脚本自己写进去的？**

**是系统 pasteboard，且脚本从未写入。** 证据：

```js
// lib.mjs
export function pbpasteBytes() {
  return execSync('pbpaste', { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
}
```

- `pbpaste` 是 macOS 系统工具，读 `NSPasteboard.general`，在 **Node 子进程中、应用进程之外**执行。
- 我在 `/tmp/p4b-acc/**` 全量检索 `pbcopy` / `NSPasteboard` / `setString` / `clearContents`
  —— **零命中**。脚本没有任何写剪贴板的能力或动作。
- 按键是真实 HID：`hid.swift` 用 `CGEvent(keyboardEventSource:).post(tap: .cghidEventTap)`
  并带 `.maskCommand`，且**先** `NSRunningApplication.activate(.activateIgnoringOtherApps)`
  并轮询等待 `frontmostApplication.pid == pid`。每次调用都记录了
  `"becameFrontmost": true`（`findings-clipboard.json` 中 6 处全为 true）。
- 时序：`hid.swift` 尾部 `usleep(400_000)` + spec 内 `browser.pause(800)` = **1.2s** 留给应用发布 pasteboard。
- 我独立复算了 `pastedSha256`：`printf 'before\n\n```js title="keep"\nconst x = 1;\n```\n\nafter\n' | shasum -a 256`
  → `faeda8ae...b2b1b4`，长度 51 —— **与报告一致**。

**(b) 这条证据是否真的闭合了「载荷来自 source 而非 DOM」？—— 闭合。**

关键在于**不是一次性读值，而是一串会变化的值**：

| 场景 | pasteboard 内容 | 长度 |
| --- | --- | --- |
| fence 全选 copy | 完整 51 字节 source | 51 |
| cut | 完整 51 字节 source + doc 被清空 | 51 |
| 部分选区（`Cmd+Up` + `Shift+Down×3`） | `before\n\n```js title="keep"\n` = `source[0..27)` | 27 |
| 基线文档全 flag OFF | 另一文档的 source | 各异 |

`clipboard.partial.selection = {from: 0, to: 27}` 与 payload 长度 27 严格对应。
**若 `pbpaste` 读到的是陈旧值，四个场景不可能各自匹配各自的选区。** 三次内容变化构成事实上的
正向对照（liveness proof），比单纯「加一条 sentinel 预设 + 断言变化」弱一点，但已足够。
（改进建议：下一次可加一条「先 `pbcopy` 一个哨兵串，Cmd+C 后断言它已被覆盖」的负向对照，
成本极低，可彻底消除残留疑虑。）

**(c) 部分选区 copy 的 paste 是 source 子串 —— 是否与「来自 DOM」互斥？**

**互斥，可以严格排除。** 同一时刻的 DOM textContent 是
`beforejs复制js```js title="keep"const x = 1;```after`（`findings-clipboard.json` 实测）。
widget chrome `js复制js` 位于 fence 起始处，恰好落在 `[0,27)` 这个选区的 DOM 覆盖范围内。
若载荷取自 DOM（无论 `textContent` 切片还是选区序列化），必然包含 `js` 与 `复制`。
实测 payload = `before\n\n```js title="keep"\n`，**不含** `js复制js`。
spec 里也显式断言了 `expect(pasted.toString('utf8')).not.toContain('复制')`。
→ **DOM 来源被排除，source 来源成立。**

**(d) e2e-only 限定是否充分披露？有没有把 e2e-only 的观察外推成产品结论？**

**披露是充分的（§2 方法学披露 + §3.1 关键机制事实 + §6 still-open 五项 + §8 声明不批准 Go），
且方向与通常风险相反：它是「过度收缩」而不是「偷偷外推」。**

- 证据目录里 `run1.log`/`run2.log`/`run3.log` 的 spec reporter 都能看到
  `» tmp/p4b-acc/specs/...`，脚本位置对读者透明。
- **没有发现外推**。§4.4 视觉明确写「限于 e2e-only flag 场景」并加粗警告；
  `P4B.md:91-93` 复述了同一警告。
- **唯一需要修正的是收缩过度**（见 Q5）：item1/2/3 跑在 release 默认开启的 Live Preview 路径上，
  不应与 item4/6 一起被套上「release 不可达」。

**(e) `conditional-accept` 与 raw HTML 的「技术 accept / 治理 cannot-verify」拆法是否合理？**

**合理，且是这份报告里最专业的一处判断。** 理由：
- 两者要求的证据类型不同：技术行为可用机器判定，治理签字不能由验收代理自证。
- 验收代理**没有**用技术通过去掩盖治理缺失：`findings-visual.json` 实测
  `item6.flagOn.scriptExecuted=false`、`scriptElementsInEditor=0`、`divWithDataX=0`、
  `liveDivs=[]`、`sourceUnchanged=true`（我逐字段读过），同时明确写
  「仓库内检索不到安全/资源负责人的签字或 review 记录 → cannot-verify」。
- 它把**裁决权**而非结论留在了上游：§7 建议「若未补齐，应标记 NO-GO 并保持 source fallback」。
  这是正确的边界——既没有替安全 owner 签字，也没有替 Program Owner 关门。
- 我唯一想补强的是：`P4B-raw-html.md` 自认的 4 条缺口里，**第 4 条（`text/html` payload 的 sanitize
  零覆盖）** 与 ADR #5 / design 05 §7 直接相关，且现有断言只覆盖 `text/plain`。
  这条应在 P6 的 clipboard 合同验收里显式带上（见 Q7）。

**(f) 两处方法学缺陷：**

- **N-3（中）：聚合首次运行有 3 条失败并被重试，报告未披露。**
  归档的 `run.log`（12:10，聚合跑 3 个 spec 文件）显示
  `Spec Files: 1 passed, 2 failed, 3 total`：
  `✖ item 2`、`✖ item 3`（`run.log:164-165`）、`✖ item 6 ... raw HTML stays inert`（`run.log:265`），
  失败原因**全是** `waitUntil condition timed out after 15000ms @ openDoc`。
  随后验收代理**逐个重跑**（`run2.log` 12:18 / `run3.log` 12:21 / `run1.log` 12:22），全部通过，
  归档的 `findings-*.json` 来自**重跑后的成功运行**（时间戳可证）。
  → **数据本身可信**，但 `HUMAN-ACCEPTANCE.md` 与 `P4B.md` **通篇未提这次失败与重试**。
  读者只看报告会以为 9 项一次通过。建议在报告 §2 补一段「首次聚合运行 item2/3/6 因文件切换超时失败，
  已逐个重跑并通过；该超时与本仓 `lossless-acceptance` 套件的失败形态同源，属环境危害」。
  顺带：这条也**独立佐证**了 Q3 关于 C20 的判断（两套 harness 同一症状）。
- **N-5（中低）：验收脚本未随证据归档。** 三份 spec、`lib.mjs`、`hid.swift`、`wdio.conf.mjs`
  全部只存在于 `/tmp/p4b-acc/`（易失目录，重启即失）。证据目录里只有 findings JSON + wdio 日志 + 截图。
  我在复核时它们**恰好还在**，故能验证；但这不可依赖。
  `HUMAN-ACCEPTANCE.md:26` 反而强调「本验收的全部 spec 文件与 helper 均放在 `/tmp/p4b-acc/` 下，
  未改动仓库」—— 「不改仓库」是对的，但**归档到证据目录**同样不改产品代码。建议后续把验收脚本
  一并复制进 run 目录。

### Q7. P4B 与 P6 的剪贴板合同归属（建议，不裁决）

**我的建议：把 `validation/phases/P4B.md:17` 那一行收缩为「底座不得破坏 ADR #5」，
把 clipboard / a11y 的**合同验收**留给 P6；P4B 保留已取得的证据并标注为「非回归证据」。**

**依据 1 —— 冲突的两份文件里，ADR 是权威，P4B.md 是后加的阶段记录。**
`GOAL-executor-typora-complete.md:27` 明确「本 Goal 是外挂速记，**权威定义始终是
tasks.md + design/phases + validation/phases + adr/**」；该 ADR 状态是
`Accepted for planning... 该 ADR 冻结 P4B/P6/P7 的需求边界`（:5）。
当 `validation/phases/P4B.md` 的 construct 表与已接受 ADR 冲突时，ADR 胜出。
ADR 「结果」一节（:25）白纸黑字：「**P6 必须实现 explicit clipboard/a11y/navigation contracts，
并以真实 WebView/IME 证据验收**」。

**依据 2 —— ADR #5 是「不变量」，而 P4B 的证据在结构上无法证伪它的对立面（技术理由，最重要）。**
ADR 决定 #5（:17）要求 copy/cut 「从 CodeMirror/Core source range 产生，**不依赖 rendered DOM
`textContent`**」。但 `P4B.md:32` 自己规定「P4B 不输出 `hidden`（只 visible/dimmed/revealed）」。
于是本轮的两条新断言里：

- `sliceDoc(from,to)`（= ADR 要求的路径）产出 X；
- 「遍历 DOM 文本节点并剔除 widget 节点」（= ADR **禁止**的路径）在 P4B 也产出**同一个** X。

我在 Q2(b) 已论证这两条路径在 P4B 不可区分。**因此 P4B 的证据证明了「ADR #5 当前未被破坏」，
但没有、也不可能证明「ADR #5 被满足」** —— 后者的判别力只有在 P6 打开 `hidden` 之后才出现。
把合同验收挂在 P4B，等于把一个只有在 P6 才可证伪的命题提前宣布成立。

**依据 3 —— 同一行的 a11y 成分同样不是 P4B 可闭合的。**
人工验收把 a11y 判为 `conditional-accept` 并留下 still-open：
真实 VoiceOver 朗读序列/rotor、OS 高对比度与减弱动态效果。
`P4B.md:17` 的 Human 列写的是「**ACCEPT**（clipboard）／**CONDITIONAL**（a11y）」——
它自己已经承认 a11y 没闭合，却仍与 clipboard 并列挂在 P4B 行内，语义自相矛盾。

**依据 4 —— 收缩不等于丢弃，本轮证据全部保留且有明确用途。**
建议改写为：

| Construct | Flag | P4B 主张 | P6 承接 |
| --- | --- | --- | --- |
| source clipboard / a11y / atomic **底座不变量** | OFF | `NON-REGRESSION EVIDENCE RECORDED` —— 已证明：① 走 CodeMirror `handlers.copy/cut` + `DataTransfer` 回读，payload === `sliceDoc`（机制级）；② 系统 pasteboard 端到端逐字节一致（人工，`pastedSha256` 已独立复算）；③ 同一时刻 DOM 含 widget chrome 而 payload 不含 | **合同验收归 P6**（ADR 结果 §2） |

同时给 P6 记一条**继承要求**（这是本建议最有价值的部分）：

> P6 打开 `hidden` 后，必须**重跑** `p4b-widgets.e2e.mjs` 的两条选区 copy/cut 断言，
> 并新增断言「payload **包含**被隐藏的 marker 源码」。否则 P6
> `specs/typora-wysiwyg-editing/spec.md:62`「复制隐藏内容」场景将建立在一个
> **只在无 hidden 场景下被验证过**的 P4B 合同上——那正是 ADR #5 要防的失败模式。
> 另需补 `text/html` payload 的 sanitize 断言（`P4B-raw-html.md` 已知缺口 #4，design 05 §7）。

**保留现状的风险（为什么不维持原样）**：P4B.md 那一行会让 Program Owner 在签署
`P4B-SUBSTRATE-GO` 时误以为 clipboard 合同已被 P4B 验收完毕，从而在 P6 跳过复验。
**收缩为「不得破坏」则同时保住两件事**：P4B 的 GO 有据可依（非回归已证），
P6 的复验义务不被提前豁免。

**这是建议不是裁决** —— 归属由 Program Owner 决定。且我不认为它需要阻塞 P4B GO：
无论 PO 选哪种，P4B 这一行的**P4B 范围内的主张**（非回归 + 选区载荷是 source）现在**都有证据**。

---

## 5. 本轮新发现（按严重度排序）

### N-1 ｜ 第二次证据不可变性违规：F-2 的闭合方式是就地改写已封存的 `102354/RUN.md` ｜ **Process ｜ 高 ｜ Go 阻断**

```
$ git log --oneline -- .../20260830-102354-p4b-ime-7869de8/
4ed51b9 fix: 补选区 copy/cut 断言并更正 F-1/F-2/F-9 记录错误
ec718b4 docs: P4B 7.3 真实 IME corrective run 全 20 gate 通过…

$ git show 4ed51b9 --stat -- .../20260830-102354-p4b-ime-7869de8/
 .../REVIEW.md | 250 +++++++++++++++++++++   （新建）
 .../RUN.md    |  25 ++-                    （就地改写）
```

`4ed51b9` 对已由 `ec718b4` 封存的 `102354/RUN.md` 做了两处**内容改写**：
1. F-9：「日文确认键 Right Arrow → Return」→ 改为「补发确认键 Return（原先未发送任何确认键）」+ 事实更正引用块；
2. F-2：删掉「上一 run 的 RUN.md **未被改写为"日文已通过"**，仅追加前向指针，历史结论保持原样」，
   替换为承认 `7869de8` 回写事实的准确叙述。

**为什么这是高severity**：
- 它与 F-1 是**同一类行为**（写入已封存的 run 目录），而 F-1 已被前任判为 Go 阻断项。
- 它发生在**写下教训之后**：`P4B.md:141-142` 明写「corrective run 的目录一旦建立，
  后续任何提交都不得再触碰它。写证据时若同时需要改历史 run，说明流程本身就走错了」——
  而 `P4B.md:138` 却把这次就地改写登记为「（已完成）」，**未标为同类违规**。文档自相矛盾。
- **它损害了可审计性这一核心价值**：今天任何人读 `102354/RUN.md` + `102354/REVIEW.md`，
  会看到 REVIEW.md 的 F-2 在批评一段**已经不存在于该文件中的**文字，从而误判前任 Reviewer 判断有误。
  要看懂，必须 `git show ec718b4:.../RUN.md` 去比对历史版本。
- **它是系统性的，不是偶发**（完整清单，我逐目录核过）：

  | run | 建目录 | 后续写入 |
  | --- | --- | --- |
  | `083435` | `b50e392` | `7869de8`（F-1 违规）、`ec718b4`（+4 前向指针） |
  | `080554` | `b50e392` | `cce1a55`（封存为 SUPERSEDED —— 对象当时未封存，可接受） |
  | `102354` | `ec718b4` | **`4ed51b9`（就地改写 RUN.md）** |
  | `113140` | `1f1bd3c` | **无** ✓ |
  | `122241` | `bb94474` | **无** ✓ |

  **每一次 corrective 都改了它的前任；只有最新的两个目录是干净的。**

**公平性说明（重要）**：前任 Reviewer 的 F-2 条件原文是「修正被复核 `RUN.md`「Run hygiene」段的
不实陈述」—— 该措辞**要求了一件协议禁止就地执行的事**。责任并非全在执行流。
且本次改写的方向是**把假话改成真话**，不是掩盖失败，与 F-1 同等减轻。
**我判其为阻断，不是因为内容有害，而是因为「不可变性」这条规则若不机械落地，
P6/P7 会继续重演，整个 program 的证据链将不可审计。**

**解除条件（低成本，不需重跑任何 gate）**：
1. 在 `P4B.md` 与后续 run 的 `RUN.md` 中，把 `4ed51b9 → 102354/RUN.md` 登记为**第二次同类违规**
   （与 F-1 并列），并修正 `P4B.md:138` 的定性；
2. 落地**机械防护**：例如脚本/CI 检查「任何 commit 若修改已存在于其父提交中的
   `evidence/**/RUN.md`、`ENVIRONMENT.md`、`REVIEW.md` 或 `gates/**`，则失败」，
   除非该 commit 是目录的建立者。**没有机械防护，这条规则还会第三次被违反。**

### N-2 ｜ C21 的检查范围结构性看不到本 run 自身产物；「F-1 伤疤」归因失真 ｜ **Process ｜ 中高 ｜ 阻断 PO 对 C21 的裁决**

见 Q3(C21)。要点：C21 的范围终点是 `b91de0e`，而本 run 目录在 `1f1bd3c` 才落盘
（`git ls-tree b91de0e | grep -c 113140` = **0**；`git ls-tree 1f1bd3c | grep -c 113140` = **44**），
故 C21 **永远检测不到本 run 自己的日志**。而本 run 自己的 9 个日志恰好都携带同一缺陷。
`git diff --check b50e392 HEAD` 的输出也**远超** C21 记录的那一条（还含 `122241/run*.log`）。

**为什么阻断**：Program Owner 正被要求在 A/B 之间裁决 C21，而当前归因
（RUN.md:117「F-1 留下的伤疤」、P4B.md:155「F-1 的伤疤可被机器检测」）会导向
「给 F-1 那一条开一次性例外」这个**基于错误前提**的决定。

**解除条件**：更正 C21 的归因（拆成「已封存目录内 → 确实不可修」与「本 run 产物 → 捕获流程缺陷」）；
修捕获脚本（落盘前 strip 尾随空行）；把 C21 口径改为覆盖本 run 提交后的 HEAD。

### N-3 ｜ 人工验收聚合首次运行 3 条失败后被重试，报告未披露 ｜ **Process ｜ 中 ｜ 不阻断**

见 Q6(f)。`run.log`：item2 / item3 / item6 失败（均为 `openDoc` waitUntil 15s 超时），
随后逐个重跑通过；归档 findings 来自重跑。`HUMAN-ACCEPTANCE.md` 与 `P4B.md` 均未提及。
**数据可信，披露不完整。** 附带价值：它独立佐证了 C20 的文件切换危害**不是单一 harness 的腐烂**。

### N-4 ｜ `lossless-acceptance` 的「对照实验」是 null experiment ｜ **Process ｜ 中 ｜ 不阻断**

见 Q3。`all-lossless-acceptance.e2e.mjs` 只 import `p2-acceptance.e2e.mjs`，
把 `p4b-widgets.e2e.mjs` 回退到 `b50e392` **在机械上不可能改变该套件的行为**。
结论（非 P4B 引入）依然成立，但支撑它的是 import 图与失败形态，不是这个对照。
`issues/...rotted.md:26,34` 把它并列为证据之一，属证据强度夸大，建议改写措辞。

### N-5 ｜ 人工验收脚本未随证据归档（只在 `/tmp/p4b-acc/`） ｜ **Process ｜ 中低 ｜ 不阻断**

见 Q6(f)。三份 spec + `lib.mjs` + `hid.swift` + `wdio.conf.mjs` 全在易失目录。
我复核时它们恰好还在，方能验证方法学；这不可依赖。建议后续复制进 run 目录
（归档到证据目录不触及产品代码，与「不改仓库」不冲突）。

### N-6 ｜ 「release 包中不可达」表述不准确；同时 item1–3 被过度收缩 ｜ **Process ｜ 低 ｜ 不阻断**

见 Q5。P4B flag 有 `localStorage['markflow.p4b.<name>']==='1'` 的**全构建入口**（无 UI）；
而 Live Preview 在 release **默认 ON**（`livePreviewFlag.ts:10`），故 item1/2/3 的观察可外推。
`HUMAN-ACCEPTANCE.md:34` 与 `P4B.md:92` 两处表述都需更正。方向偏保守，不构成风险。

### N-7 ｜ ENVIRONMENT.md 的 Captured 时间不是实测值 ｜ **Process ｜ 低 ｜ 不阻断**

记录 `11:34:50`，实际 mtime `11:35:01`（差 11 秒，方向偏早）。
「先落环境、后跑 gate」的结论不受影响（仍早于 `11:35:38`）。建议更正为实测值。

### N-8 ｜ `102354/REVIEW.md` §1.2 的 C08 结论现已知为错，与同目录 RUN.md 的历史错误同源 ｜ **Process ｜ 低 ｜ 不阻断**

前任 Reviewer 在 §1.2 写「C08…日志为 `running 0 tests` / `0 passed`，与 RUN.md…一致」——
与执行流犯了同一个错误（只读尾部那行）。REVIEW.md 已封存不可改，故证据目录内存在互相矛盾的历史记录。
执行流「登记而不改写」的处理**正确**；建议在 `P4B.md` 补一句说明该处亦受影响，避免后来者困惑。

### N-9 ｜ raw HTML 的 `text/html` sanitize 零覆盖 ｜ **Coverage ｜ 低（P4B）/ 中（P6） ｜ 不阻断 P4B**

`P4B-raw-html.md` 已知缺口 #4 自认：`design/05` §7 要求 clipboard HTML 必须 sanitize，
但现有断言只覆盖 `text/plain` 与 widget 路径，无任何 `text/html` payload 断言。
记录诚实。**应在 P6 的 clipboard 合同验收中显式带上**（已并入 Q7 的 P6 继承要求）。

---

## 6. 复核结论

# **PASS WITH CONDITIONS**

### 技术实质：成立，且我做了独立验证

- **产品源码零改动**（R1，`git diff --stat b50e392 HEAD -- src src-tauri markflow-core` 为空）——
  贯穿整个 P4B 的核心事实，对当前 HEAD `949419b` 依然成立。
- **我亲自重跑的 8 条命令全部 EXIT=0**（433 / 845 单测、tsc、L0 24-23 + L1 95-93 字节契约、
  openspec strict、openspec all、archive sync），计数与 C01/C02/C03/C10/C11/C12/C13 **逐项一致**。
- **21 个 gate 的退出码我逐个读取核对**：C01–C19 = 0，C20 = 1，C21 = 2，与 RUN.md 表一致。
- **F-4 的剪贴板证据我做了机制级验证**（回溯 `@codemirror/view` 的 `handlers.copy` →
  `copiedRange` → `sliceDoc`，确认 `defaultPrevented===true` 精确排除 `captureCopy` 兜底分支；
  确认 MarkFlow 未注册 copy/cut 自定义 handler、未注册 `clipboardOutputFilter`）。
- **人工验收的系统 pasteboard 证据我独立验证**：`pbpaste` 出进程读取、`/tmp/p4b-acc/**` 零处写剪贴板、
  HID 为 `CGEvent.post(tap:.cghidEventTap)` + `becameFrontmost:true`、`pastedSha256` 我独立复算一致。
- **未发现 Data Loss / Save Safety / Security / Cross-document 级别的产品缺陷。**
- 未重跑桌面套件（理由见 §1），**我认为现有桌面证据可信**。

### 阻断项（Go 之前必须满足）

| # | 阻断条件 | 性质 | 成本 |
| --- | --- | --- | --- |
| **B-1** | **登记 N-1 为第二次证据不可变性违规**（与 F-1 并列），修正 `P4B.md:138` 的定性，并**落地机械防护**，使任何 commit 无法再修改已存在于其父提交中的 `evidence/**/RUN.md`/`ENVIRONMENT.md`/`REVIEW.md`/`gates/**` | Process | 低（不需重跑任何 gate） |
| **B-2** | **在 Program Owner 裁决 C21 之前更正其归因**（N-2）：拆分为「已封存目录内 → 确实不可修」与「本 run 产物 → 捕获流程缺陷」，并修捕获脚本 + 改 C21 口径 | Process | 低 |
| **B-3** | **`P4B-ITEM-rawHtmlPolicy-GO` 需安全/资源负责人人类签字**；未补齐则该单项 `NO-GO` 并保持 source fallback（人工验收已标 `conditional-accept`，`P4B-raw-html.md` 已列出 4 条缺口） | 治理 | 取决于人 |

**B-1 / B-2 是流程阻断，不是技术阻断。** 它们不要求重跑 gate、不要求改产品代码。
我判其为阻断的唯一理由与前任判 F-1 相同：**P6/P7 将继承这套证据与这套习惯**。
前任已经指出「必须在 Go 前闭合」；本轮我发现闭合 F-2 的动作**又制造了一次同类违规**——
若不在此刻立住机械防护，第三次、第四次是确定的。

### 不阻断但建议处理

N-3（补披露验收重试）、N-4（改写对照实验措辞）、N-5（归档验收脚本）、
N-6（更正可达性表述）、N-7（更正 Captured 时间）、N-8（说明 REVIEW.md 同源错误）、
N-9（P6 补 `text/html` sanitize 断言）。

### 给 P6 的继承要求（建议随 P4B 交接，不阻塞本阶段）

1. 打开 `hidden` 后**重跑**选区 copy/cut 断言，并新增「payload **包含**被隐藏 marker 源码」断言 ——
   这是 ADR #5 唯一可证伪的场景，在 P4B 无法验证（Q2(b) / Q7）。
2. 补 `text/html` payload 的 sanitize 断言（N-9）。
3. 验收脚本与 harness 一律归档进 run 目录（N-5）。
4. 「切文件后 `activeFilePath` 不更新」已被两套独立 harness 观测到（C20 13 条 + 人工验收 3 条），
   应在 P6 起作为**环境危害**登记并排查，不要按 flaky 处理（N-3 / Q3）。

### 一句话结论

**技术实质 PASS；三条阻断条件全部是流程与证据完整性性质，均可在不重跑 gate 的前提下闭合。**

> **本 Reviewer 不批准最终 Go。**
> `P4B-SUBSTRATE-GO` 与各 `P4B-ITEM-*-GO/NO-GO` 必须由主会话在
> 「实现 + 独立 Reviewer + 人工验收 + Program Owner」四者齐备后记录。

---

## 7. Reviewer 执行的副作用说明

- 新建文件：**仅** `validation/evidence/P4B/20260830-113140-p4b-clipboard-b91de0e/REVIEW-ROUND2.md`。
- 未修改 `src/`、`src-tauri/`、`markflow-core/`、`e2e/**`、`tasks.md`、
  任何既有 `RUN.md` / `ENVIRONMENT.md` / `REVIEW.md` / `gates/**`、
  `validation/phases/**`、`validation/issues/**`。
- 运行的测试命令（vitest / npm test / tsc / byte-contract / openspec）只写入 gitignore 的
  产物与临时目录；`git status --porcelain` 在复核结束时除本报告外无其他新增项。
- 读取了 `/tmp/p4b-acc/` 下的验收脚本（只读，未执行、未修改）。
- 未跑桌面套件，未抢占前台。
- 未提交任何改动。
