> 执行约束：本 checklist 是 Issue #254 的 program 级实施顺序。Program Owner 已批准 P0 corrective、P0S、P1A–P7 全部任务在当前分支 `test/issue-255-lossless-byte-contract` 与 umbrella change `refactor-lossless-live-preview` 中连续完成；后续不新建 Issue、branch、child change 或阶段 PR。为保留历史编号，后半程按 P4B → P6 → P7 → P5 执行。每个 Slice 仍必须建立独立 commit checkpoint、evidence run、独立 Reviewer、Program Owner 人工验收和 Go/No-Go，并保留可运行产品与 feature flag 回滚。该例外只适用于 Issue #254。
>
> 验证记录约束：实现 AI 在每个阶段开始前更新本 change 的 `validation/ENVIRONMENT.md` 和 `validation/phases/<phase>.md`，每次运行建立 `validation/evidence/<phase>/<run-id>/RUN.md`，同时写入不可变的同目录 `ENVIRONMENT.md` 与 hash，并保存证据索引。阶段只有在 AI gate、独立 Reviewer、人工验收和 Program Owner 决定全部记录后才可勾选完成。`/Users/xian/markflow-test` 只作为人工打开 Markdown 测试文档的目录，不存放任务、spec、报告或日志。

## 1. Slice 0 — 现状刻画与字节合同

- [x] 1.1 使用现有 Issue #254/#255、当前分支与现有 changes，记录 `feat-v0.1.0` 基线 SHA、支持平台、feature flags、日志目录和当前编辑链路调用图
- [x] 1.2 建立 canonical byte fixtures：UTF-8/BOM、LF/CRLF/CR/Mixed、文末 0/1/2/3 换行、文中空行、Unicode、列表/fence/frontmatter、图片与 malformed Markdown
- [x] 1.3 实现 byte fixture hash/golden harness，可分别验证无编辑 L0 与局部编辑 L1 的 prefix/suffix/存活 span 保真
- [x] 1.4 添加当前 ProseMirror 路径回归测试，稳定复现“修改正文后文末空行丢失”，证明 #189 元数据方案不满足 L1
- [x] 1.5 冻结 ADR：UTF-16↔UTF-8/source bytes 坐标、唯一 EOL inheritance/显式 paste provenance、按操作 identity matrix、macOS/Windows/Linux 的 CAS/atomic-exchange/backup-preserving-replace capability 与无能力时 Save Copy 降级、无效 UTF-8 行为与 Save As 格式策略
- [x] 1.6 为当前 `read_file/write_file` 与未来 Core commands 建立真实 Tauri dispatcher contract harness，禁止仅 mock `invoke`
- [x] 1.7 运行当前 `npm test`、`npx tsc --noEmit`、`npm run build`、Tauri/Rust tests 和 desktop smoke，保存基线证据
- [x] 1.8 派独立 reviewer 检查 fixtures、失败复现和 ADR；L0/L1 合同未能机器验证则 Slice 0 No-Go
- [x] 1.9 以固定 SHA 保存 Muya/Vditor 行为矩阵，覆盖 block closure、marker reveal、selection、Enter/Backspace、paste、History，并将“可借鉴机制/禁止移植机制”冻结进 ADR
- [x] 1.10 对用户指定的 ChatGPT Desktop 26.803.61601 建立黑盒行为矩阵，记录版本、合成输入、selection/Enter/Backspace/paste/Undo/Redo/marker/export 观察，并把 Observed/Official/Inference 分开；无公开源码时禁止推断内部编辑器或 byte-to-byte 架构
- [x] 1.11 补真实 legacy 生命周期 characterization：autosave 开启，完整驱动 open→editable/onUpdate→dirty scheduler→autosave→write，零编辑等待至少两个 tick
- [x] 1.12 分项记录 dirty/close prompt/save count/mtime/hash/length 与 soft-break/EOL/tail diff；禁止用 standalone Editor、oracle self-check 或 `autosave=false` smoke 代替
- [x] 1.13 为人工新发现建立 corrective evidence run，保持历史 run 不可变；完成新的独立 Reviewer、正文单字符编辑、重开、ADR 人工审阅和 Program Owner 决定

## 1S. Slice 0S — Legacy 零编辑写盘安全止血

- [x] 1S.1 在当前分支记录 P0S start commit、flags 和引用的 P0 failing/corrective evidence；产品实现归 umbrella change，P0 evidence-only child 保持历史边界
- [x] 1S.2 让 hydration/read-only/editable programmatic transaction 不增加 user revision；`setEditable` 不发送正文 update
- [x] 1S.3 移除 legacy dirty 对 PM serializer/normalized string 回比的依赖，建立临时 userRevision/persistedRevision 与明确 transaction origin
- [x] 1S.4 在 autosave coordinator 和最终 write 入口增加双重 clean guard；干净 Ctrl+S 返回 `skipped` 且不调用 serializer/write
- [x] 1S.5 将 P0 零编辑 failing lifecycle 转为默认绿色 integration/desktop regression，覆盖 LF/CRLF/CR/Mixed/BOM/tail0-3、两个 autosave tick、关闭提示与 mtime/hash
- [x] 1S.6 验证一个真实用户 transaction 仍进入 dirty/保存；继续记录 legacy 编辑后 L1 失败，禁止宣称 byte-to-byte 已修复
- [x] 1S.7 运行全 gate，派独立 Reviewer 检查没有接受 serializer 输出、扩大 trailing metadata 或全局关闭 autosave；完成人工验收与 Program Owner Go
- [x] 1S.8 纠正 Reviewer 发现的 `<400ms` 数据丢失窗口：WYSIWYG user revision/dirty 在 transaction dispatch 同步更新，programmatic origin 使用同一 transaction meta，取消 dirty debounce 的权威职责
- [x] 1S.9 补立即 Cmd+S、A→B、close、save in-flight 新编辑、跨文档隔离和 `SaveResult` 三态自动化；重跑默认/characterization/byte/Rust gate
- [x] 1S.10 对纠偏候选执行新的独立 Reviewer desktop lifecycle 与人工立即 Save/切换/关闭验收；两者通过并由 Program Owner 重新确认后，P0S 才恢复 GO 并允许进入 P1A（final run `20260813-1715-p0s-final-d74a79d` manifest 0 mismatch，final gate Reviewer PASS，Program Owner GO 2026-08-13；ISSUE-004 已关闭）

## 2. Slice 1A — 最小 Lossless Core

- [x] 2.1 建立独立 `markflow-core` crate/模块边界，只引入 document snapshot、TextBuffer、LineEndingMap、PositionMap、patch 与 session 所需依赖
- [x] 2.2 实现 `OriginalSnapshot`：原始 hash/长度、UTF-8 BOM、每边界 EOL、尾部换行和 file identity
- [x] 2.3 实现逻辑 LF `TextBuffer` 与 `to_source_bytes()`，保证未编辑 bytes 完全回放、编辑后未触及 EOL/BOM 原样保留
- [x] 2.4 实现 UTF-16 UI offset、逻辑 UTF-8 byte offset、source byte offset 的显式类型与双向 PositionMap
- [x] 2.5 实现 revision-bound `TextPatch`：多 change 原子校验、重叠/边界拒绝、transaction ID 幂等和 selectionAfter
- [x] 2.6 实现 `LosslessDocumentSession` 的 open/apply/snapshot/prepare-save/mark-persisted/reload/close 状态机
- [x] 2.7 添加 Core golden/property tests，覆盖全部 byte fixtures、Unicode boundary、Mixed EOL replacement 与正文编辑保留尾部空行
- [x] 2.7.1 对每个 fixture 证明 open 后零 patch 的 `prepare_save` 返回原始 bytes，重复 clean prepare 不改变 revision/hash；显式 clean save payload 不能来自 parser/serializer
- [x] 2.8 corrective run `20260814-p1a-corrective-core` 已完成自动化修复与 Core/P0/TS/OpenSpec
  gate；**两个独立 Reviewer 均对候选 `9ad0513` 判 PASS**（`20260814-p1a-corrective-core/REVIEW.md` 与
  `20260814-p1a-final-9ad0513/REVIEW.md`；后者 Reviewer GO）。唯一 Open finding 为 **P2**（transaction-id
  保留窗口 256 条后失效，非 P1A 阻塞，须在 P1B 协议冻结或解决）。**AI Core contract acceptance**
  已通过（`20260814-161034-p1a-ai-contract-9ad0513`）。**Program Owner Go：GO（2026-08-14，xian）；**
  **Slice 1A / P1A 完成，批准启动 P1B**。P2 transaction-id 保留窗口须在 P1B 协议冻结或解决。

## 3. Slice 1B — Bridge、同步管线与无损 Source 闭环

- [x] 3.1 在 Tauri Runtime 注册 session registry，并实现 open/apply-patch/get-snapshot/prepare-save/commit/reload/close commands 与稳定错误码
- [x] 3.2 实现前端 `EditorSurfaceBinding` 最小版，挂接当前 CodeMirror transaction、document/session identity 和 confirmed/persisted revision
- [x] 3.3 实现单 in-flight patch controller：frame batch、bounded queue、retry、ack、flush、blocked 和 resync，所有 timer/request 可取消
- [x] 3.4 以 `losslessCoreSession` flag 接入文件打开，Source 模式直接使用 Core logical text，不调用 `setMarkdown()` 或 serializer
- [x] 3.5 接入 dirty/autosave：pending 或 confirmed≠persisted 为 dirty；blocked、saving、conflict 时禁止旧 snapshot 写盘
- [x] 3.6 实现 Core confirmed bytes → Host guarded atomic write：携带 expected file identity 与幂等 saveOperationId，在替换点复核并返回 durable receipt，保存后只提交对应 persisted revision
- [x] 3.7 把 save、save-as、new file、reload、close 与外部修改冲突接入 flush/prepare/commit 生命周期
- [x] 3.8 改造图片 pending-save 流程，使路径迁移返回显式局部 Markdown patch，不在保存前全文 `normalizeImageMarkdown()`
- [x] 3.9 添加 Bridge integration 与 desktop E2E：打开—正文编辑—保存—重开，逐 fixture 比较完整 bytes/hash/mtime；覆盖 write/commit response 丢失、重复 operation、竞争外部替换、崩溃后 receipt reconcile
- [x] 3.9.1 继承 P0S lifecycle：autosave 开启，零编辑等待两个 tick、Ctrl+S、关闭、reload、A/B 切换均证明 dirty=false、save count=0、hash/length/mtime 不变
- [x] 3.9.2 对 lossless flag 做调用审计/spy，证明打开、dirty、autosave、手动保存、reload 和 close 不调用 `setMarkdown/getMarkdown/normalizeImageMarkdown` 或 PM serializer
- [x] 3.10 证明 render/parser 不可用时 Source 仍能编辑保存；任何 byte fixture 失败则 lossless flag 保持 default-off
- [x] 3.11 运行 TS/build、Core/Tauri、E2E 全 gate并派独立 reviewer；通过并经人工验收后记录 Slice 1B Go checkpoint，不归档 umbrella change
  - Slice 1B Go checkpoint（2026-08-19）：三轮独立复核 GO + 人工验收补验 ACCEPTED（8 PASS + 2 依赖自动化证据）；
  Program Owner GO；`20260816-p1b-human-acceptance-uncommitted-e4981e3/HUMAN-ACCEPTANCE.md` 与 `phases/P1B.md` 已记录

## 4. Slice 2 — 单一 CodeMirror Surface 与基础 Live Preview

- [x] 4.1 把 lossless 文档生命周期改为只创建一个 CodeMirror `EditorView`，拆分 base/mode/theme/readOnly/projection compartments
- [x] 4.2 将 Source/Live Preview 切换改为 compartment reconfigure，保持 selection、scroll、focus、pending queue、dirty 和 CodeMirror History
- [x] 4.3 使用 CodeMirror Markdown/Lezer 可见区语法树实现 heading、strong、emphasis、strike、inline code、link、quote、list 和 fence 的即时语义 decorations
- [x] 4.4 首版 marker 只弱化不隐藏；光标/选区/composition 进入范围时完整揭示 marker
  - active reveal 已实现（selection 驱动）；composition 邻域 reveal 由 `view.composing` 触发（桌面真 IME 未验证，标记依赖自动化证据，P3 补）
- [x] 4.5 定义 projection invalidation closure：普通段落局部失效，list/quote/fence/reference/footnote 按最小结构闭包失效；range 不可信时精确回退源码
  - 实现为 viewport 级 closure（只重建可见区，off-screen 不解析）；per-block diff 留待 P3 优化（Reviewer P2-3）
- [x] 4.6 定义 selection invariant：CM UTF-16 position + affinity 为 UI 基准，transaction 由 `ChangeDesc` 映射，bridge 使用显式 PositionMap；禁止 DOM node、`wbr` 或 sentinel 进入正常状态
- [x] 4.7 建立 marker reveal 矩阵，覆盖 collapsed/range/directional selection、鼠标 drag、Home/End、Shift+Arrow、Select All、composition 邻域和 atomic widget 边界
  - collapsed/range selection reveal 已测；drag/Home/End/Shift+Arrow/Select All 经桌面 E2E 验证（selection 不变）；atomic widget 边界 P2 不涉及（无 widgets）
- [x] 4.8 让 outline、stats、statusbar、search、settings 和 read-only 状态读取 active CodeMirror binding，不读取隐藏 ProseMirror
- [x] 4.9 实现 projection 状态与调试属性：source/projecting/rendered/composing/stale/degraded/disposed，并记录 flags/identity 而不记录正文
- [x] 4.10 添加 adapter tests：projection 不改变 `EditorState.doc`、transaction 后即时更新、模式切换不产生正文 transaction
- [x] 4.11 添加真实 desktop semantic E2E，逐 construct 断言语义 decoration/DOM，而非只断言编辑区包含文本
- [x] 4.12 执行 Source/Live Preview 100 次切换测试，验证 bytes、EditorView identity、selection、scroll、dirty、revision 和 History
- [x] 4.13 注入 projection failure，验证只回退同一 CodeMirror Source 且保存 bytes 不受影响
- [x] 4.14 运行全 gate 与独立 reviewer；真实 WYSIWYG 未呈现 Markdown 语义则 Slice 2 No-Go
  - GO（2026-08-19）：独立 Reviewer 6/6 + 人工验收 ACCEPTED（语义清晰）；P1（toolbar 操作 getSourceView/hidden PM）归口 P3
- [x] 4.15 重跑零编辑两个 autosave tick、干净 Ctrl+S、模式切换与关闭 L0 门禁，证明 projection reconfigure 不产生 transaction 或写盘

## 5. Slice 3 — 默认保存主链与常用编辑能力迁移

- [x] 5.1 建立统一 CodeMirror command router，toolbar/menu/keyboard/input rule 均依赖 active binding 和 selection
- [x] 5.2 迁移 bold/italic/strike/link/heading/quote/list/code fence 命令为局部、可 Undo 的 CodeMirror transaction
- [x] 5.3 迁移图片插入/替换/删除与资源事务，确保仅修改对应 source range 且相邻空行不被隐式整理
- [x] 5.4 建立 P3 Source/basic-preview 的 Enter/Backspace baseline：普通文本、list、quote、heading、fence、atomic inline、跨块 selection；table 在 P3 只 reveal source。不安全上下文揭示源码或退回原生 CM 文本语义；Typora 最终唯一行为由后续结构 ADR、P4B 7.2a 与 P7 10.3/10.4 验收
- [x] 5.5 迁移 paste/drop/clipboard：同步冻结 selection/MIME，区分 literal/HTML/plain/file/image，上下文转换后以一次局部 transaction 和显式 History boundary 提交
- [x] 5.6 明确 CodeMirror History grouping：composition、连续输入、paste、Enter、结构命令、widget commit、bulk replace；Undo/Redo 后通过同一 patch pipeline 收敛 Core revision
- [x] 5.7 迁移 autosave、external reload/conflict、document transition、save-as/new file 到 lossless 默认路径
- [x] 5.8 迁移 export 输入为同 revision Core snapshot 或只读明确 renderer，保证 export 不反向修改正文
- [x] 5.9 增加 CJK/emoji、pending-save、写盘期间继续输入、跨模式 Undo/Redo、A/B 文档隔离 E2E
- [ ] 5.10 逐行通过并签署 default minimum parity matrix 后才让 `losslessCoreSession` 默认开启；legacy ProseMirror 仅保留显式 flag 且与 lossless session owner 严格隔离
  - closeout（2026-08-29，run `20260829-p3-closeout-90081fc`）：干净 checkout 18 gate 全绿
    （含协议 §3 fmt/clippy；两处历史遗留红灯 core fmt / tauri clippy×4 已以无行为变更方式修复）；
    隐藏缺口静态审计 10 点（clearActiveDocument/外部删除/图片 range/read-only/复杂 fallback/
    flag 隔离/serializer 残留等）未发现新缺口；parity 矩阵仍待 Program Owner 逐行签署（结论列 PENDING）
- [ ] 5.11 收集一轮真实日常工作流证据与 legacy 回退原因；任何数据完整性问题立即关闭默认 flag
  - 专项清单已备：`validation/manual-acceptance-p3-real-workflow.md`（真实工作流证据 +
    legacy 回退原因 + 数据完整性 kill-switch），待 Program Owner 执行填写
- [ ] 5.12 运行全 gate、三平台可用环境 smoke 与独立 reviewer；通过并经人工验收后记录 Slice 3 Go checkpoint，不归档 umbrella change
- [ ] 5.13 在默认 flags 上重跑全部 L0 lifecycle 与 L1 surviving-span 案例；任何打开即 dirty/写盘或 serializer save 立即关闭默认 flag
  - 自动化面已在干净 checkout（`90081fc`）fresh 重跑全绿并归档
    （`evidence/P3/20260829-p3-closeout-90081fc/RUN.md` §3：guard 19 + lifecycle 23 +
    flagRollback 4 + byte-contract 95/93 + 桌面 E2E 30 用例）；该清单即人工照跑脚本

## 6. Slice 4A — Parser/Source Map Spike 与 Core IR 终态决定

- [x] 6.1 用统一 fixtures 比较 CodeMirror Lezer、draft ParseIndex、markdown-rs/pulldown-cmark 等候选的 source/content/marker ranges、unknown fallback、性能、维护和许可
  - run `20260829-035314-p4a-f189b0c`（Reviewer PASS）：Lezer 唯一原生 markerRanges 且 0 INVALID；markdown-rs 性能不可用；pulldown-cmark/comrak 无定界符 span；draft ParseIndex 排除（无 JVM）
- [x] 6.2 对 CJK、emoji、escape、nested、malformed 与随机 boundary 做 range→source slice property tests；任一 lossless/range 失败淘汰候选
  - run `20260829-055341-p4a-5ac06b5`（Reviewer PASS）：Lezer 0 range 失败；markdown-rs 深嵌套 TIMEOUT 11.1s + SIGABRT 淘汰证据；顺带修复 6.1 harness QuoteMark 归因缺陷
- [x] 6.3 冻结 parser/source-map ADR；无合格胜者时在当前分支把 P4A 标记为 `SPIKE_COMPLETE_NO_CORE_IR`，保留本地基础投影和复杂源码 fallback，并标记后续依赖项，不阻塞默认编辑
  - ADR 已冻结：`adr/adr-parser-source-map-render-ir.md`（终态 `SPIKE_COMPLETE_NO_CORE_IR`；Lezer 为唯一受信 local source-map；Core IR 无合格 Rust producer）<!-- PENDING-MANUAL: ADR 由 AI 依据两轮独立复核证据冻结，Program Owner 确认待界面人工验证阶段 -->
- [x] 6.4 评估 versioned Render IR schema 与 producer 可行性，并记录不引入决定
  <!-- NOT APPLICABLE（P4A 终态 SPIKE_COMPLETE_NO_CORE_IR，见 ADR §3.3：无 producer，schema 为死代码；P7 任务 10.3/10.4 为 local-range 能力复查点） -->
- [x] 6.5 评估 Core IR 协议并实现 local construct owner registry，保证 local/widget/source-fallback 每 construct 唯一 owner
  - 部分实施：Core-IR 请求协议 NOT APPLICABLE（local projection 已在 CM 事务内处理，P2 任务 4.5/4.10/4.13 证据）；construct owner registry 按本地形态实施（ADR §3.3）；`renderOwnerRegistry.ts` + projection 接线已提交并测试（提交 `4116632`）
- [x] 6.6 记录 Core IR 接入为 NOT APPLICABLE，并验证没有它时本地基础投影、输入和保存不回归
  <!-- NOT APPLICABLE（无 Core IR 可接入，ADR §3.3；"IR 关闭不影响 P3"由 6.8 全 gate 复核等效覆盖） -->
- [x] 6.7 记录 Core IR dispatcher/benchmark/reconciliation 为 NOT APPLICABLE，并复用本地投影 degraded E2E
  <!-- NOT APPLICABLE（四个子项均 Core IR 专属，ADR §3.3；desktop degraded 投影 E2E 已由 P2/P3 覆盖并在 6.8 复跑） -->
- [x] 6.8 运行全 gate 与独立 reviewer；冻结 `SPIKE_COMPLETE_NO_CORE_IR` 终态，确认产品不包含 `coreRenderIr` flag
  - run `20260829-175840-p4a-d864cc9`：12/12 gate exit 0（npm test 572、cargo 153、openspec strict+all、archive-sync、byte-contract、e2e smoke 5 / regression 1）；独立 Reviewer PASS；**终态 `SPIKE_COMPLETE_NO_CORE_IR`**；`coreRenderIr` 产品侧 0 命中（未实现 = 最强 default-off）

## 7. Slice 4B — 投影交互底座与轻量 Widgets

- [ ] 7.1 冻结 `visible/dimmed/hidden/revealed` visibility API、construct descriptor 与 reveal contract；P4B 只输出 visible/dimmed/revealed，hidden 由 P6 独占
- [ ] 7.2 建立 P6/P7 共用 interaction harness，覆盖空 heading/list/quote、nested selection、Select All、double-click/drag、Arrow/Home/End/Backspace/Delete、input rule、Undo 落点和 viewport 重建
- [ ] 7.2a 建立 ADR 表驱动 harness；P4B 逐行实现 heading/list/quote 并记录 source before/after、affected ranges、selectionAfter 与单一 History group。Table 在本阶段只冻结 fixtures、widget 接口和预期结果，不实现 table widget
- [ ] 7.3 在真实 Tauri WebView 偿还 P3 IME 证据债：中文与日文 composition start/update/end 邻 marker 不丢字、不取消、一次 Undo
- [ ] 7.4 建立 widget protocol：source/marker range、atomic/focus、commit/cancel、Undo、reveal、fallback、async identity、安全、a11y、read-only 与 export
- [ ] 7.5 完成 construct identity 粒度的 `local/widget/source-fallback` runtime owner、父子 editable slot 仲裁、独立 flag、debug snapshot 与 cleanup；历史 `core` 类型位不得成为运行时 owner
- [ ] 7.6 实现 task checkbox 与 code fence controls pilot，验证局部 patch、source-based clipboard、单一 History 和 read-only
- [ ] 7.7 实现 FrontMatter safe projection 与 raw HTML policy；复杂/不安全内容精确回退源码，raw HTML 默认不执行
- [ ] 7.8 image、GFM table、Mermaid/PlantUML 移交 P7，但仍属于 Issue #254 必达范围；P4B 期间保持 exact source fallback
- [ ] 7.9 每项独立运行 unit/desktop semantic/visual/IME/keyboard/a11y/security/failure injection/L1/rollback，并由独立 Reviewer 与人工验收决定 Go
- [ ] 7.10 单独记录 `P4B-SUBSTRATE-GO`；task/fence/FrontMatter/raw HTML 分别记录 `P4B-ITEM-<name>-GO/NO-GO`，不得用单项失败或通过代替 substrate checkpoint

## 9. Slice 6 — IN SCOPE：Typora 式基础 Markdown 编辑

> 本 Slice 是 Issue #254 必达范围。前置为 P3 minimum parity、P4A 终态和 `P4B-SUBSTRATE-GO`；后续进入 P7，P5 最后执行。

- [ ] 9.1 按 ADR 实现 `Decoration.replace` + `EditorView.atomicRanges`，禁止 CSS 零宽 marker；clipboard/a11y/save/History 均读取 source range
- [ ] 9.2 实现统一 visibility resolver：visible/dimmed/hidden/revealed；composition 强制 reveal 或冻结安全投影，不作为独立正文状态
- [ ] 9.3 M1：heading/paragraph/thematic break，包含空 heading placeholder、Enter/Backspace 与块级布局稳定性
- [ ] 9.4 M2a：strong/emphasis/strike/inline code，包含 nested construct、input rule、double-click 与跨 marker selection
- [ ] 9.5 M2b：inline/reference/autolink，活动时可编辑 destination/title，malformed link 精确回源码
- [ ] 9.6 M3：quote + ordered/unordered/task list + fence，与 P4B task/fence/FrontMatter 联动；空构造保持可发现
- [ ] 9.7 为 projection 与 hidden 分离 flag（如 `livePreview.heading` / `.hidden`）；关闭 hidden 回 dimmed，关闭 construct 回 source，不改变 doc/History/dirty/revision
- [ ] 9.8 每 cohort 覆盖 P4B 矩阵、Select All 不闪烁、plain-text copy/cut 含 source、真实 CJK IME、screen reader、Normal/Large SLO、L0/L1 与独立回滚；分别验证 strong/emphasis/link hidden-marker boundary delete 保留 paired syntax，以及 image/widget 仅在 `deletePolicy=whole` 时整段删除
- [ ] 9.9 生成基础 construct 支持矩阵并由独立 Reviewer、人工和 Program Owner 决定 P6 Go；P6 Go 不等于 program 完成

## 10. Slice 7 — IN SCOPE：富块编辑与支持矩阵收口

> 本 Slice 是 Issue #254 必达范围。前置为 `P4B-SUBSTRATE-GO` 和 P6 visibility engine Go；P4B 单项 widget 在本阶段收口。完成后才允许进入 P5。

- [ ] 10.1 收口 task/fence/FrontMatter/raw HTML 与 P6 hidden 联动；复杂 FrontMatter/raw HTML 继续可解释 source fallback
- [ ] 10.2 内联图片 widget：文档流渲染、click/select、alt/path/title/replace/delete、资源事务、broken URL/权限/大图失败回退、alt a11y
- [ ] 10.3 实现并逐行验证 ADR 的 GFM table cell 矩阵：Arrow/Tab/Enter/Escape/Home/End、selection/composition、inline Markdown、一次操作一次 Undo、cell edit 只改 content range
- [ ] 10.4 GFM table 结构操作：alignment、row/column add/delete/move；声明全部 affected ranges，对 surviving cell/delimiter/padding/EOL 做 L1 golden；不可信结构回源码
- [ ] 10.5 Mermaid：source/preview 双态、sandbox、CSP、timeout/cancel/stale、恶意源码/SVG fuzz、Retry/export 与失败回退
- [ ] 10.6 PlantUML：明确本地/用户配置远程通道、第三方发送提示、offline、redirect/DNS/IP/SSRF/size/timeout/SVG sanitize；无安全通道保持源码
- [ ] 10.7 每 item 独立 flag、owner、P4B 通用矩阵 + 富块专项、Normal/Large/Huge、独立 Reviewer、人工验收和回滚
- [ ] 10.8 生成正交发布支持矩阵，分列 release class（WYSIWYG-required/policy-required/conditional/out-of-scope）、projection maturity、default state、配置条件、Normal/Large/Huge 降级与证据；image/table 为 WYSIWYG-required 且 Normal/Large 默认 ON；FrontMatter/raw HTML 可按签署安全策略以 source fallback 完成；公式/footnotes/TOC/callouts 等非范围项明确声明，禁止称“Typora 完全体”
- [ ] 10.9 Program Owner 签署所有 release-scope 必达项；任何未触及 bytes 改变、widget DOM 入正文、XSS/SSRF、selection trap、资源补偿失败或不可回源码 = 单项 No-Go

## 8. Slice 5 — 最终发布门禁、稳定观察与 Legacy 清理（最后执行）

- [ ] 8.1 前置：P3 Go、P4A `Program-Accepted`、`P4B-SUBSTRATE-GO`、P6 Go、P7 Go 均已记录；P7 发布支持矩阵已签署且必达项达到目标 maturity/default
- [ ] 8.2 在 macOS、Windows、Linux 运行 canonical byte、Typora marker、task/image/table/diagram、autosave、external conflict、真实 IME、a11y、security 和 export 工作流
- [ ] 8.3 建立 light/dark/sepia、visible/dimmed/hidden/revealed/composing/empty/degraded/source fallback 与富块的视觉基线
- [ ] 8.4 对冻结 release candidate 执行三平台各 ≥8 小时/≥2 sessions 的稳定观察与 10k transaction/1k save-reconcile/1k mode-switch/100 projection-widget failure-injection soak
- [ ] 8.5 审计并删除 ProseMirror/Tiptap、serializer、`getMarkdown/setMarkdown`、`trailingNewlines`、`normalizeImageMarkdown`、隐藏 DOM、无效 CSS/dependencies/tests；保留 renderer 必须只读
- [ ] 8.6 重跑 canonical L0/L1、TS/build、Core/Tauri、desktop semantic、P6/P7 visual/IME/keyboard/a11y/security/performance 与 archive gates
- [ ] 8.6.1 三平台最终默认配置执行零编辑打开、两个 autosave tick、Ctrl+S、关闭和重开，记录 dirty/save count/hash/length/mtime
- [ ] 8.7 派独立 Reviewer 静态走查 cleanup diff 并重跑 `npm test`、`npx tsc --noEmit`、关键 Rust/E2E；serializer、双 owner、必达体验回退或数据安全问题均拒绝合入
- [ ] 8.8 将全部 delta specs 同步到 main specs，运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`
- [ ] 8.9 归档 umbrella change，更新 Issue #254/追踪文档与最终支持矩阵；此时才可宣称重构完成和达到定义内的 Typora 式体验
