# MarkFlow Core 二期方案 Review 与可行性分析

> Review 日期：2026-07-31
> Review Issue：#250
> Review 对象：`docs/markflow-core-phase2/README.md` 与正式归档的
> `openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2/`；
> 同时核对本地同名 active 工作副本
> 结论：有条件可行，不建议按当前 umbrella checklist 直接开工

## 1. 评审范围与证据

本次 Review 覆盖：

- OpenSpec proposal、design、16 份 delta spec 和 119 项 tasks；
- `markflow-core` 的 session、patch、position map、ParseIndex、StyleMap、Render IR、
  commands、History、table、FrontMatter、image、diagram 和 Export IR；
- TypeScript Core Bridge、SourceSyncController、CodeMirror adapter、format command layer；
- Tauri Core Bridge、Runtime/Host 边界和现有 desktop E2E；
- 当前依赖、测试基线和 legacy ProseMirror/Tiptap 使用情况。

2026-07-31 本地基线：

| 检查 | 结果 |
| --- | --- |
| `npm run validate:openspec` | 90 items 通过 |
| `bash scripts/check-archive-synced.sh` | 通过；正式 charter 已归档并同步 |
| `npm test` | 49 files / 482 tests 通过；测试日志仍有两处 Tauri logger mock 噪声 |
| `npx tsc --noEmit` | 通过 |
| `(cd markflow-core && cargo test)` | 163 tests 通过 |
| 当前编辑器形态 | CodeMirror Core surface 与 legacy ProseMirror 同时存在 |
| desktop E2E | 有 smoke/regression 基础，尚无二期语义、视觉和 IME required gate |

该基线证明一期基础可复用，但不能证明 Typora 级体验已经成立。

## 2. 总体结论

### 2.1 可行性判断

| 维度 | 结论 | 置信度 | 条件 |
| --- | --- | --- | --- |
| Core 作为唯一文档真相 | 可行 | 高 | 禁止 serializer/DOM 回流保存 |
| 单一 CodeMirror EditorView | 可行 | 高 | 先建立 binding 生命周期与状态保持测试 |
| Core 单一 History | 可行但高风险 | 中 | 先冻结 pending transaction/barrier 协议 |
| lossless semantic projection | 可行但待 spike | 中 | parser + concrete source map 必须通过 R0 |
| 基础 marker fold/reveal | 可行 | 中高 | 每个 construct 独立通过 selection/IME gate |
| 结构化 widgets | 分批可行 | 中 | 先冻结 P0/P1，禁止一次交付全部组件 |
| 10/50 MiB 大文档目标 | 有条件可行 | 中低 | viewport、增量 invalidation 和 benchmark 先行 |
| 三平台 IME/视觉发布门 | 工程可行，环境未就绪 | 中低 | R0 固定 runner、设备和证据责任人 |
| 一次性完成 119 项任务 | 不可取 | 高 | 拆 child Issue/branch/OpenSpec change |

结论不是“重写编辑器”，而是一次跨 Core、Runtime、Bridge、Adapter、桌面验证的渐进迁移。
技术方向正确，风险主要集中在协议时序、输入完整性和发布证据，而不是 Markdown 渲染样式。

### 2.2 建议 Go / No-Go 规则

- 可以立即进入 R0：只做基线、spike、ADR、协议 contract test 和已知正确性修复。
- parser ADR、History 时序 ADR、release-gate ADR 未通过前，不进入对应下游实现。
- 单一 surface 与 composition 保护未通过前，不默认开启任何 marker replacement。
- widget P0/P1 未冻结前，不承诺“全部 structured widgets 同期交付”。
- desktop semantic E2E、visual、IME、platform 和 observation 环境未落地前，不承诺发布日期。

## 3. 已有基础评估

### 3.1 可直接复用

| 能力 | 当前证据 | 二期用途 |
| --- | --- | --- |
| Session/document/revision identity | `DocumentSession` 与 Runtime session | 所有异步结果和 widget identity |
| Patch 与幂等 transaction | patch/session tests | 本地乐观输入与 ack reconciliation |
| UTF-8/UTF-16/source offset | position map tests | CodeMirror selection 和 Render IR range |
| BOM/EOL/trailing newline | snapshot/text buffer tests | byte-preserving 保存 |
| Core History 基础 | undo/redo/idempotency tests | 单一跨模式 History |
| ParseIndex/StyleMap | block/table/list/fence tests | concrete syntax 与增量 invalidation 起点 |
| Render IR v1 | viewport/Unicode/stale tests | v2 演进与 schema negotiation |
| Table/FrontMatter/diagram models | Core integration tests | structured descriptor 与 command |
| Bridge DTO 与 stable error 基础 | TS/Rust tests | versioned contract |
| CodeMirror WYSIWYG extension | adapter unit tests | projection state 与 decorations |

### 3.2 不能直接视为已完成

- 当前 `markflow-core` 仅依赖 `serde`，现有 ParseIndex 是面向已知 block 的自有扫描器，
  不能据此宣称完整 CommonMark/GFM concrete syntax。
- 当前 WYSIWYG extension 主要使用 mark/line decoration；marker replacement、atomic range、
  composition 邻域和完整 selection mapping 尚未形成。
- `editor.ts` 仍显式维护 `legacy-prosemirror | core-codemirror`，Source/WYSIWYG 仍有
  create/destroy 路径，单一 EditorView 尚未成立。
- Tiptap/ProseMirror 依赖、serializer、extensions、CSS 和相关测试仍在产品代码中。
- 现有 desktop E2E 主要验证启动、模式、保存等 smoke，不等于语义渲染、视觉、IME 和平台验收。
- Core 单元测试数量充足，但 parser 内部若干结构依赖间接测试；二期 parser/IR 改造仍需
  conformance、property、fuzz/生成式和 benchmark 覆盖。

## 4. 主要 Review Findings

### F-01：输入完整性门禁放置过晚

现有路线在 R2/R3 实现 marker folding 和 widgets，到 R4 才完成 IME、selection 和自然编辑。
这是依赖倒置：replace/fold/widget 会直接改变 composition、光标、删除和复制行为。

处理：

- R1 建立 composition tracking、protected range、selection mapping contract；
- R2 每个 construct 在默认开启前必须通过 composition/selection fixtures；
- R4 只做语言矩阵、clipboard、自然编辑全量硬化和跨平台验证。

### F-02：单一 Core History 的时序协议尚未闭合

“本地立即输入、Core 最终确认、移除 CodeMirror History”方向正确，但仍需明确：

- patch 未 ack 时 Undo/Redo 的目标；
- typing burst 与 composition 的 transaction identity；
- semantic command 前是否 flush、等待或 rebase；
- ack、resync、Undo/Redo 交错的有界 barrier；
- barrier timeout 后 text、selection、dirty state 如何恢复。

这必须先形成 ADR 和状态机测试，不能只靠 command layer 的 `flush before command`。

### F-03：parser/source-map 是真正的关键路径

Render IR v2、marker ranges、StyleMap、structured block identity 都依赖 concrete syntax。
当前列出四个 candidate，但没有固定评测语料、权重和淘汰线。

最低淘汰线：

- unknown/malformed 输入不得阻止打开、编辑和保存；
- unchanged document byte-for-byte；
- marker/content/source range 在 CJK、emoji、escape、nested syntax 下精确；
- 不得要求 serializer 重建未编辑文档；
- 10/50 MiB 上有明确 time/memory/degradation 数据；
- license、维护状态和二进制增量可接受。

### F-04：R3 scope 过宽

Table、Image、Task、Code Fence、FrontMatter、Mermaid、PlantUML、HTML 同时进入一个里程碑，
会把数据模型、Host 资源、安全沙箱、键盘、无障碍和异步布局风险耦合在一起。

建议拆分：

- R3A：widget protocol + Task List + Code Fence；
- R3B：GFM Table + Image；
- R3C：FrontMatter + Diagram + HTML policy；
- default WYSIWYG 的 P0 范围由 R0 ADR 冻结，P1 可保持精确 source fallback。

### F-05：umbrella change 不适合直接实施

119 项任务横跨多个发布门和平台，单 change/branch 会导致：

- 多分支同时修改 checklist；
- requirement、实现和证据无法唯一归属；
- archive 时难以判断 stale evidence；
- PR 过大，无法独立回滚。

必须把 umbrella change 作为 program charter，子 change 使用明确 task ID 映射，完成证据保存在子 change。

### F-06：性能指标缺少可复现测量定义

`16/50/100 ms` 是合理的体验预算，但没有 reference machine、profile、warm-up、样本数、
输入场景、分位数算法和噪声策略就不能作为 gate。50 MiB 也不能默认承诺完整 widgets。

R0 必须产出机器可读 benchmark manifest；大文档验收应同时规定显式 degradation，而非只规定速度。

### F-07：发布证据链尚未具备

现有 scripts 没有 visual regression 和 performance benchmark 命令；真实 IME 自动化边界、
Windows/Linux runner、七天/二十小时 observation 记录格式也未落地。

这些不是 R5 才发现的问题。R0 要先确认环境和责任边界，R5 才执行证据收集。

### F-08：正式 archive 与本地 active 副本同时存在

正式仓库已通过提交 `eb30d4d` 将 charter 归档到
`openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2`，delta specs 也已同步；
Issue #247 已关闭。本地同时存在一个被 Git 忽略的
`openspec/changes/typora-grade-live-preview-phase2` 工作副本，因此 OpenSpec CLI 会额外报告
`in-progress 0/119`。

处理：

- 以已跟踪的 archive 作为 charter 正式来源；
- 不提交、不勾选同名 active 工作副本；
- 实施一律建立 child change，证据只进入 child；
- 若本地副本不再需要，由用户单独确认后清理，本次文档工作不删除它。

`isComplete: true` 只表示规划 artifacts 齐全，不表示 119 项实现完成。后续必须区分：

- planning complete；
- implementation complete；
- automated verified；
- GUI/platform verified；
- product accepted；
- archived。

## 5. 必须冻结的 ADR

| ADR | 最迟时间 | 阻塞对象 | 必须回答 |
| --- | --- | --- | --- |
| A1 Parser/source-map | R0B 退出 | R2A | candidate、range/trivia、incremental、fallback |
| A2 Bridge wire contract | R0B 退出 | R0C/R1 | camelCase、version、stable error、cancel |
| A3 History/order protocol | R1B 开工前 | R1B-R4 | pending、barrier、rebase、timeout、selection |
| A4 Projection identity/state | R0C 开工前 | 所有 projection/widget | generation/hash/revision/request/stale/degraded |
| A5 Widget P0/P1 scope | R0 退出 | R3/R5 | 默认发布范围、fallback、延期规则 |
| A6 HTML/diagram security | R3C 开工前 | R3C | inert/sandbox、network、timeout、CSP |
| A7 Benchmark/visual/IME evidence | R0 退出 | R4/R5 | runner、manifest、tolerance、签名证据 |
| A8 Legacy removal | R5C 开工前 | dependency cleanup | export CSS、rollback artifact、audit |

## 6. 推荐架构边界

```text
User input
  -> one CodeMirror EditorView
  -> local optimistic transaction (never a second truth)
  -> EditorSurfaceBinding / ordered transaction coordinator
  -> Tauri Runtime
  -> markflow-core text + semantic command + single History
  -> confirmed revision
  -> versioned viewport Render IR
  -> identity-checked projection/widgets
```

职责约束：

- Core：text、semantic model、commands、History、lossless source metadata。
- CodeMirror：editable mirror、selection、viewport、composition、DOM interaction。
- Binding/Adapter：transaction ordering、projection、fold/reveal、widget lifecycle。
- Runtime：session、cancel、save、conflict、window lifecycle。
- Host：filesystem、clipboard、network、dialogs、safe asset URL。

任何层都不得从 rendered DOM 或 widget draft 生成保存真相。

## 7. 最终评审意见

方案应批准进入 R0，但不能批准直接进入全面实现。只有以下条件同时满足后，才认为二期技术路线
“已验证可行”：

1. parser/source-map spike 有明确胜者或明确采用 existing ParseIndex 的补强方案；
2. pending transaction/History 状态机通过交错测试；
3. 单一 EditorView 100 次切换保持 bytes、selection、scroll、dirty 和 History；
4. 至少 heading + strong 两类 projection 通过 CJK composition、selection 和 exact fallback pilot；
5. desktop semantic E2E、visual、performance、IME/platform evidence 的执行环境已登记。

在此之前，产品状态只能写为
“Phase 2 charter archived and planning complete / implementation evidence not established”。
