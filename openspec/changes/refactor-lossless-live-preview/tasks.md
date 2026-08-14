> 执行约束：本 checklist 是 Issue #254 的 program 级实施顺序。Program Owner 已批准全部任务在当前分支 `test/issue-255-lossless-byte-contract` 与 umbrella change `refactor-lossless-live-preview` 中连续完成；后续不新建 Issue、branch、child change 或阶段 PR。每个 Slice 仍必须建立独立 commit checkpoint、evidence run、独立 Reviewer、Program Owner 人工验收和 Go/No-Go，并保留可运行产品与 feature flag 回滚。该例外只适用于 Issue #254。
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

- [ ] 3.1 在 Tauri Runtime 注册 session registry，并实现 open/apply-patch/get-snapshot/prepare-save/commit/reload/close commands 与稳定错误码
- [ ] 3.2 实现前端 `EditorSurfaceBinding` 最小版，挂接当前 CodeMirror transaction、document/session identity 和 confirmed/persisted revision
- [ ] 3.3 实现单 in-flight patch controller：frame batch、bounded queue、retry、ack、flush、blocked 和 resync，所有 timer/request 可取消
- [ ] 3.4 以 `losslessCoreSession` flag 接入文件打开，Source 模式直接使用 Core logical text，不调用 `setMarkdown()` 或 serializer
- [ ] 3.5 接入 dirty/autosave：pending 或 confirmed≠persisted 为 dirty；blocked、saving、conflict 时禁止旧 snapshot 写盘
- [ ] 3.6 实现 Core confirmed bytes → Host guarded atomic write：携带 expected file identity 与幂等 saveOperationId，在替换点复核并返回 durable receipt，保存后只提交对应 persisted revision
- [ ] 3.7 把 save、save-as、new file、reload、close 与外部修改冲突接入 flush/prepare/commit 生命周期
- [ ] 3.8 改造图片 pending-save 流程，使路径迁移返回显式局部 Markdown patch，不在保存前全文 `normalizeImageMarkdown()`
- [ ] 3.9 添加 Bridge integration 与 desktop E2E：打开—正文编辑—保存—重开，逐 fixture 比较完整 bytes/hash/mtime；覆盖 write/commit response 丢失、重复 operation、竞争外部替换、崩溃后 receipt reconcile
- [ ] 3.9.1 继承 P0S lifecycle：autosave 开启，零编辑等待两个 tick、Ctrl+S、关闭、reload、A/B 切换均证明 dirty=false、save count=0、hash/length/mtime 不变
- [ ] 3.9.2 对 lossless flag 做调用审计/spy，证明打开、dirty、autosave、手动保存、reload 和 close 不调用 `setMarkdown/getMarkdown/normalizeImageMarkdown` 或 PM serializer
- [ ] 3.10 证明 render/parser 不可用时 Source 仍能编辑保存；任何 byte fixture 失败则 lossless flag 保持 default-off
- [ ] 3.11 运行 TS/build、Core/Tauri、E2E 全 gate并派独立 reviewer；通过并经人工验收后记录 Slice 1B Go checkpoint，不归档 umbrella change

## 4. Slice 2 — 单一 CodeMirror Surface 与基础 Live Preview

- [ ] 4.1 把 lossless 文档生命周期改为只创建一个 CodeMirror `EditorView`，拆分 base/mode/theme/readOnly/projection compartments
- [ ] 4.2 将 Source/Live Preview 切换改为 compartment reconfigure，保持 selection、scroll、focus、pending queue、dirty 和 CodeMirror History
- [ ] 4.3 使用 CodeMirror Markdown/Lezer 可见区语法树实现 heading、strong、emphasis、strike、inline code、link、quote、list 和 fence 的即时语义 decorations
- [ ] 4.4 首版 marker 只弱化不隐藏；光标/选区/composition 进入范围时完整揭示 marker
- [ ] 4.5 定义 projection invalidation closure：普通段落局部失效，list/quote/fence/reference/footnote 按最小结构闭包失效；range 不可信时精确回退源码
- [ ] 4.6 定义 selection invariant：CM UTF-16 position + affinity 为 UI 基准，transaction 由 `ChangeDesc` 映射，bridge 使用显式 PositionMap；禁止 DOM node、`wbr` 或 sentinel 进入正常状态
- [ ] 4.7 建立 marker reveal 矩阵，覆盖 collapsed/range/directional selection、鼠标 drag、Home/End、Shift+Arrow、Select All、composition 邻域和 atomic widget 边界
- [ ] 4.8 让 outline、stats、statusbar、search、settings 和 read-only 状态读取 active CodeMirror binding，不读取隐藏 ProseMirror
- [ ] 4.9 实现 projection 状态与调试属性：source/projecting/rendered/composing/stale/degraded/disposed，并记录 flags/identity 而不记录正文
- [ ] 4.10 添加 adapter tests：projection 不改变 `EditorState.doc`、transaction 后即时更新、模式切换不产生正文 transaction
- [ ] 4.11 添加真实 desktop semantic E2E，逐 construct 断言语义 decoration/DOM，而非只断言编辑区包含文本
- [ ] 4.12 执行 Source/Live Preview 100 次切换测试，验证 bytes、EditorView identity、selection、scroll、dirty、revision 和 History
- [ ] 4.13 注入 projection failure，验证只回退同一 CodeMirror Source 且保存 bytes 不受影响
- [ ] 4.14 运行全 gate 与独立 reviewer；真实 WYSIWYG 未呈现 Markdown 语义则 Slice 2 No-Go
- [ ] 4.15 重跑零编辑两个 autosave tick、干净 Ctrl+S、模式切换与关闭 L0 门禁，证明 projection reconfigure 不产生 transaction 或写盘

## 5. Slice 3 — 默认保存主链与常用编辑能力迁移

- [ ] 5.1 建立统一 CodeMirror command router，toolbar/menu/keyboard/input rule 均依赖 active binding 和 selection
- [ ] 5.2 迁移 bold/italic/strike/link/heading/quote/list/code fence 命令为局部、可 Undo 的 CodeMirror transaction
- [ ] 5.3 迁移图片插入/替换/删除与资源事务，确保仅修改对应 source range 且相邻空行不被隐式整理
- [ ] 5.4 建立 Enter/Backspace command matrix：普通文本、空/非空 list item、quote、heading、fence、table、atomic inline、跨块 selection；不安全上下文揭示源码或退回原生 CM 文本语义
- [ ] 5.5 迁移 paste/drop/clipboard：同步冻结 selection/MIME，区分 literal/HTML/plain/file/image，上下文转换后以一次局部 transaction 和显式 History boundary 提交
- [ ] 5.6 明确 CodeMirror History grouping：composition、连续输入、paste、Enter、结构命令、widget commit、bulk replace；Undo/Redo 后通过同一 patch pipeline 收敛 Core revision
- [ ] 5.7 迁移 autosave、external reload/conflict、document transition、save-as/new file 到 lossless 默认路径
- [ ] 5.8 迁移 export 输入为同 revision Core snapshot 或只读明确 renderer，保证 export 不反向修改正文
- [ ] 5.9 增加 CJK/emoji、pending-save、写盘期间继续输入、跨模式 Undo/Redo、A/B 文档隔离 E2E
- [ ] 5.10 逐行通过并签署 default minimum parity matrix 后才让 `losslessCoreSession` 默认开启；legacy ProseMirror 仅保留显式 flag 且与 lossless session owner 严格隔离
- [ ] 5.11 收集一轮真实日常工作流证据与 legacy 回退原因；任何数据完整性问题立即关闭默认 flag
- [ ] 5.12 运行全 gate、三平台可用环境 smoke 与独立 reviewer；通过并经人工验收后记录 Slice 3 Go checkpoint，不归档 umbrella change
- [ ] 5.13 在默认 flags 上重跑全部 L0 lifecycle 与 L1 surviving-span 案例；任何打开即 dirty/写盘或 serializer save 立即关闭默认 flag

## 6. Slice 4A — Parser/Source Map Spike 与 Confirmed Render IR

- [ ] 6.1 用统一 fixtures 比较 CodeMirror Lezer、draft ParseIndex、markdown-rs/pulldown-cmark 等候选的 source/content/marker ranges、unknown fallback、性能、维护和许可
- [ ] 6.2 对 CJK、emoji、escape、nested、malformed 与随机 boundary 做 range→source slice property tests；任一 lossless/range 失败淘汰候选
- [ ] 6.3 冻结 parser/source-map ADR；无合格胜者时在当前分支把 P4A 标记为 `SPIKE_COMPLETE_NO_CORE_IR`，保留本地基础投影和复杂源码 fallback，并标记后续依赖项，不阻塞默认编辑
- [ ] 6.4 定义 versioned Render IR：binding/session/document/revision/request/source hash/viewport、stable block identity、ranges、fallback/widget descriptors
- [ ] 6.5 实现 viewport/cancel/stale/degraded 协议与 construct owner registry，保证 local/core/source-fallback 唯一 owner
- [ ] 6.6 接入 Core IR 作为增强投影，验证 IR timeout/stale/跨文档结果不会影响本地基础投影、输入和保存
- [ ] 6.7 添加真实 dispatcher、payload benchmark、adapter reconciliation 和 desktop degraded/retry E2E
- [ ] 6.8 运行全 gate 与独立 reviewer；记录 `GO_CORE_IR`、`SPIKE_COMPLETE_NO_CORE_IR` 或 `NO-GO` 终态；未通过 identity/range 门禁时 `coreRenderIr` 保持 default-off

## 7. Slice 4B — Marker Cohorts 与高级 Widgets

- [ ] 7.1 按 heading+strong、emphasis+strike+inline-code、links、quote+lists、fence 五个 cohort 分别实现 marker replace/reveal 与 atomic range
- [ ] 7.2 每个 cohort 独立通过鼠标/键盘 selection、Home/End、Shift+Arrow、Select All、clipboard、CJK IME、emoji 和 accessibility 后才 default-on
- [ ] 7.3 建立 widget protocol：source range、focus、commit/cancel、Undo、reveal、fallback、async identity、安全与 read-only 约束
- [ ] 7.4 先实现 task checkbox 与 code fence widget pilot，验证局部 patch 和单一 History
- [ ] 7.5 再实现 image 与 GFM table widgets，验证资源安全、键盘导航、未触及 table/style bytes 保真
- [ ] 7.6 最后实现 FrontMatter、Mermaid/PlantUML 与 raw HTML policy；复杂/不安全内容精确回退源码
- [ ] 7.7 对每个 widget 单独添加 unit、desktop semantic、visual、IME、keyboard-only、安全和 failure injection 证据
- [ ] 7.8 按 Normal/Large/Huge 验证 viewport-only projection、重型 widget 降级与内存/延迟预算
- [ ] 7.9 每个 cohort/widget 使用独立 flag、evidence run 与验收结论；一个失败不得被“整体 Live Preview 通过”掩盖

## 8. Slice 5 — 发布门禁、稳定观察与 Legacy 清理

- [ ] 8.1 在 macOS、Windows、Linux 运行 canonical byte、Source/Live Preview、autosave、external conflict、IME、widgets 和 export 工作流
- [ ] 8.2 建立 light/dark/sepia、active/inactive/composing/selected/degraded/source fallback 的视觉基线与批准流程
- [ ] 8.3 对冻结 release candidate 执行量化稳定观察：三平台各 ≥8 小时/≥2 sessions，达到人工操作矩阵与 10k transaction/1k save-reconcile/1k mode-switch/100 failure-injection 自动 soak；所有证据记录 commit、flags、OS/WebView/IME、fixture hash 与日志
- [ ] 8.4 审计产品代码中 ProseMirror/Tiptap、serializer、`getMarkdown/setMarkdown`、`trailingNewlines` 和 `normalizeImageMarkdown` 的剩余消费者
- [ ] 8.5 删除 legacy ProseMirror 产品路径、隐藏 DOM、无效 CSS/dependencies/tests；保留的只读 renderer 必须明确不参与正文真相
- [ ] 8.6 重跑 canonical byte/property、TS/build、Core/Tauri、desktop semantic、visual、IME、security、performance 和 archive gates
- [ ] 8.6.1 在三平台对最终默认配置执行零编辑打开、两个 autosave tick、Ctrl+S、关闭和重开，记录 save count/hash/length/mtime，作为删除 legacy 前不可豁免证据
- [ ] 8.7 派独立 reviewer 做静态走查与全测试；存在任何 serializer 保存、双 owner 或数据完整性阻塞则拒绝清理合入
- [ ] 8.8 将全部 delta specs 同步到 main specs，运行 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`
- [ ] 8.9 将现有 P0 child delta 与 program delta 同步到 main specs，归档现有 changes，更新 Issue #254/追踪文档并明确产品已验收范围与仍为 source fallback 的 constructs
