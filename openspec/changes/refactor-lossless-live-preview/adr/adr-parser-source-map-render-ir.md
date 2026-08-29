# ADR: Parser/Source-Map 选型与 Core Render IR 终态（P4A 任务 6.3）

- 状态：**ACCEPTED（AI 调度器依据已独立复核的 spike 证据冻结，2026-08-29）**；Program Owner 确认：PENDING-MANUAL
- 关联：tasks.md §6（6.1–6.8）；design/phases/P4A-render-ir.md §8；design/05-render-ir-widgets-nfr.md §1/§2/§6
- 证据：`validation/evidence/P4A/20260829-035314-p4a-f189b0c/`（6.1 候选比较，Reviewer PASS）与 `validation/evidence/P4A/20260829-055341-p4a-5ac06b5/`（6.2 property tests，Reviewer PASS）
- 终态：**`SPIKE_COMPLETE_NO_CORE_IR`**（spike 完成；产品保持 local projection + source fallback；**不是**实现失败）

## 1. 背景

P4A 的目标是为复杂 Markdown 投影选择可信 parser/source-map，并实现 versioned、可取消、可降级的 **Core Render IR**（design/phases/P4A-render-ir.md §1）。"Core IR" 按 design/05 §2 定义为携带 binding/session/document/revision/request/sourceHash/viewport 身份、经 IPC 往返的渲染中间表示——即由 Rust Core 侧产出、供前端投影消费的增强数据流。spike 问题因此拆成两个独立子问题：

1. **投影 source-map**：哪个 parser 的 source/content/marker ranges 可信（可回切 logical text、malformed 不 panic、坐标明确）？
2. **Core IR producer**：是否存在能在 Rust Core 侧产出该 IR 的合格 parser？

## 2. 证据摘要（两轮独立复核均 PASS）

| 候选（本机实测版本） | round-trip（26 fixtures + 8 类 property） | marker 级 ranges | 性能（spike 级） | malformed 鲁棒性 | 许可 |
| --- | --- | --- | --- | --- | --- |
| **CodeMirror Lezer +GFM**（`@codemirror/lang-markdown` 6.5.0 / `@lezer/markdown` 1.7.0，产品内嵌） | 87 MATCH / **0 INVALID** / 4 SPURIOUS（frontmatter 误判，已知） / 1 MISS；property 8 类 0 range 失败 | **唯一原生提供**（delimiter 子节点） | viewport 增量 0.35–0.44ms；10MB 全量 494–643ms | 无 throw，深嵌套 10k 层 682–1097ms 有界 | MIT，零新增供应链 |
| markdown-rs 1.0.0 | 0 INVALID 但 property 深嵌套 **TIMEOUT 11.1s + 默认栈 SIGABRT（exit 134）**；10MB 解析 20–58s | 无 | 不可用 | 深嵌套栈溢出崩溃 | MIT |
| pulldown-cmark 0.13.4 | 0 INVALID；range 可信 | **完全不暴露**（事件 range 为整元素） | 10MB 23–48ms（最快） | 无 panic | MIT |
| comrak 0.54.0 | 0 INVALID；range 可信；唯一原生 checkbox span | 无（escape 溶解进 Text） | 10MB 125–132ms | 无 panic | BSD-2-Clause |
| draft ParseIndex | EXCLUDED：Tauri 运行时为 Rust+TS 无 JVM，且系 draft-js 内部 API | — | — | — | — |

补充事实：在 comrak/pulldown 之上重建 marker 级 ranges 等于重新实现 CommonMark inline 解析（escape/强调左翼规则等），超出 spike 授权，须另行资格认证；本 ADR 不预设其可行。

## 3. 决定

### 3.1 投影 source-map：CodeMirror Lezer（local ranges）为唯一受信 source-map

P4B 全部 cohort/widget（tasks §7）基于受信 local Lezer ranges 实施。依据：两轮 spike + property 全部 0 range 失败；唯一原生 markerRanges（P4B cohort 的硬前提）；UTF-16 原生坐标（与 CM doc 同系，零转换）；viewport 增量亚毫秒；产品已内嵌。

已知缺口与对策（写入 P4B 任务约束）：

- frontmatter 不识别且被误判为 SetextHeading2 → P4B frontmatter 项必须前置剥离后再投影（6.2 已把该 SPURIOUS 冻结为唯一豁免项）；
- footnote 定义无结构节点 → 保持 exact source fallback；
- QuoteMark 嵌套归因缺陷已在 6.2 修复并有回归覆盖。

### 3.2 Core Render IR：不引入（终态 `SPIKE_COMPLETE_NO_CORE_IR`）

判据链（全部有可复现证据，无一项是"感觉不行"）：

1. **Rust 侧无合格 producer**：三个 Rust 候选分别被性能/鲁棒性（markdown-rs）或 marker 粒度（pulldown-cmark、comrak）淘汰；无 marker 粒度的 producer 无法服务 P6 marker replace/reveal/atomic range 与 P7 精确 widget source ranges。
2. **唯一合格 parser 在 UI 进程**：Lezer 无法在 Rust Core 侧运行；把它包装成 Core IR 意味着 UI 解析 → 序列化 → IPC → 前端反序列化的完整链路，保真零增益（本地投影本就增量、viewport 感知、同树消费），纯增 staleness/cancel/延迟成本。
3. **既有架构分工不需要它**：design README §7 冻结的分工是"Core 是持久化字节真相；CodeMirror 是低延迟交互真相"。投影失败只降级为同一 CM 文本的 Source（P2 任务 4.13 已验证），Core IR 在该数据流中没有第二个消费者。export 走同 revision Core snapshot 只读 renderer（P3 任务 5.8），也不依赖 IR。

### 3.3 后续依赖项标记（tasks §6 → 状态）

| 任务 | 状态 | 说明 |
| --- | --- | --- |
| 6.1 候选比较 | DONE | run `20260829-035314-p4a-f189b0c`，Reviewer PASS |
| 6.2 property tests | DONE | run `20260829-055341-p4a-5ac06b5`，Reviewer PASS |
| 6.3 本 ADR | DONE | 终态 `SPIKE_COMPLETE_NO_CORE_IR` |
| 6.4 versioned Render IR | **NOT APPLICABLE** | 无 producer；仅定义 schema 是无消费者的死代码。P7 任务 10.3/10.4 对表格 cell/结构操作的 local-range 证明是本 ADR 的内建复查点 |
| 6.5 协议 + owner registry | **部分实施** | Core-IR 请求协议（viewport/cancel/stale 的 IPC 机制）NOT APPLICABLE——local projection 已在 CM 事务内处理可见区重建/staleness/degraded（P2 任务 4.5/4.10/4.13 证据）。**construct owner registry 按本地形态实施**：保证 local/source-fallback/widget 每 construct 唯一 runtime owner；既有 `core` 类型位仅是历史占位，运行时拒绝注册，P5 若无新 ADR 则删除；P4B 7.1/7.3 消费 |
| 6.6 Core IR 增强投影接入 | **NOT APPLICABLE** | 无 Core IR 可接入。"IR 关闭时 P3 编辑保存不回归"由 6.8 全 gate 复核等效覆盖 |
| 6.7 dispatcher/benchmark/reconciliation/E2E | **NOT APPLICABLE** | 四个子项（Core dispatcher、IR payload benchmark、local→core adapter reconciliation、IR degraded/retry E2E）均为 Core IR 专属；desktop degraded 投影 E2E 已由 P2/P3 覆盖并在 6.8 复跑 |
| 6.8 全 gate + 终态记录 | DONE（见 P4A.md） | 终态 `SPIKE_COMPLETE_NO_CORE_IR`；`coreRenderIr` flag 无需存在（未实现即 default-off 的最强形式） |

### 3.4 对 P5 的记录义务

P5（tasks 8.x）须把"Core Render IR 未实现、复杂 construct 保持 source fallback、投影 source-map 为 local Lezer"写入未实现范围说明；不得把 P4A 表述为"Core IR 已完成"。

## 4. 后果

- 正面：P4B 立即可在受信 local ranges 上开工，无 IPC/staleness 机制负担；产品零新增依赖；UI 线程解析压力已被 viewport 增量解析压到亚毫秒级（spike 实测）。
- 负面：跨 surface 渲染一致性继续依赖"各 surface 各自解析"现状；若未来出现必须在 Core 侧产出的渲染需求，需要重新走一次 parser 资格认证。
- 中性：`markflow-core` 维持 P1A 的"无 parser"边界（未被破坏）。

## 5. 重议触发条件（任一满足即重开本 ADR）

1. P7 富块（image/table/diagram widget）出现无法用 local ranges 满足的跨 surface 一致性需求；
2. Rust 生态出现带 marker 级 ranges 且通过本 spike 同等 property 门禁的 parser；
3. Huge 文档（>10MB）出现 UI 线程解析瓶颈（现有证据：10MB 全量 ~0.5s，viewport 增量亚毫秒）；
4. P6 hidden-marker 状态机需要 Core 侧 ranges。

## 6. Program Owner 确认

PENDING-MANUAL：本 ADR 为 AI 调度器基于两轮独立复核证据冻结；Program Owner 界面人工验证阶段一并确认。
