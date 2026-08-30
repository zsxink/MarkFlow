# Validation Run Record — P6 M2b (inline / reference / autolink 隐藏 marker)

状态：**AI GATE GREEN** — 独立 Reviewer 复核 NOT STARTED；人工桌面验收 / Program Owner Go 均 NOT STARTED。
实现 AI 不自行批准 Go（GOAL 治理）。

## Identity

| 字段 | 值 |
| --- | --- |
| Phase | P6 — Typora 式基础 Markdown 编辑 |
| Run ID | `20260830-210103-p6-m2b-6865575` |
| Date/time | 2026-08-30T21:01:03+0800 |
| Agent/operator | Implementation AI（WorkBuddy 发财树），受 `validation/GOAL-executor-typora-complete.md` 治理；本会话为实现角色，非 Go 批准者 |
| Repository root | `/Users/xian/Project/book/MarkFlow` |
| Branch | `test/issue-255-lossless-byte-contract`（GOAL 记录的分支例外） |
| Start commit SHA | `bae6def0a12ab4470efee37fc7200ee66aee671b`（M2a evidence HEAD） |
| Candidate commit | `6865575`（实现提交；本 evidence run 提交在其之上，故 run 目录以候选哈希命名且不自引用） |
| Candidate diff SHA-256（排除 `validation/**`） | `6c102378985ce7a9d0fe92222a28e111b1dd194bd430303e0b7fc979295cda81` |
| Dirty status | 干净（`6865575` 已提交；仅 GOAL 未跟踪并排除） |
| Feature flags | link 各形态 `livePreview.link` 与 `livePreview.link.hidden`，默认 OFF |
| Immutable environment snapshot | `./ENVIRONMENT.md` |
| Prior sealed run | `20260830-184903-p6-m2a-228220b`（M2a，独立 Reviewer PASS，Go 待人工 + Owner） |

前置：M2a 独立 Reviewer 复核 = **PASS**（`.../20260830-184903-p6-m2a-228220b/REVIEW.md`），
本 cohort 与 M2a 改同一批文件（`livePreviewFlags.ts` / `projection.ts` /
`hiddenMarkerInteraction.ts` / `projection.test.ts`）。

## Scope

tasks.md **§9.5（M2b）** 的隐藏 marker，以及 **§9.8** 中可由单测证明的部分。

- 实现（候选 `6865575`，5 个文件）：
  - `src/lib/lossless/livePreviewFlags.ts`：新增 `link` 构造（`livePreview.link` projection /
    `livePreview.link.hidden` hiding，默认 OFF），并接入 `clsToLivePreviewConstruct('mf-link')`。
  - `src/lib/lossless/projection.ts`：
    - `classifyLezerNode` 延用 M1 thematicBreak 模式：仅当 `isLivePreviewProjectionOn('link')` ON 时
      将 `Autolink` / `LinkReference` 提升为本地 `mf-link` 构造（默认 OFF 保持 GOLDEN parity）。
    - 新增 M2b 非对称多段几何：`linkFormGeometry`（导出，纯函数）+ `LinkSub`/`LinkFormGeometry`。
      在 buildDecorations 迭代中捕获 URL / LinkTitle / LinkLabel 子节点，分配给最内层 link-form
      构造；`buildHiddenConstruct` 增加 link 分支：inactive 隐藏全部 LinkMark + dest/title/label，
      仅留显示文本（design §9.2）。
  - `src/lib/lossless/hiddenMarkerInteraction.ts`：新增 `linkBoundaryHit` —— link 边界删除保留
    paired syntax（Backspace 在 link 末 → 删 link 文本末 grapheme、骨架保留；内边界 NoOp；
    定义行仅在 delimiter 邻接处 NoOp）。
  - `openspec/.../design/phases/P6-true-wysiwyg-hidden-markers.md`：新增 §9 M2b 状态机/几何/
    分类门控/malformed/边界删除/受限项注脚。
  - `src/lib/lossless/projection.test.ts`：新增 **17** 条 M2b 单测（值导入，无 `import type` 当值用）。
- 未改动：`editor.css` 及任何样式文件、任何 Rust 文件、任何 M3/image/widget 代码路径、
  `tasks.md`（**未勾选 §9.5/§9.8，未自批准 Go**）。

### 明确声明（prompt §交付给主会话）

1. **产品源码相对 M2a 候选 `228220b` 的 diff 范围**：设计文档 1 个 + 产品代码 3 个 +
   测试 1 个（`livePreviewFlags.ts` / `projection.ts` / `hiddenMarkerInteraction.ts` /
   `projection.test.ts` + `P6-*.md` design 注脚）。无 `.css`、无 `.rs`、无 `tasks.md` 改动。
2. **是否引入新范式**：**无**。沿用既有 `Decoration.replace` + `EditorView.atomicRanges` +
   `Decoration.mark`，复用 9.2 `resolveConstructVisibility`、9.7 flag 分离与 9.1 底座。
   link 是新的构造类型，但机制同一（走 hidden→replace+atomic 路径），仅几何解析为 M2b 新增纯函数
   `linkFormGeometry`（导出供单测），非新交互/渲染范式。
3. **link「活动态」采用哪种行为**：采用**设计 §2 规范的整条 `revealed`**（caret/selection 进 link →
   整条链接源码揭示，含 dest/title 可**就地编辑**），**不新增 active-field 边状态**。
   理由见 design §9.1：① 设计 §2 已定义 `revealed` = 整条揭示，天然满足 §9.5“活动时显示并编辑
   dest/title”；② 字段级揭示是新范式且与冻结定义冲突、风险高，留待 P7 增强候选。
4. **reference dest 编辑**：**降级（受限项）**。reference link 的 destination 在定义行、不在引用点
   本行 —— MVP **不实现跨位置就地编辑 dest**。降级方案：reference 激活（revealed）时显示完整
   `[text][ref]` 含标签供导航；destination 在**定义行**编辑——定义行 inactive 时保持 dest URL 可见
   （只隐藏 `[ref]:` 标签），active 时整行揭示可就地编辑。已在 design §9.6 与本 RUN.md 声明为受限项，
   **未静默做一半**。

## Commands（全部 no-cache / fresh，防 stale-cache 假绿）

| ID | Command | Status | Output path |
| --- | --- | --- | --- |
| C01 | `npx tsc --noEmit` | **PASS (clean, exit 0)** | `gates/C01.tsc.log` |
| C02 | `npx vitest run --no-cache`（全量，强制定） | **PASS (890/890)** | `gates/C02.vitest.log` |
| C02b | `npm test`（等价 `vitest run`） | **PASS (890/890)** | `gates/C02b.npmtest.log` |
| C03 | `npx vitest run --no-cache src/lib/lossless/projection.test.ts` | **PASS (79/79)** | `gates/C03.projection.log` |
| C08 | `npm run test:byte-contract` | **PASS (L0 24/23; L1 95/93)** | `gates/C08.byte-contract.log` |
| C10 | `npx openspec validate --all` | **PASS (61/61)** | `gates/C10.openspec.log` |
| C11 | `npm run build`（`CODEBUDDY_SAFE_DELETE_ENABLED=0`） | **PASS (built 3.58s)** | `gates/C11.build.log` |

> **主动披露**：新写 M2b 测试首跑曾报 **6 条断言失败**（均为此前流程的**测试算术错误**，
> 非实现缺陷）：手算的 Unicode 偏移错误（reference shortcut 的 `[b]` 起始位、nested `[**b**](u)`
> 的 url/`)` 位、autolink 节点边界、active 编辑清除 range、flag-OFF 期望串多删一个字符）以及
> malformed 测试文档中 `[oops]` 实为**合法 shortcut reference**（2 marker，隐藏属于正确行为）。
> 全部修正测试断言 / 文档后重跑 **clean（890/890）**。**首跑报红未在任何报告中报绿** —— 与 M2a
> 标准一致。
>
> 未复跑项：Rust gates（C04-C07）与桌面 E2E（C12-C14）。本 cohort 为**纯 TypeScript 投影层**，
> 未触碰任何 Rust 代码（`git diff bae6def 6865575 --stat` 确认 `.rs = 0 处`），沿用 M1 封存绿结果。

## Fixtures and byte results

- 字节合同（C08）：L0 positive 24/24、negative 23/23；L1 positive 95/95、negative 93/93。
- M2b 隐藏 marker 为 projection-only decoration：开启/关闭 marker 均不改变 L0/L1 字节，
  单测（`hiding links dispatches no doc-changing transaction`）以 `view.state.doc` **对象同一性**
  证明未派发任何 doc 变更事务，因此 History / dirty / revision 均不受影响。

## New unit tests (17)

| # | Test | Proves |
| --- | --- | --- |
| 1 | inline `[text](url)` 隐藏 `[ ] ( )`+url，仅留 text；bytes 不变 | 9.5 inline 隐藏 |
| 2 | inline `[text](url "title")` 也隐藏 title | 9.5 title 隐藏 |
| 3 | autolink `<https://x>` 隐藏 `< >`，URL 可见 | 9.5 autolink（含分类门控） |
| 4 | reference full `[text][ref]` 隐藏 `[ ] [ref]`，仅留 text | 9.5 reference full |
| 5 | reference collapsed `[]` / shortcut `[text]` 仅留 text | 9.5 collapsed/shortcut |
| 6 | 定义行 `[ref]: dest` 隐藏 `[ref]:`，dest 可见 | 9.5 定义行 |
| 7 | active（caret 在 link）→ 整条 revealed，dest/title 可就地编辑 | 9.5 硬性要求（活动可编辑 dest/title） |
| 8 | 嵌套 `[**b**](u)`：link 骨架 + strong `**` 各自隐藏，仅留加粗 b | 9.8 嵌套构造 |
| 9 | malformed link 精确回源码（不隐藏、不半隐藏） | 9.5 malformed 回源码 |
| 10 | `linkFormGeometry` 纯函数 inline/autolink/reference/definition 几何精确 | 几何解析正确性（值导入） |
| 11 | 隐藏 links 不派发 doc 变更事务（对象同一性） | History / dirty / revision / bytes 不变 |
| 12 | Backspace 在 inline `)` 后 → 删 link 文本 grapheme，`[ ] ( )`+url 保留 | 9.8 boundary delete 保留 paired syntax |
| 13 | Delete 在 inline `[` 前 → 删 link 文本首 grapheme | 同上（前向） |
| 14 | Backspace 在 autolink `>` 后 → 删 URL grapheme，`< >` 保留 | 同上 |
| 15 | Backspace 在 reference `]` 后 → 删 link 文本 grapheme，`[ ] [ref]` 保留 | 同上 |
| 16 | 内边界（开 `[` 后）→ NoOp，doc 逐字节不变 | 不得单独删除 delimiter |
| 17 | flag OFF → 普通源码删除（真的删掉 `)`），handler 惰性 | 交互层惰性 = 独立回滚 |

## Rollback proof (要点)

- **独立逐构造**：`link` 有独立 `livePreview.link`（projection）与 `livePreview.link.hidden`
  （hiding）开关。关 `.hidden` → link 回 `dimmed`（全部 source 可见 + marker 弱化）；关 construct →
  source。每一步后 `view.state.doc.toString()` 与原文全等（单测隐式）。
- **双层回退**（design §8）：关 link.hidden → dimmed；关 link construct → source；关 Live Preview →
  同一 CM Source。均不回到 serializer。
- **交互层惰性**：`hiddenMarkerInteraction` 的 link 分支在 `isLivePreviewHiddenOn('link')` OFF 时
  `boundaryHitAt` 返回 null → handler 返回 false → 默认 keymap 普通源码删除（测试 17 断言真的删掉
  `)`）。
- **字节不变**：测试 11 以 `EditorState.doc` 对象同一性证明隐藏 marker 未派发任何 doc 变更事务。
- `linkFormGeometry` 对 naked URL（markers=[]）返回 null → 不隐藏（dimmed），杜绝半隐藏。

## 受限项与风险评估（主动披露）

1. **reference dest 就地编辑**：MVP 不实现跨位置写入；destination 经定义行编辑（见 Scope 声明 4）。
2. **定义行边界删除**：仅 NoOp 保护 `[ref]:` label，不删除 dest grapheme（与 inline/reference 的
   文本删除规则不对称）；dest 经定义行普通 caret 编辑。
3. **grapheme 切分**：沿用 M2a `stepGrapheme`（UTF-16 surrogate 安全）；组合字符 / ZWJ / 变体选择符
   的集群切分不完整（M2a Reviewer Q3 同款 Minior）——仅 flag ON 触发、不破坏字节。
4. **link 内 image**（`[![a](img)](url)`）：image 属 M3/P7 范围，本 cohort 不处理其链接内容嵌套
   的特殊语义；仅 link 骨架隐藏照常。

## Scope discipline

- `git diff --stat bae6def 6865575 -- . ':(exclude)**/validation/**'` = 5 files,
  729 insertions(+), 7 deletions(-)。**无 `.css`、无 Rust、无 M3/image/widget 文件、无 `tasks.md`**。
- Q3 CSS 修（`.mf-hr:not(.mf-construct)`）**未**混入本 cohort。

## PENDING-MANUAL（真实桌面验收，非本 run 可证）

- 真实 CJK / 日文 IME composition 期间的 link 隐藏 marker 行为。
- Screen reader / a11y descriptor 读取 source range（含 link text/dest）。
- Normal / Large 文档 SLO 与长时稳定观察（link 几何解析 + 子节点捕获开销）。
- 三平台（macOS/Windows/Linux）桌面回归。
- 视觉基线（visible/dimmed/hidden/revealed 与三主题），尤其 inactive 只显示 link text、
  reference 定义行显示 dest、active 整条 reveal 的观感。

## Evidence immutability

- `bash scripts/check-evidence-immutable.sh bae6def HEAD` → 见提交后复查（须 EXIT=0）。

## Independent review

- Reviewer: NOT STARTED（待主会话派发独立 sub-agent）

## Human acceptance

- Human validator: NOT STARTED
- Status: NOT STARTED

## Program decision

- Owner: NOT STARTED（Program Owner = xian）
- Decision: NOT STARTED（实现 AI 不自行批准 Go）
