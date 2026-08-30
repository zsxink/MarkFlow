# Independent Review — P4B real-IME corrective run

| Field | Value |
| --- | --- |
| Run under review | `20260830-102354-p4b-ime-7869de8` |
| Candidate range | `a8c73de..ec718b4`（复核启动时 HEAD 为 `814e91f`） |
| Reviewer | 独立 Reviewer（未参与实现） |
| Reviewed at | 2026-08-30 |
| Protocol | `validation/VALIDATION-PROTOCOL.md` §6 / §7 |
| Verdict | **PASS WITH CONDITIONS** |

Reviewer 声明：本报告**不代表 Program Owner 批准最终 Go**。未修改 `RUN.md`、`ENVIRONMENT.md`、`tasks.md` 或任何历史证据文件。

> **复核期间的并发提交（重要）**
> 复核进行中，另一执行者提交了 `cce1a55`（`docs: 封存 widgets run 为 SUPERSEDED 并修正 P4B 剪贴板缺口表述`），
> 使 HEAD 从 `814e91f` 前进到 `cce1a55`。该提交只改了两个文件：
> `20260830-080554-p4b-widgets-a8c73de/RUN.md`（+53）与 `validation/phases/P4B.md`（+31/-8）。
> 经核对：它**未触碰**被复核 run `102354` 的目录，也**未触碰**历史 run `083435` 的目录；
> 且 `git diff --stat b50e392 cce1a55 -- src src-tauri markflow-core` 仍为空——
> **「产品源码零改动」结论对 `cce1a55` 依然成立。**
> 该提交已解决本报告 **F-3 与 F-6**，并重新界定了 **F-4**；**F-1 与 F-2 未受影响，仍然开放**。
> 详见第 4、5 节。

---

## 1. 复核范围

### 1.1 亲自重跑的命令（含退出码）

| 命令 | 结果 | 退出码 |
| --- | --- | --- |
| `npm test` | 845 passed / 51 files | 0 |
| `npx tsc --noEmit` | 无输出 | 0 |
| `npm run test:byte-contract` | L0 24+/23-、L1 95+/93-、`ok:true` | 0 |
| `npx openspec validate refactor-lossless-live-preview --strict` | `Change ... is valid` | 0 |
| `npx openspec validate --all` | 61 passed, 0 failed | 0 |
| `bash scripts/check-archive-synced.sh` | `OK: all archived delta specs ... synced` | 0 |
| `git diff --check`（工作区 vs 索引） | 无输出 | 0 |
| `NODE_OPTIONS= node e2e/run.mjs ime` | 1 passing（**独立复跑**，session `a6cde71b`） | 0 |
| `NODE_OPTIONS= node e2e/run.mjs lossless` | 28 passing（**独立复跑**） | 0 |
| `git diff --stat b50e392 ec718b4 -- src src-tauri markflow-core` | **空** | 0 |
| `shasum -a 256 ENVIRONMENT.md` | `a8d77d15d92d97f5a17016b4dbeace86245f99167ac8051053b50f42ad0d176b` | 匹配 RUN.md 记录 |

桌面套件复跑均遵守「一次只跑一个、`NODE_OPTIONS=` 清空」的要求，期间未主动打开其他 GUI 应用。

### 1.2 未独立重跑、以 gate 日志为准的部分

- C01（433 focused unit）：读取 `gates/C01-focused-unit.log`，`Tests 433 passed (433)`。
- C04 / C14（前端与 E2E 构建）：读取日志；`ime` 与 `lossless` 复跑已各自触发一次完整 `test:e2e:build` 并成功，构成旁证。
- C05 / C06 / C07（cargo fmt / clippy）：仅读日志。
- C08（core tests）：日志为 `running 0 tests` / `0 passed`，与 RUN.md「core 当前无 test target」一致。
- C09（Tauri tests）：日志汇总 `161 passed; 0 failed`，与声称一致。
- C16 / C17 / C18（smoke / regression / p0s）：仅读日志。
- C19：手工执行 `git diff --check` 复现为 exit 0（见 F-7 关于其检查范围的限制）。

### 1.3 阅读的文件

`e2e/specs/lossless/p4b-real-ime.e2e.mjs`（两版全文 diff）、`e2e/wdio.conf.mjs`、`e2e/run.mjs`、`e2e/specs/lossless/all-lossless.e2e.mjs`、`all-lossless-acceptance.e2e.mjs`、`p4b-widgets.e2e.mjs`（112–245 行）、`p2-acceptance.e2e.mjs`（328–352 行）、`e2e/artifacts/p4b-real-ime.json`（全量字段解析）、`src/lib/lossless/widgets/p4bWidgets.ts`（370–425 行）、`src/lib/lossless/cohortFlags.ts`、`src/lib/lossless/renderOwnerRegistry.ts`、`validation/phases/P4B.md`、`validation/VALIDATION-PROTOCOL.md`、`adr/adr-typora-projection-interaction-contract.md`、本次 `RUN.md`/`ENVIRONMENT.md`、历史 run `20260830-083435-p4b-corrective-a8c73de/`（RUN.md 的两个版本 + gate 日志 diff）、`20260830-080554-p4b-widgets-a8c73de/RUN.md`、`issues/20260830-p4b-ja-kotoeri-undo-compositionend-gap.md`。

---

## 2. 「日文结论改判」的独立判定：**成立**

### 2.1 直接证据

**(a) 断言是净变严，不是放宽。** 逐条核对见第 3 节。新增了 3 条硬断言（`inputSourceActive`、`undoCount === 1`、`notComposingAfterCommit`），并把覆盖度从「跑通已启用的即可」改成「缺任一输入源即硬失败」。没有任何一条「必须通过 → 只记录」的退化。

**(b) `forcedEndExperiment` 确为 `null`，没有被用来救结果。** 代码路径 `if (undone !== original)` 才执行；本次 run 的 artifact 中 zh 与 ja 两个目标该字段均为 `null`，我独立复跑后的新 artifact 同样为 `null`。合成 `compositionend` 实验从未触发。

**(c) 产品源码零改动。** `git diff --stat b50e392 ec718b4 -- src src-tauri markflow-core` 为空（两次确认）。改判不可能来自产品行为变化。

**(d) 我独立复现了日文通过，且事件形状与中文一致。**

```
[ja]  active=com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese
      hasStart/Update/End = true/true/true
      composedText="日本語"   matchesCJK=true
      original="> marker\n" -> docAfter=">日本語 marker\n" -> afterUndo="> marker\n"
      undoCount=1  undoRestored=true
      composing=false  inputStateComposing=-1  viewFound=true
      forcedEndExperiment=null
      尾部事件: input(日本語) -> beforeinput -> input -> beforeinput(日本語) -> input(日本語) -> compositionend(日本語)
[zh]  同构：input(zhong wen) -> beforeinput -> input -> beforeinput(中文) -> input(中文) -> compositionend(中文)
```

两者的提交路径完全一致：`N×(compositionupdate + insertCompositionText)` → `deleteCompositionText` → `insertFromComposition` → `compositionend`。

**(e) 一条决定性的物理旁证。** 日文目标额外投递的确认键是 **Return**，而 `docAfter` 是 `>日本語 marker\n` —— **没有多出换行**。若当时 composition 已经结束，Return 必然作为普通回车插入换行。Return 被 IME 吞掉当作确认，反证了「composition 当时确实仍是打开状态」，即旧 harness 观察到的失败对应的确实是「未确认的 composition」，而不是「漏事件」或「history 为空」。这条旁证独立于实现方的自述。

**(f) `isComposing` 记录自洽。** 两个目标在 `insertFromComposition` 上 `isComposing === true`，`compositionend` 为 `null`（CompositionEvent 无此属性），与 issue 中「末次提交事件上 `isComposing` 仍为 `true`」的取证一致。

### 2.2 判定

**成立。** 改判由「harness 用对确认键 + 断言收紧」共同导致，不是放宽断言换来的绿灯。

### 2.3 附带的准确性保留（不影响判定）

- **「右方向键」的叙述无法从 git 历史复现。** issue `20260830-p4b-ja-kotoeri-undo-compositionend-gap.md:7` 与本次 RUN.md「Corrective changes #1」都称原 harness「按的是右方向键」。但 `b50e392` 版本的 spec 全文**没有任何方向键**——它发送 `'nihongo '`（尾随空格）后仅等待 8s。两个版本均未出现右方向键。调查结论不受影响（无论旧键是空格还是方向键，Return 修复都正确），但该叙述不可据此复现，见 F-9。
- **确认键存在目标间不对称。** `if (target.id === 'ja')` 单独投递 Return，而中文依赖 `keys` 字符串内的空格提交。这符合两个 IME 的真实用户行为，但属于特例分支，建议注释外再补一句「为何中文不需要」，否则后来者容易误删。

---

## 3. 断言逐条核对表（变严 / 变松）

对比 `git diff b50e392 ec718b4 -- e2e/specs/lossless/p4b-real-ime.e2e.mjs`（spec 仅在 `7869de8` 一处被修改，故全部变化与「确认键改对」同批发生）。

| # | 断言 / 机制 | 旧（b50e392） | 新（ec718b4） | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `inputSourceActive === inputMode` | 无 | 新增，硬断言 | **更严** |
| 2 | `compositionstart` | `toBe(true)` | `toEqual(... value: true)` | 等价 |
| 3 | `compositionupdate` | `toBe(true)` | `toEqual(... value: true)` | 等价 |
| 4 | `compositionend` | `toBe(true)` | `toEqual(... value: true)`，注释明确 required | 等价（未降级） |
| 5 | 提交文本为 CJK | `/[中文]/`；`/[日本語ひらがなカタカナ]/` | `/[一-鿿]/`；`/[぀-ヿ一-鿿]/` | 略松（字符集泛化），仍强制 CJK，可接受 |
| 6 | 提交文本紧邻 marker | `expect(docAfter).toContain(composed)` | `docAfter.includes(composed)` | 等价 |
| 7 | `undoRestoredOriginal` | `toBe(true)` | `toEqual(... value: true)` | 等价 |
| 8 | `undoCount === 1` | 无（只做 1 次 undo 后断言恢复） | 新增显式断言，loop 最多 3 次但要求第 1 次即恢复 | **更严 / 等价** |
| 9 | `compositionProbe.composing === false` | 无 | 新增 | **更严** |
| 10 | 输入源还原 `originalInputSourceRestored` | 无 | 新增，且 `finally` 中强制还原 | **更严** |
| 11 | **覆盖度** | `HIToolbox.plist` 枚举；只要有一个 enabled 就跑，缺另一个静默跳过 | TIS 枚举；`missing.length > 0` 直接 throw | **大幅更严**（plist 陈旧会把 Kotoeri 判为缺失，静默缩为纯中文 run） |
| 12 | `compositionend` 等待超时 | 8s | 12s | 略松（等待时长，非断言） |
| 13 | `composed` 取值 | 仅 `compositionend.data` | `composedFromEnd ?? composedFromInput` | 略松；但 `hasEnd` 仍强制 `true`，fallback 在通过路径上不可达 |
| 14 | HID 预检（preflight）+ 清理 | 无 | 新增：先投一个 `x` 证明物理键能到达编辑器，再 Escape/退格还原 | **更严**（区分「键没送到」与「IME 没参与」） |
| 15 | 每步落盘 progress artifact | 无 | 新增 `p4b-real-ime-progress.json` 逐步写入 | **更严**（hang 时仍留证据） |
| 16 | 失败时保留诊断 | 无 | 新增 `p4b-real-ime-preflight-failed-<id>.json` | 更严 |

**净判定：净变严。** 无「必须通过 → 只记录」的退化；第 5、12、13 条属轻微泛化/放宽，均不可被利用来掩盖 composition 或 undo 的失败。

---

## 4. 问题清单

### F-1 — 历史 run `20260830-083435-p4b-corrective-a8c73de` 被回写 ｜ **Process ｜ 高**

提交 `7869de8` 修改了该已封存 run 的目录内容：

- `RUN.md` 状态由 `PASS（19/19 gates；真实 IME 仍为独立 OPEN 项）` 改为 `PASS（20/20 gates；真实 IME 证据已补齐 …）`；
- 新增 `C20` gate 行——该 run 原始 gate 集只有 C01–C19，C20 从未属于它；
- **删除**其原「Run hygiene note (two discarded runs)」整段并替换为另一版本叙述；
- 重跑并覆盖 `C04 / C14 / C15 / C15-rerun1 / C16 / C17 / C18 / C19` 八个 gate 日志（可见构建耗时由 3.80s 变为 3.74s 等重跑痕迹），并新增 `C20-e2e-ime.log`（+140 行）。

`VALIDATION-PROTOCOL.md:73`：「历史 RUN/ENVIRONMENT/REVIEW 是不可变证据……建立 corrective run 并链接历史记录，不得直接修改历史 run 的结论」。

**定性（力求不偏不倚）**：改动方向是「补记一个缺口」，而非把失败伪装成通过——`083435/RUN.md` 现在把日文记为 product gap。因此这不是掩盖失败。但它确实违反了不可变性，且改变了已封存 run 的结论与 gate 集。**不可回滚补救**（回滚本身是第二次篡改），只能登记 + 走新建 corrective run 流程。

### F-2 — 本次 RUN.md 的证据卫生声明与事实不符 ｜ **Process ｜ 中**

`RUN.md`「Run hygiene」段称：

> 上一 run 的 RUN.md **未被改写为"日文已通过"**，仅追加前向指针，历史结论保持原样。

- 前半句为真：确实未被改写为「日文已通过」。
- 后半句为假：`7869de8` 已改写其状态行、gate 表与 hygiene 段落并覆盖 8 个 gate 日志（见 F-1）；`ec718b4` 追加的只是那 4 行前向指针。

Program Owner 若据此相信历史 run 从未被触碰，会做出错误判断。需修正为准确描述。

### F-3 — P4B.md 低估了已有的 clipboard 覆盖 ｜ **Process ｜ 中** ｜ *已由 `cce1a55` 修正*

`validation/phases/P4B.md:76-77` 称「未找到明确断言『plain-text copy/cut 含 source』的用例」。实测该表述不准确：

- **fence 复制按钮有实质覆盖。** `e2e/specs/lossless/p4b-widgets.e2e.mjs:199` 断言 `window.__p4bCopied === 'const x = 1;'`（鼠标点击路径），`:233` / `:235` 同样断言（键盘 Enter / Space 路径）。`navigator.clipboard.writeText` 被 mock 截获，断言的正是**剪贴板实际收到的文本**。
- **实现方向正确且已验证。** `src/lib/lossless/widgets/p4bWidgets.ts:402-410` 用 `sourceSlice(view.state, content.from, content.to)` 从 doc 读取，**不是** DOM `textContent`，注释引用 design 05 §4。
- 这两条用例确实在 C15 中运行并通过（我复跑的 28 passing 中包含 `fence controls flag OFF/ON show badge and copy` 与 `fence controls keyboard-only activation is accessible and fail-safe`）。

即：clipboard 并非「整体无覆盖」，widget 复制路径已覆盖。记录把「部分缺口」写成了「整体未确认」。

**状态更新**：并发提交 `cce1a55` 已把 P4B.md 的该段改写为与上述核对一致的表述（明确列出 `p4b-widgets.e2e.mjs:199` / `:233` 两条已通过的断言，并把缺口缩小到选区 copy/cut）。**本条已闭合**，但请注意该修正是**在复核期间、针对被复核 run 之后**发生的，属新提交，不是被复核 run 自身的证据。

### F-4 — 真正的 clipboard 缺口：选区 copy/cut 的 pasteboard 载荷 ｜ **Functional / Process ｜ 中**

排除 F-3 已覆盖的部分后，残余缺口是真实且实质的：

1. **P2-3 不在 20 个 gate 内。** `e2e/specs/lossless/p2-acceptance.e2e.mjs:329` 的 `P2-3 cross-construct selection + copy yields Markdown source` 属于 `lossless-acceptance` 套件（`all-lossless-acceptance.e2e.mjs`）；而 C15 跑的 `lossless` 套件 = `all-lossless.e2e.mjs`，只含 lifecycle / live-preview / p4b-cohort-reveal / p4b-widgets。**`lossless-acceptance` 套件在本次 20 gate 中没有任何对应 gate**（见 F-10）。我核对 C15 日志的 28 个用例名，确认不含任何 p2-acceptance 用例。
2. **即便运行，P2-3 也不验证 pasteboard 载荷。** 它只断言 CodeMirror selection 文本是 source 形状（含 `# 标题一`、`**加粗**`、`` `行内代码` ``）+ `document.execCommand('copy')` 返回 `true`，**从不回读剪贴板内容**；文件头注释亦承认 OS pasteboard 授权限制。
3. **`cut` 全项目无任何测试。**

**结论**：残余缺口应精确表述为「选区 copy 的 pasteboard 载荷未验证 + cut 无覆盖」，而非「clipboard 未覆盖」。考虑到 P4B 是投影交互底座、P6 的硬前置，而 `adr-typora-projection-interaction-contract.md:25` 又把 clipboard contract 明确划给 **P6**，此处还存在**范围归属歧义**——P4B.md 把「source clipboard/a11y/atomic protocol」列为 P4B 行，与 ADR 不一致。建议由 Program Owner 裁决归属。

**Reviewer 对「待 Reviewer 结论后落盘」的答复**（`cce1a55` 已起草选区 copy 断言并等待本结论）：

1. **同意落盘，且必须落盘。** P4B.md 自己的论证是对的：CodeMirror `handlers.copy` 走 `copiedRange()` → `sliceDoc()`，P4B 又不输出 `hidden`，所以**结构上**选区 copy 必然产出 source；但「结构上应当如此」不构成证据，而 P6 的 `specs/typora-wysiwyg-editing/spec.md:62` 与 `tasks.md` §7.6 直接依赖这个合同。底座阶段把合同建立在推理上，会让 P6 在隐藏 marker 后失去回归保护。
2. **必须走新建 run-id 重跑，不得并入本 run。** `cce1a55` 的表述已包含这一点，我确认其必要性。
3. **合成 `ClipboardEvent` + `DataTransfer` 是可接受的断言方式，但须满足两点**：(a) 走 CodeMirror 真实 `handlers.copy` 路径而非直接调 `sliceDoc` 后自证；(b) 同步补一条 **cut** 断言——目前 cut 仍零覆盖，只补 copy 会让缺口剩一半。
4. **桌面端若无法回读 pasteboard，须显式登记为人工验收项**，不要静默留空。

### F-5 — per-item 缺独立 RUN 记录 ｜ **Process ｜ 中**

7.9 / 7.10 要求每项独立运行并记录 maturity / default / fallback，当前证据散落在 C01 / C10 / C15 的 gate 日志中，无 per-item RUN。P4B.md 自认并定性为「记录缺口，不是验证缺口」。我同意该定性，但 per-item Go 之前必须补齐。

### F-6 — `20260830-080554-p4b-widgets-a8c73de` 未封存 ｜ **Process ｜ 中低** ｜ *已由 `cce1a55` 封存*

复核启动时状态为 `IN PROGRESS`，16 个 gate 全部 `NOT STARTED`（含 `C16 git diff --check`），另有 `FAILURES.md`。协议 §7 要求 Reviewer 不使用未封存进程——我未使用其任何产物。

**状态更新**：`cce1a55` 已将其封存为 `SUPERSEDED — 未封存（gate 退出码未捕获，不作正式 gate run）`，并说明 `gates/` 只有 `.log` 无 `.exit` 故不作正式 gate run。该处置**诚实且正确**——它没有把「日志看起来成功」冒充为「gate 通过」。本条已闭合。

### F-7 — C19 检查范围过窄 ｜ **Process ｜ 低**

C19 为手工 `git diff --check`，默认只比较工作区 vs 索引，已提交文件的空白问题检测不到。实证：

```
$ git diff --check b50e392 ec718b4
openspec/.../20260830-083435-p4b-corrective-a8c73de/gates/C20-e2e-ime.log:140: new blank line at EOF.
（退出码 2）
```

而该 run 的 C19 记为 PASS（exit 0，日志为空）。建议 C19 改为对候选提交范围执行 `--check`。

### F-8 — gate `.exit` 文件格式不一致 ｜ **Process ｜ 低**

19 个为纯 `0`，`C19-diff-check.exit` 为 `C19_EXIT=0`。统一解析的脚本会在 C19 上失败。

### F-9 — 日文「右方向键」叙述与 git 历史不符 ｜ **Process ｜ 低**

见 2.3。`b50e392` 的 spec 无方向键，只发 `'nihongo '` 后等待。调查结论不受影响，但记录不可复现，建议改为「旧 harness 未按确认键（尾随空格在 Kotoeri 中只打开转换、不提交）」。

### F-10 — 存在未纳入 gate 的套件 ｜ **Process ｜ 低**

`wdio.conf.mjs` 定义了 6 个套件，本次 20 gate 只覆盖 `lossless` / `smoke` / `regression` / `p0s` / `ime` 五个；**`lossless-acceptance`（含 P2 acceptance 全部用例，含 P2-3 选区复制）没有任何 gate**。因此「20/20 全绿」不应被读作 acceptance 套件通过。

---

## 5. 复核结论

# **PASS WITH CONDITIONS**

**技术实质成立。** 「日文结论改判」经独立验证成立（断言净变严、`forcedEndExperiment` 从未触发、产品源码零改动、我独立复跑 IME 与 lossless 均通过，并找到一条独立的物理旁证）。20 个 gate 的退出码全为 0，我独立复现了其中最关键的 6 项（含数据一致性硬要求的 byte-contract 与真实系统 IME）。

**未发现 Data Loss / Save Safety / Security / Cross-document 级别的缺陷。**

**阻断项全部是证据完整性与流程性质**，其中 F-1 / F-2 直接影响这批证据能否被信任——而 P6 将继承这些记录，故必须在 Go 前闭合。

### Go 之前必须满足的条件

1. **F-1（未闭合，最高优先级）**：新建 corrective run 记录，在阶段文档中登记「`083435` 曾被 `7869de8` 回写」这一事实及实际改动清单（状态行、C20 gate 行、hygiene 段落、8 个被覆盖的 gate 日志）。**不得试图回滚历史提交**——回滚本身是第二次篡改，且协议禁止。
2. **F-2（未闭合）**：修正被复核 `RUN.md`「Run hygiene」段的不实陈述，改为准确描述已发生的改动。
3. **F-4（部分闭合）**：选区 copy 断言按 F-4 答复的 4 点落盘，**并补 cut 断言**，在**新建 run-id** 下重跑全 gate。若桌面端无法回读 pasteboard，须显式登记为人工验收项。另请 Program Owner 裁决 clipboard contract 在 P4B 与 P6 之间的归属（P4B.md 与 ADR 当前不一致）。
4. **F-5（未闭合）**：补齐 per-item RUN 记录（maturity / default / fallback），之后才谈 per-item Go。

**已由并发提交 `cce1a55` 闭合，无需再作为 Go 阻断项**：F-3（P4B.md clipboard 表述已修正）、F-6（080554 已封存为 SUPERSEDED）。但两者均发生在被复核 run 之后，不构成本 run 的证据。

### 建议但不阻断

F-7（C19 改为按提交范围 check）、F-8（统一 `.exit` 格式）、F-9（修正右方向键叙述）、F-10（为 `lossless-acceptance` 建 gate 或显式声明其不在范围内）。

---

## 6. Reviewer 执行的副作用说明

- 复跑 `ime` / `lossless` 覆写了 gitignored 的 `e2e/artifacts/p4b-real-ime.json`；复核开始前已将原 run 的该文件备份至 `/tmp/rev_backup/p4b-real-ime.json`，原内容（10:32 生成）已完整核对，见第 2 节。
- 复跑产生了 `e2e/.tmp-*` 临时目录，由 runner 在 `finally` 中自行清理。
- 未修改任何 `RUN.md`、`ENVIRONMENT.md`、`tasks.md` 或历史证据文件；未修改产品源码；未提交任何改动。
