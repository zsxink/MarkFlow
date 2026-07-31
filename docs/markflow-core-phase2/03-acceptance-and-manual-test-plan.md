# MarkFlow Core 二期验收标准与人工验收手册

## 1. 验收原则

验收分为六层，后层不能由前层替代：

1. Static：类型、lint、dependency、capability audit。
2. Core/Unit：lossless、range、command、History、model。
3. Integration：Bridge、Runtime、Adapter、真实 dispatcher。
4. Desktop Semantic：真实 Tauri WebView 的行为和 DOM 语义。
5. Visual/IME/Accessibility/Platform：环境相关证据。
6. Observation：同一 release candidate 的持续稳定性。

“自动测试通过”不等于“人工验收通过”；人工验收也不能替代可自动化的 regression。

## 2. 证据格式

每条人工验收记录必须包含：

- case ID、结果（PASS/FAIL/BLOCKED）、操作者；
- commit SHA、build profile、feature flags；
- OS、WebView、输入法、locale、theme、scale、viewport；
- fixture 名称和初始 hash；
- 开始/结束时间；
- screenshot/video/log 路径；
- 保存后文件 hash；涉及性能时附 trace；
- failure 的 Issue、复现步骤和是否重启观察窗口。

PASS 证据必须来自当前 commit。旧截图、旧日志或其他 feature flag 组合均为 stale evidence。

## 3. 自动化退出标准

每个 child change 至少运行通用 gate：

```bash
npm audit --omit=dev --audit-level=high
npm test
npx tsc --noEmit
scripts/check-capabilities.sh
npm run validate:openspec
bash scripts/check-archive-synced.sh
npm run build
bash scripts/check-bundle-size.sh
```

涉及 Rust/Tauri：

```bash
(cd src-tauri && cargo test)
(cd src-tauri && cargo fmt --all -- --check)
(cd src-tauri && cargo clippy --workspace --all-targets -- -D warnings)
```

涉及 Core：

```bash
(cd markflow-core && cargo test)
(cd markflow-core && cargo clippy --all-targets -- -D warnings)
```

涉及产品编辑行为：

```bash
npm run test:e2e
npm run test:e2e:regression
```

visual/performance 命令由 R0 A7 ADR 固定后成为 required gate。

## 4. R0 人工验收

| ID | 场景与步骤 | 预期结果 |
| --- | --- | --- |
| M-R0-01 | 打开 capability matrix，随机抽取 5 个 task，沿 child change、PR、test、evidence 反向追踪 | 每项唯一归属，无空 required field |
| M-R0-02 | 使用错误/stale revision 的 evidence 更新 matrix | honesty check 拒绝并指出字段 |
| M-R0-03 | 按 baseline 文档启动当前 build，复现已知 projection/日志问题 | 复现步骤、日志目录、SHA、截图一致 |
| M-R0-04 | 用 canonical fixture 执行 parser harness，人工检查 heading、nested list、escaped pipe、malformed fence、CJK inline range | range 对应精确 source slice；unknown 不丢内容 |
| M-R0-05 | 对 LF、CRLF、mixed EOL、BOM fixture 做无编辑打开/切换/保存 | 输出 hash 与输入一致 |
| M-R0-06 | 在真实桌面逐个执行 render、flush、save、reload、close、Undo/Redo | 无 missing argument、重复 session 或 silent error |
| M-R0-07 | 正常 WYSIWYG 输入后停止操作等待 ack | 无需滚动/再次输入，confirmed projection 自动更新 |
| M-R0-08 | 人工注入 render failure | 显示 degraded bar；文本可编辑；Retry 和 Source 可用 |
| M-R0-09 | render pending 时切换 A/B 文档并返回 | A 的结果不应用到 B；状态和日志 identity 正确 |
| M-R0-10 | degraded 后恢复 backend 并 Retry | 只恢复一次，无重复 toast，旧 decoration 已移除 |

R0 总验收：A1/A2/A5/A7 ADR 批准；任何 parser range、真实 invoke 或 degraded recovery 失败均阻塞 R1/R2。

## 5. R1 人工验收

| ID | 场景与步骤 | 预期结果 |
| --- | --- | --- |
| M-R1-01 | 在含长文档的 Source/WYSIWYG 间切换 100 次 | bytes、selection、scroll anchor、focus、dirty、revision 不变 |
| M-R1-02 | 输入后在 patch pending 状态立即切换模式 | 输入不丢失、不重复，ack 后 revision 收敛 |
| M-R1-03 | 打开 A/B 两文档，分别编辑并来回切换 20 次 | session、selection、History、save target 完全隔离 |
| M-R1-04 | 关闭当前文档、重开、销毁窗口 | EditorView、request、session 被释放；日志无 late apply/leak |
| M-R1-05 | 两模式分别使用 search、outline、stats、settings、read-only | 消费者都绑定 active Core surface |
| M-R1-06 | toolbar、menu、shortcut 对同一 selection 执行 bold/link/list | Markdown patch 和 `selectionAfter` 一致，只执行一次 |
| M-R1-07 | 连续输入后切模式再 Undo/Redo | 一个共享 History，跨模式顺序一致 |
| M-R1-08 | 输入后在 ack 前立即 Undo，随后 repeated Undo/Redo | 不撤销更旧编辑，不重复 patch，最终 text/revision 一致 |
| M-R1-09 | 中文 composition 后按一次 Undo | 整段 composition 一次撤销，无残留拼音或 marker |
| M-R1-10 | 人工制造 barrier timeout/command rejection | text、selection、dirty 不变；显示可恢复错误并可 resync |

R1 总验收：产品编辑配置不得存在独立 CodeMirror History；active Core surface 不得读写 hidden ProseMirror。

## 6. R2 人工验收

| ID | 场景与步骤 | 预期结果 |
| --- | --- | --- |
| M-R2-01 | 检查 IR v2 canonical dump 的 identity、tree、source/content/marker ranges | schema 完整；所有 range 可回切原 source |
| M-R2-02 | v2 request pending 时修改 boundary、切 viewport、切文档 | old IR 被 cancel/drop；不出现旧 range decoration |
| M-R2-03 | 光标离开 heading、strong、emphasis、strike、code | inactive marker 不可见，语义样式正确 |
| M-R2-04 | 光标逐一进入上述 constructs | 只揭示当前编辑所需 marker，不改变其他布局 |
| M-R2-05 | 编辑 link label/destination，modifier-key 打开 | label/target 行为正确；unsafe URL 不打开 |
| M-R2-06 | 编辑 quote、nested list、task list 并移动当前行 | 只 reveal 当前 marker；indent/number/style 保留 |
| M-R2-07 | 跨 hidden marker 鼠标拖选、Shift+Arrow、Home/End、Select All | selection 可预测，无卡死、跳位或漏选 |
| M-R2-08 | 在每类 delimiter 邻域执行中文/日文 composition | 不丢字、重复或重排；冲突 projection 延后 |
| M-R2-09 | Copy 跨多个 hidden markers，再粘贴到 Source | internal Markdown exact；plain text 无重复 marker |
| M-R2-10 | 注入 unsupported/malformed construct 或关闭单项 flag | 只在该 construct 精确 source fallback，其他投影正常 |

每个 cohort 独立签字。一个 cohort 失败只允许保持 default-off，不得用“整体 R2 通过”掩盖。

## 7. R3 人工验收

| ID | 场景与步骤 | 预期结果 |
| --- | --- | --- |
| M-R3-01 | 用鼠标和键盘 toggle Task checkbox，再 Undo/Redo | source marker、focus、History 正确 |
| M-R3-02 | 编辑 code fence 内容、语言、首尾空行并退出 block | fence style、indent、EOL、trailing newline 保留 |
| M-R3-03 | Table 中用 Tab/Shift+Tab/arrows/Enter/Escape 导航 | focus 与 selection 符合约定，无 trap |
| M-R3-04 | 编辑 cell、增删行列、改 alignment | 未影响 cell、pipes、padding、EOL byte-for-byte |
| M-R3-05 | 打开 malformed table | 显示精确 source fallback，仍可编辑保存 |
| M-R3-06 | 相对图片 preview、编辑 alt/title/path、replace/copy/delete | URL 绑定正确文档；每项可 Undo/reveal |
| M-R3-07 | replace image 中途取消、失败或关闭文档 | transaction rollback，无孤儿引用和 wrong-session commit |
| M-R3-08 | 打开 broken/unsafe/path-traversal 图片 | 不执行危险 URL；broken state 可编辑、Retry、reveal |
| M-R3-09 | 编辑 safe FrontMatter scalar/nested field | comments、quotes、order、indent、EOL 保留 |
| M-R3-10 | 打开 alias/tag/duplicate/malformed FrontMatter | 显示 diagnostics 和 source submode，不危险重写 |
| M-R3-11 | Diagram render pending 时编辑 source、切 A/B、超时 | stale result 丢弃；错误可 Retry/reveal；无跨文档结果 |
| M-R3-12 | 打开 HTML comment、script/event/raw HTML fixture | comment 可 fold/reveal；raw HTML inert/sandbox，脚本不执行 |

每个 widget 还需键盘-only 完成 mount、focus、edit、commit、cancel、Undo、reveal、exit。

## 8. R4 人工验收

| ID | 场景与步骤 | 预期结果 |
| --- | --- | --- |
| M-R4-01 | 中文拼音连续输入 canonical 语料 1,000 次事件 | 无丢字、重复、错序；每次 composition 一个 History group |
| M-R4-02 | 日文、韩文、emoji、combining、RTL 重复 R4-01 核心场景 | grapheme/UTF-16 selection 与保存正确 |
| M-R4-03 | 在 paragraph/heading/quote/list/task/table/code 中测试 Enter | continuation/exit 行为符合规范，未改无关 source |
| M-R4-04 | 在 folded marker、空 block、widget boundary 测 Backspace/Delete | 不吞字符、不跨错误边界、不破坏 marker |
| M-R4-05 | 在 list/table/code/form/widget 测 Tab/Shift+Tab | indent、navigation、focus traversal 符合上下文 |
| M-R4-06 | 复制/粘贴 internal Markdown、HTML、plain text、files/images | MIME 优先级、sanitize、asset transaction 正确 |
| M-R4-07 | 1/10/50 MiB fixture 执行输入、滚动、切换、保存 | 达到 manifest budget；degradation 清晰且不丢能力 |
| M-R4-08 | 快速滚动并触发多个 image/diagram async result | viewport-only、cancel 生效，无无界 layout shift |
| M-R4-09 | 执行 raw HTML/SVG/URL/path/symlink/oversize 攻击 fixtures | 不执行、不越界、有稳定错误，日志无文档内容 |
| M-R4-10 | keyboard-only、screen reader、200% zoom、high contrast、reduced motion | 无 focus trap、重叠、裁切或重复朗读；Source 始终可达 |

性能 PASS 必须附原始样本和环境 manifest，不能只附平均值截图。

## 9. R5 人工验收

| ID | 场景与步骤 | 预期结果 |
| --- | --- | --- |
| M-R5-01 | macOS 执行 canonical workflow，含中文 IME、widgets、save/export | 全通过，日志无 error/panic/stale marker |
| M-R5-02 | Windows 执行 canonical workflow，含系统 IME | 全通过，文件 bytes 和视觉证据完整 |
| M-R5-03 | Linux 执行 canonical workflow | 全通过，平台差异已记录且不破坏 required behavior |
| M-R5-04 | 审阅 light/dark、active/inactive/composing/selected/widget/source/degraded diff | 仅批准的 baseline 变化通过；mask 有理由 |
| M-R5-05 | 对冻结 RC 执行 7 天/20 小时 observation | 每平台每 workflow >=3；无阻塞事件；日志连续 |
| M-R5-06 | 删除 legacy 后重复 full gate、打开旧文档并 save/export | 无 ProseMirror/Tiptap 产品路径；兼容性和 rollback artifact 可用 |

## 10. 最终接受与拒绝条件

只有以下全部满足才接受 Phase 2：

- 119 个 tasks 都有唯一 child、实现和 current-revision evidence；
- P0/P1 capability 的 automated、desktop、visual、IME、platform、observation 字段齐全；
- Source/WYSIWYG byte-preserving，Core text/History/save 是唯一真相；
- unknown/unsafe syntax 始终 exact source fallback；
- 所有默认开启 construct 通过 composition/selection gate；
- performance/security/accessibility budgets 通过；
- legacy 删除后全 gate 通过；
- 独立 agent 复核无阻塞；
- delta specs 已 sync，archive checks 通过。

以下任一情况必须拒绝或标记 BLOCKED：

- required gate 未执行却标为 PASS；
- evidence 来自旧 commit、不同 flags 或不同 fixture；
- GUI 只验证“有文本”，没有验证 marker/semantic/widget；
- platform/IME/observation 以“CI 不支持”为由跳过；
- fallback 静默显示源码却仍宣称 WYSIWYG 成功；
- deferred required task、未解决高危安全问题或数据完整性失败。
