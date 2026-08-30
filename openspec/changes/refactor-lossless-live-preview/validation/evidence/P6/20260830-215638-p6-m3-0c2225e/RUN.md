# Validation Run Record — P6 M3 (quote / ordered / unordered / task / fence 隐藏 marker)

状态：**AI GATE GREEN** — 独立 Reviewer 复核 NOT STARTED；人工桌面验收 / Program Owner Go 均 NOT STARTED。
实现 AI 不自行批准 Go（GOAL 治理）。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P6 — Typora 式基础 Markdown 编辑 |
| Run ID | `20260830-215638-p6-m3-0c2225e` |
| Date/time | 2026-08-30T21:56:38+0800 |
| Agent/operator | Implementation AI（WorkBuddy 发财树），受 `validation/GOAL-executor-typora-complete.md` 治理；本会话为实现角色，非 Go 批准者 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract`（GOAL 记录的分支例外） |
| Start commit SHA | `fa7d186418cf2906663febac59d5c1fc82baed82`（M2b evidence HEAD） |
| Candidate commit | `0c2225e`（实现提交；本 evidence run 提交在其之上，故 run 目录以候选哈希命名且不自引用） |
| Candidate diff SHA-256（排除 `validation/**`） | `6882897430aeacbca46fa9d4393ca6b4c3cc625ddaf3e3f8edd11d33c5d8c5b1` |
| Dirty status | 干净（`0c2225e` 已提交；仅 GOAL 未跟踪并排除） |
| Feature flags | quote/list/fence 各形态 `livePreview.quote` / `livePreview.list` / `livePreview.fence`
  与 `.hidden`，默认 OFF |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Prior sealed run | `20260830-210103-p6-m2b-6865575`（M2b，独立 Reviewer PASS，Go 待人工 + Owner） |

前置：M2b 独立 Reviewer 复核 = **PASS**（`.../20260830-210103-p6-m2b-6865575/REVIEW.md`），
本 cohort 与 M2b 改同一批文件（`livePreviewFlags.ts` / `projection.ts` /
`hiddenMarkerInteraction.ts` / `projection.test.ts`）。

## Scope

tasks.md **§9.6（M3）** 的块级隐藏 marker，以及 **§9.8** 中可由单测证明的部分。

- 实现（候选 `0c2225e`，5 个文件）：
  - `src/lib/lossless/livePreviewFlags.ts`：新增 `quote` / `list` / `fence` 构造（各自的
    `livePreview.<c>` projection / `<c>.hidden` hiding，默认 OFF），接入
    `clsToLivePreviewConstruct('mf-blockquote'|'mf-list-item'|'mf-fence')` 与
    `LIVE_PREVIEW_CONSTRUCTS`。
  - `src/lib/lossless/projection.ts`：新增三个导出纯函数 `blockQuoteGeometry` /
    `blockListGeometry` / `blockFenceGeometry`（沿用 M2b `linkFormGeometry` 的
    「先解析子节点、再算隐藏 range」模式）；`buildHiddenConstruct` 增加 block 分支；
    `buildDecorations` 捕获 FencedCode 的直接子节点（`CodeMark`/`CodeInfo`/`CodeText`）
    进 `fenceSubsByConstruct`（**不动 fence 的冻结空 markers**）。空块复用既有 `visible`
    态保持可发现；unclosed fence → `dimmed`（精确回源码，不 half-hidden）。
  - `src/lib/lossless/hiddenMarkerInteraction.ts`：新增 `blockBoundaryHit` + `fenceMarksAt`
    （块级边界删除保留块骨架：quote/list/fence 的开 marker 边界 NoOp、fence 闭 ``` 前 NoOp；
    flag OFF 时返回 false 交回默认）。`fenceMarksAt` 从 syntax tree 解析（不用冻结 markers）。
  - `openspec/.../design/phases/P6-true-wysiwyg-hidden-markers.md`：新增 §10 M3 块级几何/
    空块/P4B 联动/malformed/边界删除注脚。
  - `src/lib/lossless/projection.test.ts`：新增 **21** 条 M3 单测（值导入，无 `import type`
    当值用）。
- 未改动：`editor.css` 及任何样式文件、任何 Rust 文件、任何 M3 外代码路径、`tasks.md`
  （**未勾选 §9.6/§9.8，未自批准 Go**）。

### 明确声明（prompt §交付给主会话）

1. **产品源码相对 M2b 候选 `6865575` 的 diff 范围**：设计文档 1 个 + 产品代码 3 个 +
   测试 1 个（`livePreviewFlags.ts` / `projection.ts` / `hiddenMarkerInteraction.ts` /
   `projection.test.ts` + `P6-*.md` design §10 注脚）。无 `.css`、无 `.rs`、无 `tasks.md`。
   仅限本 cohort 需要的文件，无 Q3 CSS 修混入。
2. **是否引入新范式**：**无**。沿用既有 `Decoration.replace` + `EditorView.atomicRanges` +
   `Decoration.mark`，复用 9.2 `resolveConstructVisibility`、9.7 flag 分离与 9.1 底座。
   quote/list/fence 是块级构造，但机制同一（hidden→replace+atomic 路径），几何解析新增纯函数
   （同 M2b `linkFormGeometry` 范式），无新交互/渲染范式；空块**不新增状态**（复用 `visible`）。
3. **quote/list/fence 各自 owner 判定 + P4B 联动**：三者默认 owner 均 `local`（可隐藏）——
   `blockquote` / `listItem` / `fence` 由 `DEFAULT_OWNERS` 默认 `local`，`classifyLezerNode`
   即产 `mf-blockquote`/`mf-list-item`/`mf-fence` 构造。P4B 联动：
   - `taskCheckbox` owner 为 `widget`——它拥有 `[ ]`/`[x]` TaskMarker（buildDecorations 对
     widget 跳过），list 隐藏只局部于 ListMark `-`/`1.`，**checkbox 永不被 list 隐藏**；
   - `codeFenceControls` owner 为 `widget`——拥有开 fence 的语言徽标/复制控件 slot，fence
     隐藏与其并存（body 仍可 copy）；
   - `frontmatter` owner 为 `source-fallback`——**不隐藏**（§9.6 的「与 FrontMatter 联动」
     指不破坏其 source fallback）。
4. **空 block 的「可发现」实现方式**：复用既有 `visible` 态 + `blockIsEmpty(geo, doc)`
   判据（design §4）。空 quote（content 除 `>` 外 trim 空）→ `> ` 保留；空 list item（marker
   后无文本）→ bullet/number/checkbox 保留；空 fence（CodeText 空/缺）→ shell + language
   保留（`blockFenceGeometry` 对无 body 返回空 body 区间，`blockIsEmpty` 判空 → `visible`）。
5. **块级 boundary delete 与 structuralInteraction 共存判定**：二者同为 `Prec.highest`，
   `structuralInteractionKeymap` 先安装（losslessSourceEditor.ts L221）→ 结构 Backspace
   （退 quote 层 / 退 list 级）先消费并返回 true，hidden handler 不再见到；hidden 的
   `blockBoundaryHit` 只保护「单删 marker 会破坏骨架」的内边界（开 marker 后 / 闭 fence 前 →
   NoOp），二者不重叠。flag OFF 时 block 分支惰性（`hiddenCapable` 检查 `.hidden` 开关）。

### 主动披露（首跑报红后修复项，均当场修正后重跑 clean）

首跑 M3 单测曾报 **11 条**失败，均为**测试期望/几何偏移**问题，当场修正后重跑 clean（911/911）：
- 可见 content 的前导空格（`.mf-list-item` textContent 含 marker 后空格，如 `' apple'`；
  坚块 marker 只隐藏 `-`/`>`，空格保留——测试期望改为含空格）。
- 手标偏移（task 第二个 bullet 实际 `[11,12)` 非 `[8,9)`；fence 闭 ``` 实际 `[19,22)` 非
  `[18,21)`；quote 多行 span 分块，textContent 断言行改为按 contentDOM 断言）。
- 空 block 的 DOM 期望（空 quote `visible` 时 marker 作 content 显示，非 `.mf-marker`）。
- rollback 的 flag 关闭后需 dispatch selection（非空 `view.dispatch()`）以触发 rebuild。
- **实现修正 1 条**（非测试）：`fenceMarksAt` 的 `resolveInner(range.from, 0)` 在 fence 起始
  边界返回 `Document` 根（side:0 偏好节点边界），找不到 `FencedCode` → 改为
  `resolveInner(range.from + 1, 0)`（开 ``` 内），fence 开边界 NoOp 生效。
**首跑报红未在任何报告中报绿** —— 与 M2a/M2b 标准一致。

## Commands（全部 no-cache / fresh，防 stale-cache 假绿）

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | **PASS (clean, exit 0)** | `gates/C01.tsc.log` |
| C02 | `npx vitest run --no-cache`（全量，强制定） | **PASS (911/911)** | `gates/C02.vitest.log` |
| C02b | `npm test`（等价 `vitest run`） | **PASS (911/911)** | `gates/C02b.npmtest.log` |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | **PASS (100/100)** | `gates/C03.projection.log` |
| C08 | `npm run test:byte-contract` | **PASS (L0 24/23; L1 95/93)** | `gates/C08.byte-contract.log` |
| C10 | `npx openspec validate --all` | **PASS (61/61)** | `gates/C10.openspec.log` |
| C11 | `npm run build`（`CODEBUDDY_SAFE_DELETE_ENABLED=0`） | **PASS (built 3.56s)** | `gates/C11.build.log` |

> 未复跑项：Rust gates（C04-C07）与桌面 E2E（C12-C14）。本 cohort 为**纯 TypeScript 投影层**，
> 未触碰任何 Rust 代码（`git diff fa7d186 0c2225e --stat` 确认 `.rs = 0 处`），沿用 M1 封存绿结果。

## Fixtures and byte results

- 字节合同（C08）：L0 positive 24/24、negative 23/23；L1 positive 95/95、negative 93/93。
- M3 隐藏 marker 为 projection-only decoration：开启/关闭 quote/list/fence marker 均不改变
  L0/L1 字节，单测（`hiding quote / list / fence dispatches no doc-changing transaction`）
  以 `view.state.doc` **对象同一性**证明未派发任何 doc 变更事务，因此 History / dirty /
  revision 均不受影响。

## New unit tests (21)

| # | Test | Proves |
| --- | --- | --- |
| 1 | quote 隐藏每个 `>`，引文可见；bytes 不变 | 9.6 quote 隐藏 |
| 2 | unordered list 隐藏 `-`，item 文本可见 | 9.6 unordered |
| 3 | ordered list 隐藏 `1.`/`2.` marker | 9.6 ordered |
| 4 | task list：隐藏 `-` 但 `[ ]`/`[x]` checkbox 保留（P4B widget 不重复隐藏） | 9.8 P4B 联动 |
| 5 | fence 隐藏开/闭 ``` + language，code body 可见 | 9.6 fence |
| 6 | 空 quote 留 `>`（可发现） | §4 空构造 |
| 7 | 空 list item 留 bullet（可发现） | §4 空构造 |
| 8 | 空 fence 留 shell + language（可发现） | §4 空构造 |
| 9 | malformed（unclosed）fence 精确回源码（不隐藏） | 9.6 malformed |
| 10 | `blockQuoteGeometry`/`blockListGeometry`/`blockFenceGeometry` 纯函数几何精确（值导入） | 几何解析正确性 |
| 11 | rollback：`.hidden` OFF → dimmed；construct OFF → source；bytes 不变 | 9.8 独立回滚 |
| 12 | 隐藏 quote/list/fence 不派发 doc 事务（对象同一性） | History/dirty/revision/bytes 不变 |
| 13 | Backspace 在 quote 开 `>` 后 → NoOp，`>` 保留 | 9.8 block 边界删除保留 |
| 14 | Backspace 在 quote 末 → 删 content grapheme，`>` 保留 | 9.8 block 边界删除 |
| 15 | Delete 在 quote `>` 前 → NoOp | 同上 |
| 16 | Backspace 在 list `-` 后 → NoOp，bullet 保留 | 同上 |
| 17 | Backspace 在 fence 闭 ``` 前 → NoOp（不删 backtick） | 同上 |
| 18 | Backspace 在 fence 开 ``` 后 → NoOp | 同上 |
| 19 | Delete 在 fence 开 ``` 前 → NoOp | 同上 |
| 20 | flag OFF → 普通源码删除（handler 惰性） | 9.8 交互层惰性 = 独立回滚 |
| 21 | task checkbox 不进 hiddenAtomic（P4B widget linkage） | 9.8 不重复隐藏 |

## Rollback proof (要点)

- **独立逐构造**：`quote` / `list` / `fence` 各有独立 `livePreview.<c>`（projection）与
  `<c>.hidden`（hiding）开关。关 `.hidden` → 回 `dimmed`（全部 source 可见 + marker 弱化）；
  关 construct → source。每一步后 `view.state.doc.toString()` 与原文全等（单测隐式 + 测试 11 显式）。
- **双层回退**（design §8）：关 `<c>.hidden` → dimmed；关 `<c>` construct → source；关
  Live Preview → 同一 CM Source。均不回到 serializer。
- **交互层惰性**：`hiddenMarkerInteraction` 的 block 分支在 `isLivePreviewHiddenOn(<c>)` OFF
  时 `blockBoundaryHit` 返回 null → handler 返回 false → 默认 keymap 普通源码删除
  （测试 20 断言真的删掉 marker 邻接字符）。`structuralInteraction` 先装、独立处理结构 Backspace。
- **字节不变**：测试 12 以 `EditorState.doc` 对象同一性证明隐藏 marker 未派发任何 doc 变更事务。
- `blockFenceGeometry` 对 unclosed fence 返回 null → 不隐藏（dimmed），杜绝 half-hidden。

## 受限项与风险评估（主动披露）

1. **块级省略显示（ellipsis/多行折叠）**：本 cohort **不实现**整 block 折叠成省略号（那是
   P7/支持矩阵范围，prompt 明确不在本 cohort）。只做 marker 隐藏 + 空构造可发现 + 边界删除保留。
2. **可见 textContent 前导空格**：块 marker 只隐藏 `>`/`-`/`1.`/```，marker 后的空格保留 —
   quote/list 可见文本带一个前导空格（视觉 polish 项，不影响字节/atomic 正确性）。
3. **fence 闭边界**：`Backspace @ closeFrom` 为 NoOp（保留 ```），不像行内闭 delimiter 那样
   删 body grapheme——块 marker 是开头式，骨架保留优先。
4. **grapheme 切分**：沿用 M2a/M2b `stepGrapheme`（UTF-16 surrogate 安全）；组合字符 / ZWJ /
   变体选择符的集群切分不完整——仅 flag ON 触发、不破坏字节。

## Scope discipline

- `git diff --stat fa7d186 0c2225e -- . ':(exclude)**/validation/**'` = 5 files,
  889 insertions(+), 3 deletions(-)。**无 `.css`、无 Rust、无 M3 外文件、无 `tasks.md`**。
- Q3 CSS 修（`.mf-hr:not(.mf-construct)`）**未**混入本 cohort。

## PENDING-MANUAL（真实桌面验收，非本 run 可证）

- 真实 CJK / 日文 IME composition 期间 quote/list/fence 隐藏 marker 行为。
- Screen reader / a11y descriptor 读取 block source range（含 quote 文本 / code body）。
- Normal / Large 文档 SLO 与长时稳定观察（块级几何解析 + fence 子节点捕获开销）。
- 三平台（macOS/Windows/Linux）桌面回归。
- 视觉基线（visible/dimmed/hidden 与三主题），尤其 quote/list 前导空格、fence 语言徽标与
  P4B 控件并存、空块可发现的观感。

## Evidence immutability

- `bash scripts/check-evidence-immutable.sh 8ba0f44 HEAD` → 见提交后复查（须 EXIT=0）。

## Independent review

- Reviewer: NOT STARTED（待主会话派发独立 sub-agent）

## Human acceptance

- Human validator: NOT STARTED
- Status: NOT STARTED

## Program decision

- Owner: NOT STARTED（Program Owner = xian）
- Decision: NOT STARTED（实现 AI 不自行批准 Go）
