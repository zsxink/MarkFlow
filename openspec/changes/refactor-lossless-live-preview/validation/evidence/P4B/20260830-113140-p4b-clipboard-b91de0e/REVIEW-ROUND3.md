# P4B 独立 Reviewer 复核轮 · 第三轮（blocker 处置复核）

> 本文件是**本 run 目录内的新增文件**，不改写本 run 目录内任何已存在文件。
> 新增由 `scripts/check-evidence-immutable.sh` 规则第 3 条放行（复审文档必然晚于 run 提交）。

| 项 | 值 |
| --- | --- |
| Reviewer 角色 | **P4B 阶段独立 Reviewer（复核轮）**，不偏不倚；不批准最终 Go |
| 被复核候选 | `e43e6cf`（分支 `test/issue-255-lossless-byte-contract`） |
| 上一轮报告 | 本目录 `REVIEW-ROUND2.md`（707 行），结论 `PASS WITH CONDITIONS`，blocker B-1/B-2/B-3 |
| 复核范围 | **仅四项**：B-1 处置、B-2 处置、N-3 重新评估、对 `e43e6cf` 是否仍有 blocker |
| 本轮时间 | 2026-08-30 13:12–13:31 CST |
| 复跑命令 | 10 条，全部记录退出码（见 §0） |
| 本轮结论 | **PASS WITH CONDITIONS** —— B-1/B-2/B-3 均已满足；**新增 1 个 blocker（B-4）** |

---

## 0. 本轮复跑的命令与退出码

工作目录 `/Users/xian/Project/book/MarkFlow`，HEAD = `e43e6cf`。

| # | 命令 | 退出码 | 关键输出 |
| --- | --- | --- | --- |
| R1 | `git diff --stat b50e392 HEAD -- src src-tauri markflow-core` | **0** | 输出为空（0 个文件）——产品源码零改动在 `e43e6cf` 仍成立 |
| R2 | `npx vitest run --config vitest.config.ts src/lib/lossless` | **0** | `Test Files 16 passed (16)` / `Tests 433 passed (433)` |
| R3 | `npm test` | **0** | `Test Files 51 passed (51)` / `Tests 845 passed (845)` |
| R4 | `npx tsc --noEmit` | **0** | 无输出 |
| R5 | `npm run test:byte-contract` | **0** | `"ok": true`，`"failed": []` |
| R6 | `npx openspec validate refactor-lossless-live-preview --strict` | **0** | `Change 'refactor-lossless-live-preview' is valid` |
| R7 | `npx openspec validate --all` | **0** | `Totals: 61 passed, 0 failed (61 items)` |
| R8 | `bash scripts/check-archive-synced.sh` | **0** | 通过 |
| R9 | `bash scripts/check-evidence-immutable.sh b50e392 HEAD` | **0** | 4 条 allowlist 命中 + 1 条 gate 告警，无违规 |
| R10 | `node -e 'js-yaml 解析 .github/workflows/ci.yml'` | **0** | `YAML OK; steps: 18`；`guard step: 1`；`fetch-depth: {"fetch-depth":0}` |

未复跑桌面 suite（`node e2e/run.mjs *`）：本轮四位问题均不依赖新的桌面证据，
且 `e43e6cf` 未触碰 `e2e/**` 与产品源码，既有桌面证据仍然有效。

旁证（非强制）：`git show e43e6cf --stat` = 5 文件 / +1168/-16，全部落在
`.github/workflows/ci.yml`、`validation/phases/P4B.md`、`package.json`、
`scripts/check-evidence-immutable.sh`、以及本目录的 `REVIEW-ROUND2.md`。

---

## 1B. B-1（N-1 登记 + 机械护栏）—— **满足**

### 1B.1 登记部分：核对通过

`validation/phases/P4B.md:152-229` 新增「N-1 — 同类违规重犯」节。我逐项复核：

- **4 次就地改写清单齐全**（:160-165），与我上轮建的 touch 表一致。
- **数字订正属实**：我上轮写 `4ed51b9` 的 `RUN.md` 为「+25/-3」，确系把 `git show --stat`
  的合计 25 当成新增数。本轮独立复核 `git show 4ed51b9 --numstat` → **+22/-3**。
  我的记录错误，接受订正。
- **`cce1a55` 的「不等责」处理保留了我上轮的公允说明**（:179-181）。
- **F-1 处置第 2 条改标为「该动作本身违规」且原文保留不删**（:142-145）——
  这是正确的做法：删掉原文就等于删掉"流程曾经要求过一件协议禁止的事"这条证据。
- **教训替换**（:227-229）比原来那句更有价值：原来那句「后续任何提交都不得再触碰它」
  在写下 34 分钟后就被自己违反；新教训把问题定位到「通道开着就一定会有人走」，
  而不是「下次注意」。

### 1B.2 护栏部分：7 项判定我全部独立复现

| 团队自报场景 | 我的复现 | 结果 |
| --- | --- | --- |
| 真实历史 `b50e392..HEAD` → EXIT=0，4 条 allowlist 命中 | `bash scripts/check-evidence-immutable.sh b50e392 HEAD` | ✅ 一致；4 条命中并打印原因，`C20-e2e-ime.log` 命中 gate 告警 |
| 清空 allowlist → EXIT=2 拦住 4 条 | 用 `sed` 改名数组后跑同一区间 | ✅ EXIT=2，列出 4 提交 / 12 个文件（`7869de8` 占 10 个：RUN.md + 8 个覆盖的 gate 日志 + `C20-e2e-ime.log`；另 `ec718b4`/`cce1a55`/`4ed51b9` 各 1… 实为 12 条） |
| 新建 run 目录 → 放行 | 临时仓库 staged 模式 | ✅ EXIT=0 |
| 就地改已封存 `RUN.md` → 拦截 | 临时仓库 staged 模式 | ✅ EXIT=2 |
| 删除整个 run 目录 → 拦截 | 临时仓库 staged 模式 `git rm -r` | ✅ EXIT=2 |
| 改 evidence 之外的文件 → 放行（无误报） | 临时仓库 | ✅ EXIT=0 |
| 新增 `REVIEW.md` 到已封存 run → 放行 | 临时仓库 staged 模式 | ✅ EXIT=0 |
| range 模式拦新违规 | 临时仓库提交一个改 `RUN.md` 的提交 | ✅ EXIT=2 |

CI 接线也已核到：`ci.yml` 新增独立 step，`checkout` 带 `fetch-depth: 0`，
YAML 解析通过，18 个 step 中恰有 1 个护栏 step。

### 1B.3 回答你的提问：规则第 3 条（放行新增）我**接受原则，但建议按文件名收紧**

**先说结论：你的设计决定是对的，我不主张收紧到「任何触碰都算违规」。**

理由和你一致，而且有证据：N-1 的成因不是恶意，是 F-1 的处置第 2 条**主动要求**
去已封存的 `102354/RUN.md` 更正陈述。按「任何触碰都违规」实现，协议的
「复审报告落在被审 run 目录内」这一步就变成必然违规——护栏会逼出它本该拦住的行为。
禁止改写/删除、放行新增，守住的正是「历史结论不得被改写」这条真正要守的线。
我上轮 B-1 只写了「加机械护栏」，没写清这条边界，是我的不足。

**但「放行新增」当前的判据是「不是 `gates/*` 就放行」，这个判据太宽。** 实测：

```
探头：run 目录在 c1 建成（只有 RUN.md），c2 追加
  A  .../ENVIRONMENT.md      → 静默放行
  A  .../findings-x.json     → 静默放行
  A  .../REVIEW.md           → 静默放行
  A  .../gates/C99.log       → 告警
护栏输出：✅ 未发现改写/删除已有 evidence 证据文件的提交。  EXIT=0
```

`ENVIRONMENT.md` 与 `findings-*.json` 的事后追加**完全没有信号**。
这两类文件恰好是"证据价值依赖产生时机"的那两类：

- `ENVIRONMENT.md` 的全部价值在于「它在 gate 跑**之前**被捕获」——这正是 Q4 那条
  11:35:01 早于 11:35:38 的推理所依赖的属性。允许事后静默追加，等于该属性不再可验证。
- `findings-*.json` 是原始观测值，事后追加与事后补写观测在护栏眼里没有区别。

也就是说：你担心的「伪造 gate 集」这一类攻击面，`gates/*` 那条告警确实兜住了；
但**同一类的另一半（伪造环境快照、事后补 findings）在规则 3 下是敞开的**。

**建议的收紧（约 6 行，不阻断任何协议要求的动作）：**

```bash
A*)
  if   [[ "$path" == */gates/* ]]; then                      → WARN   # 现状
  elif [[ "$base_name" =~ ^(REVIEW|HUMAN-ACCEPTANCE|REBUTTAL|RESPONSE|ADDENDUM|REVIEW-ROUND) ]]; then
                                                              → OK     # 复审/验收文档，协议要求晚到
  else                                                        → WARN   # 新增：非复审类文件事后追加
  fi
```

外加一条零误报的不变量，用来堵住「run 目录分多笔提交拼装」的洞：

> **run 目录完整性**：新建 run 目录的那一笔提交必须同时含 `RUN.md` 与 `ENVIRONMENT.md`，缺任一 → 告警（不阻断）。
> 本仓库现有 5 个 run 目录里，`122241` 无 `ENVIRONMENT.md`（人工验收 run，性质不同），
> 因此该规则应对人工验收类 run 豁免或只作提示。

**为什么建议用 WARN 而不是 VIOLATION 挡住未知新增**：挡住会重新制造
「协议要求的动作在结构上不可能」——比如 P6 出现一种新的证据文件类型，
护栏就会误杀，然后人要么绕开护栏要么给它加例外，两条路都比 WARN 差。
WARN 让它在每次 CI 日志里可见、可被 review 拦下，代价为零。

**残余风险我评估为可接受**：规则 3 唯一永远挡不住的是「复审者本人写了一份假的复审」。
任何机械护栏都挡不住这个——这正是四方签署存在的原因。放行新增不会让这条变糟：
新增的 `REVIEW.md` 是一份**新的**、有署名的文档，不是对 run 自身结论的改写，
`git blame` 可归因。

### 1B.4 护栏的两处加固项（不阻断 P4B，建议 P6 开始前落地）

1. **`ALLOWED_COMMITS` 用 7 字符短哈希做键**，`is_allowed` 拿 `git rev-parse --short` 的结果比对。
   git 的缩写长度随对象数自动增长（当前 `count-objects` = 1623 → 7 位）。
   对象数越过约 2^17 后缩写变 8 位，**4 条 allowlist 会同时静默失配 → CI 永久变红**。
   修法：换成 40 位全哈希。现在改是 1 行，等 CI 红了再改就是一次事故。
2. **分支首次 push 时 `github.event.before` 是全零**，`git cat-file -e` 失败 → `usage_error` → **EXIT=3**，
   即合法事件上 CI 会红。实测：
   `bash scripts/check-evidence-immutable.sh 0000…0000 HEAD` → 打印「用法: …」。
   修法：`[ "$base" = "0000…" ] && base=$(git rev-list --max-parents=0 HEAD)`，或该情况直接跳过。

**B-1 判定：满足。** 三条（1B.3 的收紧、1B.4 的两项）列为**条件**，
不阻断 P4B Go，但应在 P6 开始产出 run 之前落地。

---

## 2B. B-2（C21 归因修正）—— **满足，可交 PO 裁决**

### 2B.1 数字我全部独立复算，与你一致

| 口径 | 命令 | 我的复算 | 你登记 |
| --- | --- | --- | --- |
| C21 原口径（range 止于 `b91de0e`） | `git diff --check b50e392 b91de0e \| grep -c "new blank line at EOF"` | **1** | 1 ✅ |
| 放宽到 `1f1bd3c` | 同上换 range | **10** | 10 ✅ |
| 放宽到 `HEAD` | 同上换 range | **14** | 14 ✅ |
| 本 run 21 个 gate 日志末行空行 | 逐文件 `tail -c 2 \| od -c` | **9**（`C01/C02/C08/C09/C15/C16/C17/C18/C19`） | 9 ✅（且文件名逐个对上 P4B.md:253） |
| range 盲区 | `git ls-tree -r b91de0e -- …/evidence/P4B/ \| grep -c 113140` | **0**；`1f1bd3c` → 44 | 0 / 44 ✅ |
| `trailing whitespace` 全量 | `git diff --check b50e392 HEAD \| grep -c` | **66** | 「大量」 ✅ |

「C21 实际检出 **1/14**」成立。原句降级为「快照碰巧命中」是对的，
而且降级后的措辞比原句更有信息量：**判断一个 gate 要看漏报率，不是看有没有命中。**

### 2B.2 补一条你没写、但 PO 需要知道的数字

`git diff --check b50e392 b91de0e` 的 `trailing whitespace` = **0**。
也就是说：C21 当时那条 range 里**根本不存在** trailing whitespace 问题，
全部 66 条来自 `1f1bd3c` 之后新增的 `113140` 与 `122241` 产物。
这进一步支持你的「对 captured output 套源码空白标准，口径本身就不对」——
空白缺陷的量级完全由「归档了多少 captured output」决定，与代码质量无关。
交 PO 时把这条带上，选项 C 的说服力会更强。

### 2B.3 对选项 B 的一句提醒

你在选项 B 里写「范围仅限末行空行，不得去修 captured output 的行尾空格」——
这个限定是对的。再补一点：即便只修 14 条末行空行，也要动
`083435` / `113140` / `122241` **三个** run 目录，需要在 `ALLOWED_COMMITS`
加**三条**带理由的 one-time 条目（不是一条），PO 签字时请按三个目录分别确认。

**B-2 判定：满足，可交 PO 裁决**（三选一表格 + 上述两条补充）。

---

## 3. N-3 重新评估

### 3.1 我的机制归因错误——**接受纠正**

上轮我写「3 条失败均为 `waitUntil … 15000ms @ openDoc`」。错了。实测：

- `grep -c "waitUntil condition failed" run.log` = **0**（只有 `timed out`，没有 `failed`）
- 3 条失败位置与机制（我逐条核到行）：

| 失败项 | 行 | 机制 | 证据 |
| --- | --- | --- | --- |
| item 2 | `run.log:80` / `:164` | **断言失败**（`2-editing.e2e.mjs:142:20`） | `:58` `item2.singleUndoRestoredBytes = false`；`:57` `docAfterSingleUndo` 仍含 `abc z`；`:76-78` diff 显示 `-` 空行 / `+ abc z` |
| item 3 | `run.log:115` / `:165` | **级联**（`2-editing.e2e.mjs:192:22`） | `:87` `docAfterTypingInFallback` 基线已带 `abc z`；`:88` `fallbackEditable = false`；`:92` `recovered.projectionState = "composing"` |
| item 6 | `run.log:140` / `:265` | **openDoc 超时**（`3-visual-a11y-security.e2e.mjs:151:5`） | `:138` `waitUntil condition timed out after 15000ms` —— 仅此一条 |

我从 item 6 一条外推到了三条，是**过度归纳**。这是我的错误，接受。

### 3.2 但严重度应当**上调**，不是下调——新证据：两次 run 之间 **spec 被改过**

你给我的消息里把两次 run 的关系表述为「全量 run vs 隔离重跑」。
但归档物本身显示，两次 run 之间**第二个变量也变了：spec 文件本身被修改过**。
三条独立证据：

**（a）失败行号与当前 spec 内容对不上。**
`run.log:80` 报失败在 `2-editing.e2e.mjs:142:20`；当前 `/tmp/p4b-acc/specs/2-editing.e2e.mjs`
（232 行）的第 142 行是 `record('item2.typing.composingAfterTyping', await composing());`
——一条 `record`，不是断言。第 192 行是 `await browser.pause(200);`。
`run.log` 报的 `:192:22` 同样对不上。行号整体位移，说明 spec 改过。

**（b）record 字段名成批改变（最决定性）。**

```
run.log（全量 run）            run2.log / findings-editing.json（改后）
  item2.singleUndoRestoredBytes   item2.typing.singleUndoRestoredBytes
  item2.docAfterSingleUndo        item2.typing.docAfterSingleUndo
  item2.docAfterTyping            item2.typing.docAfterTyping
  item2.caretAfterTyping          item2.typing.caretBeforeTyping
  item2.typedInsertedAtCaret      item2.typing.composingBefore        ← 新增
  item2.lengthDelta               item2.typing.composingAfterTyping   ← 新增
  （11 个平铺键）                  item2.typing.hidCommit              ← 新增
                                  item2.typing.docAfterCommit         ← 新增
                                  item2.typing.composingAfterCommit   ← 新增
                                  item2.typing.perKeyTrace            ← 新增
                                  item2.typing.hidUndo / hidGotoStart ← 新增
                                  item2.typing.diskUnchangedAfterAutosaveWindow ← 新增
                                  item2.typing.typedTextPresent       ← 新增
```

`grep -c composingAfterTyping`：`run.log` = **0**，`run2.log` = **1**。
当前 spec `:145-146` 的注释自陈：
> "The selected system input source during this run is the Chinese Pinyin IME,
> so the ASCII keys above open a composition. Commit it the way a …"

即改动的核心 = **新增 `hidKeys('Return')` 提交 IME composition，然后再 Cmd+Z**。
（item3 侧同理，当前 spec `:194` 为 `hidKeys('Return');`。）

**（c）测试标题未改，但场景已变。**
`run.log:164` 的用例名仍是「real HID typing lands where the caret is and one Cmd+Z restores bytes」，
而改后它测的是「先按 Return 提交 composition，再一次 Cmd+Z 还原」。

### 3.3 由此：P4B.md 的根因结论是**混淆变量**的

`P4B.md:311-317` 用下面这组数推导根因：

| 字段 | `run.log` | `run2.log` |
| --- | --- | --- |
| `item3.fallbackEditable` | false | true |
| `item3.recovered.projectionState` | "composing" | "rendered" |

但这两次 run **同时变了两个变量**：隔离状态（3 spec 并行 vs 单 spec）**和** spec 版本（无提交 vs 有 `Return` 提交）。
而 spec 改动这一个变量，**就能完整解释整组差异，不需要任何"harness 状态泄漏"假设**：

- 改前：HID 打字后 composition 未提交 → `view.composing === true` → 见 3.4 的机制 → keymap 冻结 → Cmd+Z 被吞 → item2 失败 → item3 继承脏 doc → 失败。
- 改后：`Return` 提交 → `composing === false` → keymap 解冻 → 全部通过。

所以 `P4B.md:325` 的「这不是产品回归……最可能是**测试 harness 的状态泄漏**」**不成立**，
更不支持 `:326` 的「这个结论是从上面那组对比数字推出来的」——那组数字是混淆的，
从混淆的对比里推不出任何关于「隔离」的结论。

**同时，你给的那条触发链本身方向也不对**：`composing` 只由 `compositionstart` 置位
（`@codemirror/view:5213-5215`），而 `compositionstart` 正是由 Text Input Services 产生的。
「HID 走 CGEventTap 绕过 TIS」会导致 composition **根本不会开始**（`composing` 保持 -1），
而不是「留下未关闭的 composition」。要留下 `composing > 0`，必须有
`compositionstart` 先发生——这与「绕过 TIS」是相反方向。

### 3.4 下游机制我逐行核过，成立（这部分你的判断是对的）

- `get composing() { return !!this.inputState && this.inputState.composing > 0; }`
  —— `@codemirror/view:7803`。是干净布尔，无 `-1` 真值陷阱。
- `ignoreDuringComposition(event)` —— `:4609-4613`：
  `if (!/^key/.test(event.type) || event.synthetic) return false;`
  `if (this.composing > 0) return true;`
- 调用点 `handleEvent` —— `:4522`：`if (… || this.ignoreDuringComposition(event)) return;`
  位于 `this.keydown(event)`（`:4524`）与 `runHandlers`（`:4527-4528`）**之前**。
  ⇒ `composing > 0` 时**所有 `key*` 事件在进入 keymap 前就被丢弃**，不只是 Undo。✅ 你说的"整个 keymap 被冻结"准确。
- `projectionState = 'composing'` 的来源：`projection.ts:581-582` 与 `:591-592`，
  条件是 `update.view.composing`。⇒ `run.log:92` 的 `"composing"` 等价于
  `view.composing === true`，即 `inputState.composing > 0`。✅ 自洽。

**但由此牵出一条我认为必须登记的产品风险（N-10）：**

`inputState.composing` 的复位点只有两个：
- 初始化 `this.composing = -1`（`:4490`）
- `observers.compositionend`（`:5221`）

**没有第三个。** 特别地：`observers.blur`（`:5204-5207`）只做
`clearSelectionRange()` 与 `updateForFocusChange(view)`，**不复位 composing**；
视图销毁则随 `InputState` 一起重建（即：同一 EditorView 存活期间，只有 `compositionend` 能解锁）。
而 `src/**` 对 `compositionstart` / `compositionend` 的命中数为 **0** —— MarkFlow 没有任何看门狗。

后果：一旦 `compositionend` 丢失，**该 EditorView 的 keymap 永久冻结直到视图重建**。
改后 spec 用「先按 Return 提交」绕开了这个场景，于是它现在**零覆盖**。
这条不能被记成「harness 泄漏，与产品无关」——真实用户在 IME composition 未提交时
按 Cmd+Z，撤销会**静默失效且文档保持已修改**。

### 3.5 披露缺陷比你登记的更重

- `HUMAN-ACCEPTANCE.md` 对「3 次失败」「重跑」「spec 被改」**三件事全部零披露**：
  grep `改后|改前|spec 修改|重跑|隔离|run2|run3|run\.log` → 仅 2 条命中，
  且都是「`/tmp/p4b-acc/data`（隔离）」「`/tmp/p4b-acc/ws`（隔离）」，与重跑无关。
- 归档目录 `122241/` 混装两版 spec 的产物（`run.log` 改前 / `findings-editing.json` 改后）且未标注
  —— 这点 `P4B.md:381-383` 已登记，是对的。
- **另有一条证据卫生问题（N-12，低）**：`run.log` / `run1.log` / `run2.log` / `run3.log` /
  三个 `findings-*.json` 的 mtime **全部是 12:22:55**（被 git checkout 归一）。
  ⇒ **本归档中 mtime 不可用作顺序证据**；两次 run 的先后只能由内容（spec 版本）推定。
  我上轮曾用 mtime 排序（12:18 / 12:21 / 12:22），该依据现已不可复现，特此更正。

### 3.6 记录与口头表述的一处矛盾（必须解决）

**你给我的消息**：「把那两行 accept 的依据标注为『隔离重跑，强度降级』，
要求 P6/P7 用干净会话复现一次全量 run 才算闭合。」

**`P4B.md:378-380` 的实际文字**：「依据标注为『改后 spec 的隔离重跑』。
结论**成立**（改后 spec 更严，不是放宽），**故不要求**为这两项重跑一次全量 run。」

两者**直接相反**：消息说"要重跑才算闭合"，文件说"不要求重跑"。
文件里的版本是**更宽松**的那个。请把 `P4B.md` 改成与消息一致（或反过来承认文件版本），
不要让 PO 依据一份与汇报口径不同的文件裁决。

（顺带：改后 spec 是否「更严」值得商榷。它**新增**了 composing/disk/hid 等 11 个观测与断言，
在这层意义上更严；但它**删除**了原场景——「未提交 composition 时单次 Cmd+Z 还原字节」——
的覆盖。严格说是"换了一个场景并加严"，不是纯粹的"更严"。措辞建议改为
「改后 spec 断言更多，但覆盖场景已变（改为 composition 提交后）」。）

### 3.7 回答：item6 的 openDoc 超时与 C20 的 13 failing 是否同源

**我的回答比「未证实」更强：现有证据**倾向于否定**同源。**

先说共同点（这是我把两者放在一起看的理由，比"都表现为文件切换卡住"更具体）：
两者的**判据是同一个表达式**——

- 仓库内：`e2e/specs/lossless/p2-acceptance.e2e.mjs:67-70`
  `waitUntil(() => window.__markflowStore?.getState()?.activeFilePath?.endsWith('/'+name), { timeout: 8_000, timeoutMsg: 'Expected active document to be ${name}' })`
- 验收 harness：`/tmp/p4b-acc/lib.mjs:58`
  `waitUntil(() => (window.__markflowStore?.getState()?.activeFilePath ?? '').endsWith('/'+name), { timeout: 15_000 })`

即：**同一个 observable（文件树点击后 `activeFilePath` 未变成目标文件），同一个失败点。**
这一点此前没人明确指出，我认为值得登记。

但三组不对称使「同源」假设**不被支持**：

| 维度 | C20（13 failing） | item6（1 条） |
| --- | --- | --- |
| 重试容忍 | `p2-acceptance.e2e.mjs:64` 外层 `for attempt < 3`，每次 8s ⇒ **≥24s 且重试整个 open 流程**，仍 13/15 失败 | 单次 15s，无重试 |
| 并发 | 单 worker `#0-0` | 3 worker `[0-0][0-1][0-2]`，跨 worker 争抢同一 `activeFilePath` 是可用机制，C20 侧不存在 |
| 确定性 | 两次独立 run 均 2/13（`75afebe`、`b91de0e`）——**可复现** | 隔离重跑即通过，**不可复现** |

一个共同成因必须同时产生「一个 harness 里的确定性级联」和「另一个 harness 里的单次不可复现超时」——
这需要额外假设才能成立，而奥卡姆剃刀下不需要。

**建议把登记从「未证实」改为：「已反驳（disfavoured）；但两者共享同一 observable，
应作为同一个具名环境风险持续观察。**

**并给一条能一次性了结的廉价改进（N-13，低）：** 两个 harness 在失败时**都不记录观测值**。
`p2-acceptance.e2e.mjs:70` 的 `timeoutMsg` 只有期望值（`Expected active document to be X`）；
`lib.mjs:58` 连 `timeoutMsg` 都没有（`run.log` 只能看到通用的「waitUntil condition timed out」）。
⇒ 13 + 1 = 14 条失败，**零条**留下「当时 `activeFilePath` 实际是什么」。
把观测值写进 `timeoutMsg`，一次 run 就能判定同源与否；现在花在这上面的推理成本已经远超改动成本。

### 3.8 N-3 最终判定

| 项 | 上轮 | 本轮 |
| --- | --- | --- |
| 3 次失败 + 未披露重跑 | 中 | **成立**，且补充：spec 也被改、报告零披露 |
| 机制归因 | 中（我的错误） | 我的归因**错误，撤回**；你的下游机制成立，上游触发链不成立 |
| 根因「harness 状态泄漏」 | — | **不成立**（混淆变量 + 方向相反） |
| 综合严重度 | 中 | **高** |

上调理由不是"失败条数"，是：**两份作为验收依据的 accept，其证据来自一个为绕过失败而修改过的 spec 的重跑，
而这件事在验收报告里一个字都没有。** 这是证据链问题，不是覆盖率问题。

---

## 4. 对候选 `e43e6cf` 是否仍有 blocker

### 4.1 B-3 —— **满足**（处置方式正确）

`P4B.md:474-495` 的「逐项裁决表」明确标注**执行流拟稿，未生效，待 PO 记录**，
且 raw HTML 走**保守默认**：`NO-GO` + 保持 source fallback，阻塞项写明「安全/资源 owner 签字缺失，仓库内无记录」。
另附「若后续签字可在 P7 改 GO，无需回改 P4B 任何证据」——这一步想得对：
它把未来的翻转放在 P7 的裁决记录里，从而不触碰已封存证据，与护栏不冲突。

我上轮要求的正是「需签字，否则 NO-GO + source fallback」。执行流没有代签、没有自行放宽，
取了保守分支 ⇒ **B-3 满足**。外部签字继续 pending，但它是 PO/安全 owner 的动作，
不再是 P4B 的阻塞项。

### 4.2 新增 blocker **B-4**：人工验收签署的采信前提

**B-4（高，阻断 PO 采信「人工验收」这一签署方；不阻断 substrate 的技术结论）**

三项待办，**全部是登记动作**（`HUMAN-ACCEPTANCE.md` 属已封存证据，护栏现在也会机械拦下就地改写）：

1. **在 `P4B.md` 的 N-3 节补登记两件事**：
   (a) `run.log` ↔ `run2.log` 不是「同一 spec 的隔离重跑」，而是**改后 spec 的重跑**
   ——证据见 §3.2（record 键 `item2.*` → `item2.typing.*`，新增 `hidCommit`/`docAfterCommit`/`composingAfterCommit`）；
   (b) `:311-317` 那组「全量 run vs 隔离重跑」对比**混淆了两个变量**，不得作为根因依据；
   `:325-326` 的「最可能是 harness 状态泄漏」应撤销或改写为「未定」。
2. **两行 accept 的场景表述必须与测试实际对齐**：改为
   「IME composition **提交后**，单次 Cmd+Z 精确还原字节」（或同步修改测试标题）。
   现状是标题写「one Cmd+Z restores bytes」，实测的是「Return 提交后 one Cmd+Z restores bytes」。
3. **新增一条 P6 open item（N-10）**：`composing` 仅在 `compositionend` 时复位
   （`@codemirror/view:4490` 初始化 / `:5221` compositionend，**无 blur/失焦复位**；
   `src/**` 零条 composition 监听）⇒ 未提交 composition 时按 Cmd+Z **静默失效且文档保持已修改**。
   该场景被改后 spec 绕开，目前**零覆盖**。

**是否要求重跑一次全量 run —— 我的意见（与 §3.6 的口径冲突一并给你）：**
按改后 spec 跑一次「三 spec 并行的全量 run」是**最干净的了结方式**，成本约 6 分钟。
若 PO 接受「场景已变、原场景不再验收」这一前提，则可以不跑，前提是 1/2/3 三项登记到位。
**两条路都可以，但不能既改了 spec、又不在报告里说、又不重跑。**
我倾向**跑一次**：它同时还能给 item6 与 C20 的同源疑问再提供一个样本（若带上观测值日志改进则价值更大）。

### 4.3 其余新发现（按严重度，均不阻断 P4B）

| # | 严重度 | 内容 |
| --- | --- | --- |
| N-10 | 中高（P6 高） | `composing` 无看门狗：仅 `compositionend` 复位，blur/失焦不复位，MarkFlow 零监听。见 §3.4 |
| N-11 | 中高 | 改后 spec 的重跑被当作验收结论，且 HUMAN-ACCEPTANCE.md 零披露。见 §3.2 / §3.5（已并入 B-4） |
| N-12 | 低 | `122241/` 内 7 个文件 mtime 全为 12:22:55（git checkout 归一），mtime 不可作顺序证据。见 §3.5 |
| N-13 | 低（性价比高） | 两个 harness 的 `waitUntil` 失败时不记录观测值 `activeFilePath`，14 条失败零诊断信息。见 §3.7 |
| N-14 | 低 | 护栏加固两项：allowlist 用 7 位短哈希（对象数增长后会全表失配 → CI 永久红）；分支首次 push 时 `github.event.before` 全零 → EXIT=3 → 合法事件红。见 §1B.4 |

### 4.4 无其他 blocker

- 产品源码零改动：`git diff --name-only b50e392 HEAD -- src src-tauri markflow-core` = **0 个文件** ✅
- 10 条复跑命令全部 EXIT=0（§0）✅
- 本轮**未发现**新的不可变性违规：护栏在 `b50e392..HEAD` 上 EXIT=0，
  且 `e43e6cf` 对本 run 目录只有「新增 `REVIEW-ROUND2.md`」，属规则第 3 条放行 ✅

---

## 5. 结论

**PASS WITH CONDITIONS**

| Blocker | 上轮状态 | 本轮判定 |
| --- | --- | --- |
| B-1（N-1 登记 + 机械护栏） | 阻断 | **满足**（登记无误；护栏 7 项我全部独立复现；规则第 3 条我接受原则，建议按文件名收紧——列为 P6 前条件，不阻断 P4B） |
| B-2（C21 归因） | 阻断 | **满足**（1/10/14、9/21、0/44 我全部复算一致；可交 PO，附 §2B.2/§2B.3 两条补充） |
| B-3（raw HTML 安全签字） | 阻断 | **满足**（默认取保守分支 `NO-GO` + source fallback，裁决表标「未生效」；外部签字转为 PO/安全 owner 待办） |
| **B-4（人工验收披露）** | 本轮新增 | **阻断 PO 对「人工验收」签署方的采信** —— 待办见 §4.2 三项；不阻断 substrate 技术结论 |

非阻断条件（建议 P6 开始前落地）：§1B.3 护栏按文件名收紧、§1B.4 两项加固、
N-10/N-12/N-13 登记为新 open item。

**本 Reviewer 不批准最终 Go。**
`P4B-SUBSTRATE-GO` 与各 `P4B-ITEM-*-GO/NO-GO` 必须由主会话在
「实现 + 独立 Reviewer + 人工验收 + Program Owner」四者齐备后记录；
其中「人工验收」这一签署方在 B-4 三项登记到位之前不应计入齐备。

---

## 6. 副作用声明

- 本轮**只新增**本文件 `REVIEW-ROUND3.md`。
- 未修改产品代码（`src/` `src-tauri/` `markflow-core/`）、`e2e/**`、
  以及 `validation/evidence/**` 下任何已存在文件（护栏会机械拦下，本轮未触发）。
- 未修改 `validation/phases/**`。
- 复核用的临时 git 仓库建在系统临时目录，不在本仓库内。
- `git status --porcelain` 复核：仅一条 `?? openspec/.../validation/GOAL-executor-typora-complete.md`
  （本轮开始前即已存在的未跟踪文件）+ 本文件。
