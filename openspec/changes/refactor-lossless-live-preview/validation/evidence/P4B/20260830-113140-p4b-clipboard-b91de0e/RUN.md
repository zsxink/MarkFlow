# P4B Corrective Run #2（选区 clipboard 证据 + F-1/F-2/F-7/F-8/F-9 记录更正）

状态：**19/21 gates EXIT=0**；C20 为已取证的 P2/P1B 遗留腐烂套件，C21 为 F-1 遗留的空白行缺陷。
二者均非产品功能缺陷，也都不是「掩盖失败」——详见下文各自条目。**执行流不自我批准 Go。**

## Identity

| Field | Value |
| --- | --- |
| Phase | P4B corrective #2（选区 copy/cut clipboard 证据 + 记录更正） |
| Run ID | `20260830-113140-p4b-clipboard-b91de0e` |
| Started | 2026-08-30T11:35:38+08:00（ENVIRONMENT.md 落盘 11:34:50，**早于**第一条 gate） |
| Finished | 2026-08-30T11:47:59+08:00 |
| Operator | Codex root executor |
| Environment | `./ENVIRONMENT.md` |
| Environment SHA-256 | `9e413755fffdfd07de3c52661df4d5b76b2e61b44b27729ff2357ee5c65b5a03` |
| Supersedes | `../20260830-102354-p4b-ime-7869de8` —— 补选区 clipboard 证据并登记 F-1 |
| Candidate diff SHA-256 | `3152d359a7fc59fca420f14e87d97097720bcb4e324f1ca8a30ccefef57885af` |

## Why this run exists

三条独立理由，任何一条都要求**新建 run-id** 而不是改历史：

1. **F-4（独立 Reviewer，Go 阻断项）**：P4B 的 source-based clipboard 合同此前只有一条证据
   （fence widget 的显式 copy 按钮）。基于**选区**的 copy/cut 载荷从未被回读。Reviewer 明确要求
   「补 cut 断言，在**新建 run-id** 下重跑全 gate」。
2. **F-1（最高优先级）**：提交 `7869de8` 曾回写已封存的 run `20260830-083435-p4b-corrective-a8c73de/`。
   Reviewer 要求「新建 corrective run 记录，在阶段文档中登记该事实与改动清单，**不得回滚**」。
   事实与清单已登记在 `validation/phases/P4B.md`，本 run 链接回它。
3. **F-2 / F-7 / F-8 / F-9**：记录与脚本层面的更正（见下）。

**产品源码零改动**：`git diff --stat b50e392 b91de0e -- src src-tauri markflow-core` 输出为空。
本次 corrective 只动 `e2e/**` 与 validation 记录。

## Gates（21 条，含退出码）

| ID | Gate | Status | Log |
| --- | --- | --- | --- |
| C01 | focused P4B Vitest (`src/lib/lossless`) | PASS (433 / 16 files) | `gates/C01-focused-unit.log` |
| C02 | all Vitest | PASS (845 / 51 files) | `gates/C02-npm-test.log` |
| C03 | TypeScript | PASS | `gates/C03-tsc.log` |
| C04 | production build | PASS | `gates/C04-build.log` |
| C05 | Core fmt | PASS | `gates/C05-core-fmt.log` |
| C06 | Core clippy | PASS | `gates/C06-core-clippy.log` |
| C07 | Tauri clippy | PASS | `gates/C07-tauri-clippy.log` |
| C08 | Core tests | PASS (**96**；7 targets + doc-tests) | `gates/C08-core-test.log` |
| C09 | Tauri tests | PASS (161) | `gates/C09-tauri-test.log` |
| C10 | byte contract | PASS (negative 93；详见日志) | `gates/C10-byte-contract.log` |
| C11 | OpenSpec strict | PASS | `gates/C11-openspec-strict.log` |
| C12 | OpenSpec all | PASS | `gates/C12-openspec-all.log` |
| C13 | archive sync | PASS | `gates/C13-archive-sync.log` |
| C14 | E2E build | PASS | `gates/C14-e2e-build.log` |
| C15 | desktop lossless | PASS (**30 passing**，较上一 run +2) | `gates/C15-e2e-lossless.log` |
| C16 | desktop smoke | PASS (5 passing / 5 skipped) | `gates/C16-e2e-smoke.log` |
| C17 | desktop regression | PASS (1 passing) | `gates/C17-e2e-regression.log` |
| C18 | desktop P0S | PASS (4 passing / 1 skipped) | `gates/C18-e2e-p0s.log` |
| C19 | desktop real CJK/Japanese IME | PASS (1 passing，中/日两目标全通过) | `gates/C19-e2e-ime.log` |
| C20 | desktop lossless-acceptance | **FAIL (EXIT=1)** — 已知腐烂，**不纳为 P4B gate** | `gates/C20-e2e-acceptance.log` |
| C21 | `git diff --check` over candidate range | **FAIL (EXIT=2)** — F-1 遗留空白行 | `gates/C21-diff-check-range.log` |

C16 的 `5 skipped` 与 C18 的 `1 skipped` 是**聚合入口**造成的显示口径
（`all-smoke.e2e.mjs` / `all-p0s.e2e.mjs` 通过 `register*Tests()` 引入被聚合文件，
后者顶层零测试，WDIO 计为 skipped），**不是覆盖缺口**。

## 选区 clipboard 证据（C15，F-4 闭合）

新增 `clipboardRoundTrip(type, from, to)`（`e2e/specs/lossless/p4b-widgets.e2e.mjs`），
用合成 `ClipboardEvent` + `DataTransfer` 走 CodeMirror **真实的** `handlers.copy / handlers.cut` 并回读载荷。

| 用例 | 断言 | 结果 |
| --- | --- | --- |
| `selection copy on the rendered surface yields exact Markdown source, not DOM text` | `defaultPrevented === true`；payload === `state.doc.sliceString(range)`；payload 含 ```` ```js title="keep" ```` 与 `const x = 1;`；DOM `textContent` 含 widget chrome「复制」且 ≠ payload；文档与磁盘字节不变 | ✓ |
| `selection cut payload is source, removes the range, and one Undo restores bytes` | `defaultPrevented === true`；payload === 被裁剪片段；`docAfter` === 前后拼接；一次 Cmd+Z 精确还原 | ✓ |

三条此前缺失、现在被证明的事实：

1. **选区 copy 的 plain-text payload 是完整 Markdown source，不是渲染 DOM 文本** —— 这是 P6
   `specs/typora-wysiwyg-editing/spec.md:62`「复制隐藏内容」场景与 `tasks.md` §7.6 直接依赖的合同；
   此前只有「结构上应当如此」的推理，现在有回读证据。
2. **cut 此前全项目零覆盖** —— 这是本 run 新增的第一条 cut 断言。
3. **这个合同由 CodeMirror 的 `copiedRange()` → `state.sliceDoc()` 提供，P4B 未自研剪贴板路径**。

实现上的两个坑（都已修，记录在代码注释里）：

- `handlers.copy/cut` 的前置条件是 `hasSelection(view.contentDOM, view.observer.selectionRange)`，
  即 DOM 选区 `anchorNode` 必须落在 `contentDOM` 内。DOM 选区由 observer **异步**同步，
  未同步时 handler 静默 `return false` 且不写 `clipboardData` —— 必须 `waitUntil`，否则测的是 harness。
- CodeMirror 的 `doc` 不可变：cut 的 dispatch 产生新的 `Text`。若沿用 dispatch 前捕获的
  `view.state.doc` 引用，读到的是裁剪**前**内容，断言会自欺欺人地通过。

## C20：lossless-acceptance 仍失败（已知，不纳为 P4B gate）

EXIT=1，2 passing / **13 failing**，与探测 1 完全一致。失败形态统一为
`Expected active document to be <fixture>.md`（`p2-acceptance.e2e.mjs:67`）。

**不纳为 P4B gate 的理由与完整取证**见
`validation/issues/20260830-p4b-lossless-acceptance-suite-rotted.md`（本 run 已补充第三次数据点，
并把初版「flaky」的措辞修正为**级联双峰**：失败从 P2-3 起连续到末尾，条数取决于文件切换
何时被卡住/是否自愈，而非逐用例随机红绿）。

代价如实记录：**P2-3 及其所属的 15 条 P1B/P2 验收用例目前无自动化回归保护。**
P4B 已用本 run 的两条新断言覆盖同一合同，但那是 P4B 的覆盖，不等于 P2-3 本身被保护。

## C21：候选 diff 存在空白行缺陷，且**不可在不二次篡改的前提下修复**

```
$ git diff --check b50e392 b91de0e
openspec/changes/refactor-lossless-live-preview/validation/evidence/P4B/
  20260830-083435-p4b-corrective-a8c73de/gates/C20-e2e-ime.log:140: new blank line at EOF.
exit=2
```

**这是 F-7 修正带来的真实收益**：C21 把上一 run 的「工作区 vs 索引」改成了
「候选范围 `b50e392..b91de0e`」，因此检测到了**已提交文件**里的空白问题；旧的 C19 口径检测不到。

缺陷落在 `20260830-083435-p4b-corrective-a8c73de/gates/C20-e2e-ime.log` —— 正是 F-1 中
`7869de8` **回写进已封存 run** 的那个文件。也就是说，**F-1 留下的伤疤是可被机器检测的**。

**处置：不修。** 修它必然要写入已封存的 run 目录，与 F-1「不得回滚/不得回写历史 evidence」
的处置原则直接冲突，也与 `P4B.md` 自己记下的教训（「corrective run 的目录一旦建立，
后续任何提交都不得再触碰它」）矛盾。

改为**如实登记为 FAIL**，并把处置权交 Program Owner：

- 选项 A（推荐）：保持不修，C21 在 P4B gate 集中标记为「已知、不可修、非产品缺陷」，
  后续阶段沿用同一口径；
- 选项 B：由 Program Owner 显式授权一次性的「卫生修复提交」，并单独留痕说明这是
  唯一一次例外。**执行流不会自行选 B。**

## 新发现：上一 run 的 C08 记录低估了 core 测试覆盖（记录准确性缺陷）

本 run 的 C08 实测 **96 passed**（40 + 18 + 4 + 3 + 17 + 8 + 6 + 0，7 个 test target + doc-tests）。
而 `20260830-102354-p4b-ime-7869de8/RUN.md` 的 C08 行写的是
「PASS (**0 tests**；core 当前无 test target)」。

回读该 run 的 `gates/C08-core-test.log`（7022 字节）后确认：**日志本身就有这 96 个测试**，
是 RUN.md 的汇总写错了（只读了 doc-tests 的尾部 `0 passed` 就下结论）。

- **不是回归**：两个 run 的日志逐 target 一致，均为 96。
- **是记录缺陷**：把 96 记成 0，等于让 gate 表里少了一整类证据，方向是**低估**覆盖，
  不是把失败伪装成通过。
- **处置**：不改写历史 `102354/RUN.md`（协议禁止），在此登记，并在 `P4B.md` 补记。

**教训**：汇总 gate 时不能只看日志尾部。多 target 的命令（cargo / 多 project）必须聚合
所有 `test result:` 行，否则会系统性漏计。

## Run hygiene

- ENVIRONMENT.md 于 11:34:50 落盘，第一条 gate 于 11:35:38 启动 —— **满足协议「先落环境、
  后跑 gate」的要求**。
  **已披露的偏差与更正**：本 run 曾于 11:32:20 先启动过一次 sweep，但当时 ENVIRONMENT.md
  尚未写完（11:33:11 才补上），属于协议偏离。执行流在 11:35:12 **主动中止**了该次 sweep
  （中断于 C13），未从中得出任何结论，也未保留任何判定；随后重写 ENVIRONMENT.md 时间戳并
  于 11:35:38 完整重跑。被中止那次的 C01–C13 日志已被本次重跑整体覆盖，
  目录内不存在两套日志。代价是约 3 分钟的低成本 gate。
- 桌面套件全程无其他 GUI 应用抢占前台（历史教训：Tencent Lemon / TextEdit / MusicTag /
  Chrome 抢前台会造成非确定性失败，属环境风险，不是 flake）。
- 所有桌面 gate 均以 `env NODE_OPTIONS=` 运行，以便 runner 自行管理 `e2e/artifacts/`。
- Swift helper `e2e/ime/activate` 由 spec 运行时用 `swiftc` 从源码编译，二进制已 gitignore。
- `.exit` 文件统一写为**纯退出码数字**（F-8：上一 run 的 C19 曾写成 `C19_EXIT=0`）。
- **本 run 的目录自建立后未被任何后续提交触碰**（F-1 的直接教训）。

## Environment adaptations

- 本 shell 使用受管 Node 22.22.2 / npm 10.9.7，与 `102354` run 同口径。
- `activate --info` 在采集瞬间报 `frontmost: WorkBuddy（IDE）`；这是采集时刻的前台应用，
  不代表 gate 执行时状态（`ime` 套件自身会用 `activate(.activateIgnoringOtherApps)` 拉前台）。

## Acceptance boundary

- 自动截图是视觉证据，不能替代人工主观验收。
- 合成 CSS zoom 是布局压力测试，不等于 OS 无障碍缩放结论。
- 真实 VoiceOver 朗读/焦点顺序、原生打印对话框、OS 强制高对比度仍需解锁桌面的人工验收。
- 剪贴板证据来自**合成 ClipboardEvent 走真实 handler 路径**，不是系统 pasteboard 的端到端回读
  （桌面 WebView 内无法可靠读取系统 pasteboard）。**需人工验收补上系统级 Cmd+C/Cmd+X →
  外部应用粘贴**这一环；该人工项仍为 PENDING。
- 本 run 只偿还中文 + 日文两种**平台已安装**的输入源。

## 裁决（执行流不自我批准）

| 项目 | AI | Reviewer | Human | Go |
| --- | --- | --- | --- | --- |
| `P4B-SUBSTRATE-GO` | PASS（19/21；两条 FAIL 均非产品缺陷且已取证） | PENDING | PENDING | **PENDING** |
| `P4B-ITEM-task-checkbox-GO` | PASS | PENDING | PENDING | PENDING |
| `P4B-ITEM-code-fence-controls-GO` | PASS | PENDING | PENDING | PENDING |
| `P4B-ITEM-frontmatter-GO` | PASS | PENDING | PENDING | PENDING |
| `P4B-ITEM-raw-html-GO` | PASS | PENDING | PENDING | PENDING |
