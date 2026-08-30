# Validation Run Record — P6 M2a (strong / emphasis / strike / inline code hidden markers)

状态：**AI GATE GREEN** — 独立 Reviewer 复核 NOT STARTED；人工桌面验收 / Program Owner Go 均 NOT STARTED。
实现 AI 不自行批准 Go（GOAL 治理）。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P6 — Typora 式基础 Markdown 编辑 |
| Run ID | `20260830-184903-p6-m2a-228220b` |
| Date/time | 2026-08-30T18:52:40+0800 |
| Agent/operator | Implementation AI（WorkBuddy 发财树），受 `validation/GOAL-executor-typora-complete.md` 治理；本会话为实现角色，非 Go 批准者 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract`（GOAL 记录的分支例外） |
| Start commit SHA | `b949fb047d8c239a455719684a3e3d08153f6064` |
| Candidate commit | `228220b`（实现提交；本 evidence run 提交在其之上，故 run 目录以候选哈希命名且不自引用） |
| Candidate diff SHA-256（排除 `validation/**`） | `fe9d3158a3431312af6546305dbc6efda597625eb2d4378a19467ea0d55a2077` |
| Dirty status | 干净（`228220b` 已提交；仅用户提供的 GOAL 未跟踪并排除） |
| Feature flags | M2a 四个构造的 `livePreview.<construct>` 与 `livePreview.<construct>.hidden`，默认 OFF |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Environment snapshot SHA-256 | `05a378cd391642fffcb893dfa1898f61ce55fb89626198cfe3f4b05acf1ff68b` |
| Prior sealed run | `20260830-180950-p6-m1-corrective-4f010c3`（M1，独立 Reviewer PASS，Go 待人工 + Owner） |

## Scope

tasks.md **§9.4（M2a）** 的隐藏 marker，以及 **§9.8** 中可由单测证明的部分。

- 实现（候选 `228220b`，5 个文件）：
  - `src/lib/lossless/livePreviewFlags.ts`：新增 `strong` / `emphasis` / `strikethrough` /
    `inlineCode` 各自的 projection 与 `.hidden` 分离开关（默认 OFF），并新增
    `PAIRED_INLINE_CONSTRUCTS` 常量供投影层与交互层共用同一份「配对行内」定义。
  - `src/lib/lossless/projection.ts`：`buildHiddenConstruct` 增加配对行内分支 —— 成对 marker
    各自 `Decoration.replace({})` 并发布为**两个独立 atomic span**，content 区间保留语义
    class。malformed（marker ≠ 2 或重叠）回 `dimmed`，空 content 回 `visible` 保持可发现。
    导出 `pairedInlineGeometry` 供交互层复用同一几何（不重复解析）。
  - `src/lib/lossless/projection.ts`：**修正 marker 归属缺陷**——祖先构造原先会认领嵌套构造
    自己的 delimiter（`**`code`**` 让 strong 拿到 4 个 marker 而非 2 个），现改为「marker 归
    最内层包含它的构造」。此前内层 CodeMark 会被外层重复打 `.mf-marker`，且配对几何判定会
    误判为 malformed。既有 `GOLDEN` parity 全部保持不变（62/62 含原 47 条）。
  - `src/lib/lossless/hiddenMarkerInteraction.ts`（新增）：ADR 边界删除契约。
  - `src/lib/lossless/losslessSourceEditor.ts`：将新 keymap 接入基础扩展栈（开关 OFF 时惰性）。
  - `src/lib/lossless/projection.test.ts`：新增 **15** 条 M2a 单测。
- 未改动：`editor.css` 及任何样式文件（Q3 CSS 修未捆绑）、任何 Rust 文件、任何
  M2b/M3/image/widget 代码路径。

## Commands（全部 no-cache / fresh，防 stale-cache 假绿）

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | **PASS (clean, exit 0, 0 lines)** | `gates/C01.tsc.log` |
| C02 | `npx vitest run --no-cache`（全量，强制定） | **PASS (873/873)** | `gates/C02.vitest.log` |
| C02b | `npm test`（等价 `vitest run`） | **PASS (873/873)** | `gates/C02b.npmtest.log` |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | **PASS (62/62)** | `gates/C03.projection.log` |
| C08 | `npm run test:byte-contract` | **PASS (L0 24/23; L1 95/93)** | `gates/C08.byte-contract.log` |
| C10 | `npx openspec validate --all` | **PASS (61/61)** | `gates/C10.openspec.log` |
| C11 | `npm run build`（`CODEBUDDY_SAFE_DELETE_ENABLED=0`） | **PASS (built 4.85s)** | `gates/C11.build.log` |

> C01 首跑曾报 1 条 `TS6196: 'M2aConstruct' is declared but never used`（我留下的未使用类型
> 别名），已删除后重跑 clean。**该错误出现在 evidence 采集过程中、未在任何报告中报绿**，
> 此处主动披露。
>
> 未复跑项：Rust gates（C04 `cargo fmt` / C05 `cargo clippy` / C06 `cargo test` markflow-core /
> C07 `cargo test` src-tauri）与桌面 E2E（C12 build / C13 smoke / C14 lossless）。本 cohort 为
> **纯 TypeScript 投影层**，未触碰任何 Rust 代码，故沿用 M1 封存 run 的绿结果。

## Fixtures and byte results

- 字节合同（C08）：L0 positive 24/24、negative 23/23；L1 positive 95/95、negative 93/93。
- M2a 隐藏 marker 为 projection-only decoration：开启/关闭 marker 均不改变 L0/L1 字节，
  单测以 `view.state.doc` **对象同一性**（`toBe(docBefore)`）证明未派发任何 doc 变更事务，
  因此 History / dirty / revision 均不受影响。

## New unit tests (15)

| # | Test | Proves |
| --- | --- | --- |
| 1 | default OFF: 四个构造均 dimmed 不隐藏，doc 不变 | flag 默认 OFF，P4B 行为逐字节不变 |
| 2 | hidden: 四个构造各替换**两侧** marker、发布两个 atomic span、content 保 class | 9.1 隐藏 marker 机制 |
| 3 | nested `**\`code\`**`：内外各自独立隐藏，marker 归属正确 | 嵌套构造（marker 归属缺陷的回归测试） |
| 4 | input rule：补敲 `**` 成对后先 revealed，caret 离开后隐藏 | 输入成对即隐藏，不吞用户刚敲的字 |
| 5 | double-click 与跨 marker selection 均 reveal，离开后回 hidden | 9.8 caret 不落在不可见 source |
| 6 | rollback：`.hidden` OFF → 仅该构造 dimmed；construct OFF → source；bytes 不变 | 独立回滚 |
| 7 | 隐藏四个构造不派发 doc 变更事务（对象同一性） | History / dirty / revision 不变 |
| 8 | Backspace 在 closing `**` 后 → 删 content 一个 grapheme，**两侧 `**` 均保留** | 9.8 boundary delete 保留 paired syntax |
| 9 | Delete 在 opening `**` 前 → 删 content 首 grapheme，两侧 `**` 保留 | 同上（前向） |
| 10 | Backspace 在 opening `**` 后（内边界）→ **NoOp**，doc 逐字节不变 | 不得单独删除 delimiter |
| 11 | Delete 在 closing `**` 前（内边界）→ **NoOp**，doc 逐字节不变 | 同上（前向） |
| 12 | emphasis `*it*` 同一规则：少一个 grapheme，绝不少一个 `*` | 9.8 要求 strong **与** emphasis 分别验证 |
| 13 | surrogate pair 作为一个 grapheme 删除，无孤立半代理项 | UTF-16 安全 |
| 14 | flag OFF 时 Backspace 就是普通源码删除（真的删掉一个 `*`） | 交互层惰性 = 独立回滚 |
| 15 | 非空 selection 走普通源码删除，不走边界规则 | ADR 对显式 sweep 的定义 |

## Rollback proof (要点)

- **独立逐构造**：只关 `strong.hidden` → strong 回 `dimmed`（`span.mf-marker` 内容为 `**`），
  同文档内 `inlineCode` 仍 `hidden`，`hiddenAtomic` 由 4 条降为 2 条。证明开关彼此独立。
- **双层回退**：关 `.hidden` → dimmed；再关 construct → source fallback。每一步后
  `view.state.doc.toString()` 与原文全等。
- **交互层惰性**：新增 keymap 常驻基础扩展栈，但 `boundaryHitAt` 在开关 OFF 时返回 `null`
  → handler 返回 `false` → 由默认 keymap 执行普通源码删除（测试 14 断言真的删掉 `*`）。
- **字节不变**：测试 7 以 `EditorState.doc` 对象同一性证明隐藏 marker 未派发任何 doc 变更
  事务（比字符串/长度比较更强）。

## Scope discipline

- `git diff --stat b949fb0 228220b -- . ':(exclude)**/validation/**'` = 5 files,
  718 insertions(+), 9 deletions(-)。**无 `.css`、无 Rust、无 M2b/M3 文件**。
- Q3 CSS 修（`.mf-hr:not(.mf-construct)`）**未**混入本 cohort。
- 未做任何超出 §9.4/§9.8 单测可证范围的产品改动。

## PENDING-MANUAL（真实桌面验收，非本 run 可证）

- 真实 CJK / 日文 IME composition 期间的隐藏 marker 行为（单测只覆盖 `composing` 纯函数分支）。
- Screen reader / a11y descriptor 读取 source range。
- Normal / Large 文档 SLO 与长时稳定观察。
- 三平台（macOS/Windows/Linux）桌面回归。
- 视觉基线（visible/dimmed/hidden/revealed 与三主题）。

## Evidence immutability

- `bash scripts/check-evidence-immutable.sh 8ba0f44 HEAD` → **EXIT=0**（仅新增 run 目录，
  未改写/删除任何已封存 run）。

## Independent review

- Reviewer: NOT STARTED（待主会话派发独立 sub-agent）
- Review status: NOT STARTED

## Human acceptance

- Human validator: NOT STARTED
- Status: NOT STARTED

## Program decision

- Owner: NOT STARTED（Program Owner = xian）
- Decision: NOT STARTED（实现 AI 不自行批准 Go）
