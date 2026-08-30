# Goal（Codex 执行 sub-agent）：完成 Typora 式 MarkFlow 编辑器重构（P4B 收尾 → P6 → P7 → P5）

> **角色分工（遵循 Program 治理，见 `design/00-program-governance.md`）**
> - 本 Goal 给 **Codex 执行 sub-agent**（模型 `gpt-5.6-terra`，reasoning effort `high`）——负责「实现 + AI gate + 验证记录」。
> - **主会话负责调度与中途验收**：决定每个阶段/每个 slice 何时派发、接收结果、派独立 Reviewer、**执行各阶段（P4B/P6/P7）的人工验收**、收集 Program Owner 决策。不要把「调度/独立 Review/人工验收/Program Owner Go」的责任交给执行 sub-agent。
> - 你的角色是 **实现 AI**：读设计、实现 scope、补测试、跑 AI gate、写验证记录。**你不得自己批准最终 Go**；Go/No-Go 由独立 Reviewer + 人工验收 + Program Owner 四者齐备后由主会话记录。
> - **人工验收责任划分（用户唯一约定）**：用户只负责**最终产品验收**（P5 结束后的最终 Release 验收）。**中途各阶段（P4B/P6/P7）的人工验收一律由主会话或主会话派发的独立 Reviewer/验收人执行，用户不参与**。因此 P4B/P6/P7 的「人工验收」栏位应由主会话或其派出的验收人填写并视为该阶段已通过，不要等用户，也不要把未填的人工验收当作阻塞该阶段完成的原因；只有 **P5 结束的最终产品验收必须由用户本人执行/签字**。
> - 派发时由主会话指定模型 `gpt-5.6-terra` 与 reasoning `high`。本 Goal 为「阶段无关的全局约束 + 各阶段执行目标」，主会话按 `P4B → P6 → P7 → P5` 顺序一次或分批喂给 sub-agent。

---

## 0. 你正在做什么（一句话）

把 MarkFlow（Tauri v2 + Rust + CodeMirror 单一 surface 的桌面 Markdown 编辑器）从「无损 Source 闭环 + 基础 Live Preview」推进到**定义内的 Typora 式所见即所得编辑**，最后清理 legacy 并归档 umbrella change。你只负责实现层，调度与验收由主会话接管。

## 1. 当前状态与唯一入口（先读，别跳过）

- 分支：`test/issue-255-lossless-byte-contract`（唯一工作分支，Program Owner 已批准在此分支 + umbrella change `refactor-lossless-live-preview` 连续完成 P0S–P7 + 最后 P5；**禁止新建 issue/branch/child change/阶段 PR**）。
- umbrella change：`openspec/changes/refactor-lossless-live-preview/`。
- 已完成的纵向闭环：**P0 / P0S / P1A / P1B / P2 / P3 / P4A（终态 `SPIKE_COMPLETE_NO_CORE_IR`）** 均已 Go；P4B 进行中。
- **P4B 已完成部分**（最近提交，`git log` 从新到旧）：
  - 10adb84 P4B 基础设施：cohort 独立 flag（默认 OFF）+ widget protocol 契约定义
  - 9f518d1 7.1 五个 marker cohort reveal 精修 + 7.2 验收矩阵（flags 默认 OFF）
  - b3ddc64 7.4 task checkbox + code fence 控件 widget 双 pilot（默认 OFF）
  - 7ae85fb 7.5 父子 editable slot 仲裁 helper + core 运行时拒绝 + debug snapshot（默认 OFF）
  - 6432059 7.7 FrontMatter/raw HTML 安全策略：source-only 投影 + fail-closed 分类（默认 OFF）
- 详细进度以 **`tasks.md`** 为准（每个任务有是否勾选）；阶段约束以 **`design/phases/`** 对应文档 + **`validation/phases/`** 对应验证记录为准。**本 Goal 是外挂速记，权威定义始终是 tasks.md + design/phases + validation/phases + adr/**。

**开工前 15 分钟必读（主会话可直接把这些路径塞给 sub-agent）：**
- `AGENTS.md`、`CLAUDE.md`、`.claude/rules/*`（branch-first、git-commit、css-layout、line-numbers、调试规则）
- `.claude/memory/MEMORY.md`（踩坑记录）
- `openspec/changes/refactor-lossless-live-preview/design/00-program-governance.md`（角色/证据等级/Go-No-Go/回滚）
- `openspec/changes/refactor-lossless-live-preview/validation/VALIDATION-PROTOCOL.md` 与 `validation/templates/RUN-RECORD.md`（证据怎么写）
- 对应阶段：`design/phases/P4B/P6/P7/P5-*.md` + `validation/phases/{P4B,P6,P7,P5}.md` + 相关 ADR（`adr/adr-typora-projection-interaction-contract.md`、`adr/adr-typora-structural-interaction-matrix.md`、`adr/adr-parser-source-map-render-ir.md`）
- 若仓库有 `.codegraph/`，用 `codegraph explore` 定位代码，别盲目 grep。

## 2. 全局约束（任何阶段都适用）

1. **flags 默认 OFF / 可回滚**：所有新 construct/visibility/widget 默认 OFF，走各自独立 flag。关闭 flag 回到同一 CodeMirror source range 的 dimmed 或完整源码，**不得**返回 serializer 保存、不切换正文 owner、不重建文档、不改 doc/History/dirty/revision/bytes。P6 分离 `livePreview.<construct>` 与 `livePreview.<construct>.hidden`，关闭 hidden 回到 dimmed。
2. **单一 source truth**：CodeMirror `EditorState.doc` 是唯一正文；projection 只产出 decorations/widgets（`Decoration.replace` / `atomicRanges`），**禁止** CSS 零宽 marker、DOM-string History、widget DOM 入正文、删除 doc 中 marker。clipboard/save/History/a11y 都读 source range，不读 DOM `textContent`。
3. **字节契约 L0/L1**：打开后零编辑 `prepare_save` 必须回放原始 bytes（BOM/EOL/尾部换行/未触及 span 全保留）；局部编辑只能改目标 span。任何「未编辑 bytes 改变 / 编辑非尾部正文导致尾部或未触及 span 改变」都是强制 No-Go。
4. **不做**：不引入 serialzer 保存路径、`getMarkdown/setMarkdown/normalizeImageMarkdown`、ProseMirror/Tiptap 运行时；`coreRenderIr` 不得出现（P4A 终态）。Core IR / Render IR schema 均为 NOT APPLICABLE。
5. **证据等级**：P4B/P6/P7 需 E1–E4（unit/property/golden → bridge/integration → desktop E2E → visual/IME/a11y），P6 必须有**真实 CJK/日文 IME**，P7 高风险 renderer 必须有安全证据；P5 需 E1–E5（含三平台稳定性观察）。
6. **证据不可变**：每次运行从 `validation/templates/RUN-RECORD.md` 复制记录到 `validation/evidence/<phase>/<run-id>/RUN.md`，同目录写不可变 `ENVIRONMENT.md` 并算 SHA。失败命令要记录所有尝试与退出码，flaky 进 `issues/`；历史 evidence 不回写。阶段未四者齐备不得在 tasks.md 勾选完成。
7. **gate（每个候选都要跑并记录）**：`npm test`、`npx tsc --noEmit`、`npm run build`、`cargo test --manifest-path markflow-core/Cargo.toml`、`cargo test --manifest-path src-tauri/Cargo.toml`、`npm run test:byte-contract`、`npx openspec validate refactor-lossless-live-preview --strict`、`npx openspec validate --all`、`npm run test:e2e:build` + 桌面 WebKit E2E（`node e2e/run.mjs lossless|smoke|regression|p0s`，用 embedded WebDriver）。
8. **不做最终决策**：实现完成 → 报告给主会话（含 commit SHA、flags、gate 输出、PENDING-MANUAL 清单）。独立 Reviewer（fresh context，重跑关键命令，写 `REVIEW.md`）、人工桌面验收（写 HUMAN-ACCEPTANCE）、Program Owner Go/No-Go 均由主会话编排。修正任何 corrective 都要建新 run-id。

## 3. P4B 收尾（当前进行中）— 目标：`P4B-SUBSTRATE-GO` + 各 `P4B-ITEM-<name>-GO/NO-GO`

权威：`design/phases/P4B-widgets-cohorts.md` + `validation/phases/P4B.md` + `tasks.md` §7。

> 本阶段内的「人工验收」一律由**主会话派出的验收人**执行并在 `validation/phases/P4B.md` 签名，**不等待用户**；用户不参与 P4B 人工验收（见顶部「人工验收责任划分」）。

已完成实现（不需重做）：7.1 visibility/reveal API、7.2 interaction harness、7.4 widget protocol、7.5 owner registry/仲裁、7.7 FrontMatter/raw HTML policy。**未完成**：7.2a（table ADR harness：只冻结 fixtures/widget 接口/预期，**不实现 table widget**）、7.3（真实 CJK/日文 IME 证据债）、7.6（task checkbox / fence controls 的完整验证）、7.9（每项独立 gate）、7.10（两个层级 checkpoint）。

本阶段目标（交付给主会话）：
1. **7.2a**：表驱动 ADR harness，P4B 逐行实现 heading/list/quote 并记录 source before/after、affected ranges、selectionAfter、单一 History group。
2. **7.3**：在真实 Tauri WebView 偿还真实中文/日文 IME（composition start/update/end 邻 marker 不丢字、不取消、一次 Undo）——至少可用平台各一轮真实证据。
3. **7.6/7.9**：为 task checkbox、fence controls、FrontMatter、raw HTML 各自跑 unit/desktop semantic/visual/IME/keyboard/a11y/security/failure injection/L1/rollback，独立记录 maturity/default/fallback。
4. **7.10**：产出**两个分离 checkpoint**——`P4B-SUBSTRATE-GO`（共用 interaction harness + 真实 IME 基线 + visibility/atomic/clipboard/a11y + owner registry + widget protocol + flag rollback 全过，且不改 doc/History/dirty/revision/bytes）和每项 `P4B-ITEM-<name>-GO/NO-GO`。
5. 边界纪律：image / GFM table / Mermaid / PlantUML **不实现**，移 P7，保持 exact source fallback；P4B 不输出 `hidden`（只 visible/dimmed/revealed）；marker hiding 由 P6 交付。

**勿遗漏的验收埋点**：空 heading/list/quote/fence 可发现、Select All 不整篇闪烁、Undo 落点在 marker、composition 起始于 marker 邻域、跨 nested construct 选区。任何 selection trap / 输入丢失 / 错误 source patch / 安全问题 / 不可回源码 → 阻止 SUBSTRATE-GO。

## 4. P6 — 目标：基础 Markdown 达 Typora 式所见即所得（5 cohorts Go）

权威：`design/phases/P6-true-wysiwyg-hidden-markers.md` + `validation/phases/P6.md` + `tasks.md` §9。

前置：`P4B-SUBSTRATE-GO`。做完后只实现 visibility output + construct polish，不重建协议。

1. **9.1** `Decoration.replace` + `EditorView.atomicRanges` 隐藏 marker；atomic descriptor 区分 `hidden-marker` 与 `deletePolicy=whole`；marker boundary delete 先 reveal 再删 content grapheme（保留 paired syntax），不直接删 delimiter。
2. **9.2** 统一 visibility resolver：visible/dimmed/hidden/revealed；composition 强制 reveal 或冻结安全投影（非持久状态）。
3. **cohort 逐批交付（默认 OFF，各自独立 flag + 证据 + Reviewer + 人工验收）**：
   - M1 (9.3)：heading / paragraph / thematic break（空 heading placeholder、Enter/Backspace、块级布局稳定）
   - M2a (9.4)：strong/emphasis/strike/inline code（nested、input rule、double-click、跨 marker selection）
   - M2b (9.5)：inline/reference/autolink（活动时编辑 destination/title；malformed 精确回源码）
   - M3a (9.6)：quote + ordered/unordered/task list
   - M3b：fence + P4B task/fence/FrontMatter 联动；空构造保持可发现
4. **9.7** projection 与 hidden 分离 flag（`livePreview.heading` / `.hidden`）；关 hidden 回 dimmed、关 construct 回 source，不改 doc/History/dirty/revision。
5. **9.8** 每 cohort：P4B 矩阵、Select All 不闪烁、plain-text copy/cut 含 source、真实 CJK IME、screen reader、Normal/Large SLO、L0/L1、独立回滚；分别验证 strong/emphasis/link hidden-marker boundary delete 保留 paired syntax，image/widget 仅 `deletePolicy=whole` 时整段删除。
6. **9.9** 基础 construct 支持矩阵 + Reviewer/人工/Program Owner 决定 **P6 Go**。P6 Go ≠ program 完成。

## 5. P7 — 目标：富块编辑与支持矩阵收口（image/table/Mermaid/PlantUML + P4B 项收口）

权威：`design/phases/P7-typora-complete-rich-blocks.md` + `validation/phases/P7.md` + `tasks.md` §10。

前置：`P4B-SUBSTRATE-GO` + P6 Go。owner 仲裁固定（最小不可信 source-fallback 压制内部投影；list 让出 task checkbox；paragraph 让出 image range；table widget 持有结构 shell/delimiter、仅可信 cell content slot 内允许 P6 inline local owner；owner handoff 单次状态更新，无重复 decoration 帧）。

1. **10.1** 收口 task/fence/FrontMatter/raw HTML 与 P6 hidden 联动；复杂 FrontMatter/raw HTML 保持可解释 source fallback。
2. **10.2 内联图片 widget**：文档流渲染、click/select、alt/path/title/replace/delete、资源事务、broken URL/权限/大图失败回退、alt a11y；只覆盖目标 alt/path/title source range，**不全文重写**；read-only 不提交；export/print 读 Core snapshot + 安全 renderer，不读 widget DOM。
3. **10.3** GFM table cell 矩阵：Arrow/Tab/Enter/Escape/Home/End、selection/composition、inline Markdown、一次操作一次 Undo、cell edit 只改 content range（键盘规则以 `adr-adr-typora-structural-interaction-matrix` 唯一规定）。
4. **10.4** table 结构操作：alignment、row/column add/delete/move；声明全部 affected ranges；surviving cell/delimiter/padding/EOL 逐 span L1 golden；不可信结构整表回源码、不半渲染。P4A 无 Core IR 时须证明 Lezer local ranges 足以支撑每项操作，否则保持 source fallback。
5. **10.5 Mermaid**：source/preview 双态、sandbox、CSP、timeout/cancel/stale、恶意源码/SVG fuzz、Retry/export、失败回退、viewport lifecycle。
6. **10.6 PlantUML**：明确本地/用户配置远程通道、发送前第三方提示、protocol/redirect/DNS/IP/SSRF/CSP/size/timeout/SVG sanitize；无安全通道保持源码。
7. **10.7/10.8** 每 item 独立 flag/owner/矩阵/Reviewer/人工/回滚；生成**正交发布支持矩阵**（release class ∥ projection maturity ∥ default state 分开列），由 Program Owner 签署。image/table 为 `WYSIWYG-required` 且 Normal/Large 默认 ON。
8. **10.9** Program Owner 签署全部 release-scope 必达项。No-Go 强制条件：未触及 bytes 改变、widget DOM 入正文、selection trap、资源补偿失败、XSS/SSRF/未授权网络、stale 跨文档应用、失败后不可回源码。
9. 完成特性边界：不得宣称「Typora 完全体」；公式/footnotes/TOC/callouts 等非 scope 项明确声明 source fallback。

## 6. P5（最后执行）— 目标：最终发布门禁、稳定观察与 Legacy 清理（program 终点）

权威：`design/phases/P5-release-legacy-cleanup.md` + `validation/phases/P5.md` + `tasks.md` §8。

> **P5 是 program 的最后阶段，编号虽在 §8 但执行顺序是最后一个**（P4B → P6 → P7 → P5）。

前置全部满足：P3 Go、P4A `Program-Accepted`（此人类验收降级/性能验证须在 P5/归档前完成）、`P4B-SUBSTRATE-GO`、P6 Go、P7 Go、P7 支持矩阵签署、无未解决数据/安全/跨文档/selection/IME/资源问题。

1. **8.1–8.4** 三平台（macOS/Windows/Linux）release candidate 验证；canonical byte / Typora marker / task/image/table/diagram / autosave / external conflict / 真实 IME / a11y / security / export 工作流；light/dark/sepia + visible/dimmed/hidden/revealed/composing/empty/degraded/source-fallback + 富块视觉基线；各 ≥8h/≥2 sessions 稳定观察 + 10k transaction/1k save-reconcile/1k mode-switch/100 projection-widget-failure-injection soak。
2. **8.5** 审计并删除 ProseMirror/Tiptap、serializer、`getMarkdown/setMarkdown`、`trailingNewlines`、`normalizeImageMarkdown`、隐藏 DOM、无效 CSS/dependencies/tests；保留只读 renderer 且明确不可回写正文。清理后回滚单位为应用版本。
3. **8.6/8.6.1** 重跑 canonical L0/L1、TS/build、Core/Tauri、desktop semantic、P6/P7 visual/IME/keyboard/a11y/security/performance 与 archive gates；三平台最终默认配置零编辑 open→两 autosave tick→Ctrl+S→close→reopen，记录 dirty/save count/hash/length/mtime。
4. **8.7** 独立 Reviewer 静态走查 cleanup diff 并重跑 `npm test`、`npx tsc --noEmit`、关键 Rust/E2E；serializer/双 owner/必达体验回退/数据安全 → 拒绝合入。
5. **8.8** 全部 delta specs 同步到 main specs，跑 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`。
6. **8.9** 归档 umbrella change，更新 Issue #254/tracking/最终支持矩阵。完成归档、所有 gates 绿、独立 Reviewer + 人工 + Program Owner 批准后，才可宣称「定义内的 Typora 式体验重构完成」。

> **最终产品验收（唯一由用户执行的验收）**：P5 归档完成、三平台与总体验证通过后，主会话把最终 Release 候选（commit/flags/三平台安装包或产物 + 验收清单）交给**用户本人**做最终产品验收并签字；此步不得由主会话派出的验收人代替。用户签字通过后才算 program 终点。

## 7. 每个阶段给主会话的回执（完成实现时的必交件）

- 阶段 start commit、flags、前置 Go 摘记；
- 每个子项的 commit checkpoint（`git log` 可查、可独立 revert）；
- `validation/evidence/<phase>/<run-id>/RUN.md` + 不可变 `ENVIRONMENT.md` + hash + gate 输出（退出码/测试数/失败名/重试）；
- PENDING-MANUAL 清单（需在真实桌面/真 IME 验收的项，例如视觉、screen reader、长时稳定、真人 IME）。**P4B/P6/P7 的清单由主会话派出的验收人执行并签名即可视为完成；只有最终产品验收（P5 后）由用户本人执行**；
- 你给出的 AI Go/No-Go **建议**（最终 Go 始终由主会话编排的 Reviewer + 人工 + Program Owner 定）。

> 在任务未到你该做的阶段（例如 P4B-SUBSTRATE-GO 未记录）时不得跳过或声称进入下一阶段。任何阶段数据损坏 / 错误写盘 / 跨文档污染 / blocked pipeline / 真实 UI 只显示源码 → 立即停下并回主会话，转 No-Go 处理，而不是自己补跑混过。
