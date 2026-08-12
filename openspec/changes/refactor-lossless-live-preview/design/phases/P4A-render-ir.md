# P4A：Parser/Source Map 与 Confirmed Render IR

## 1. 目标

为复杂 Markdown 投影选择可信 parser/source-map，并实现 versioned、可取消、可降级的 Core Render IR。IR 只增强投影，不参与保存。

## 2. 输入与依赖

- P3 Go；
- 默认 lossless 路径稳定；
- `design/05-render-ir-widgets-nfr.md`；
- canonical parser fixtures；
- [P4A 验证记录](../../validation/phases/P4A.md)。

## 3. 实施范围

- parser 候选 spike 与 ADR；
- source/content/marker ranges property tests；
- versioned RenderRequest/RenderResult；
- stable block identity 与 owner registry；
- viewport/cancel/stale/degraded；
- Core IR adapter 接管选定 constructs；
- payload/latency benchmark；
- 不默认启用高级 widgets。

## 4. AI Coding 验证

- 对所有候选生成同一 machine-readable range report；
- 对 CJK、emoji、escape、nested、malformed、Mixed EOL 做 source slice property tests；
- 验证每个 range 可回切原始 logical text；
- fuzz invalid ranges、deep nesting、huge token；
- 验证 stale revision/request/document/binding 全部丢弃；
- 验证 cancel 后无 late mutation；
- 验证 local→core owner handoff 无重叠；
- 验证 IR timeout/error 只局部 Source fallback；
- benchmark Normal/Large/Huge payload、latency、memory；
- 验证 parser/IR 全部关闭时 P3 编辑保存不回归；
- 运行 unit/integration/desktop degraded E2E。

## 5. 独立 Reviewer 验证

Reviewer 复核 parser 许可/维护风险、range 坐标、identity、unsafe payload、owner handoff、取消清理，并随机构造 malformed 文档验证不会越界或 panic。

## 6. 人工验证

1. 打开包含 table、footnote、reference、frontmatter、HTML、diagram 的文档；
2. 观察基础 local 与 Core IR 接管时无闪烁/重复布局；
3. 快速输入和滚动，确认 stale 结果不倒退界面；
4. 关闭 Core IR，确认基础 Live Preview/Source 与保存不变；
5. 模拟 IR 超时和错误，确认局部降级提示；
6. 在 Large 文档检查输入延迟和滚动；
7. 审阅 parser ADR，确认不把 parser serializer 引入保存。

## 7. 必须证据

- candidate comparison 与 ADR；
- range/fuzz reports；
- IR identity/cancel traces；
- owner reconciliation tests；
- benchmark；
- degraded E2E 与人工视频；
- Reviewer 结论。

## 8. Go/No-Go

P4A 有两个合法完成终态：

- `GO_CORE_IR`：选定 parser ranges 可信；IR stale/cancel/owner 安全；关闭 IR 不影响编辑保存；冻结的分级 SLO 通过。
- `SPIKE_COMPLETE_NO_CORE_IR`：所有候选均有可复现淘汰证据，ADR 决定不引入 Core IR；child change 以“spike 完成、产品保持 local projection/source fallback”关闭，不得把它记作实现失败。

`SPIKE_COMPLETE_NO_CORE_IR` 后，P4B 只能开展有可信 local ranges 的 construct；依赖 Core IR 的项标记 `NOT APPLICABLE / SOURCE FALLBACK`，P5 明确记录未实现范围。它不阻塞基础编辑器发布，也不能被表述为 Core IR 已完成。

No-Go：range 不能回切 source；IR 影响保存；stale 结果跨文档；无候选通过时仍强行选型；或没有完成候选淘汰证据就宣称 `SPIKE_COMPLETE_NO_CORE_IR`。

## 9. 回滚

关闭 `coreRenderIr`。清除 Core owner decorations/widgets，恢复 local 或 source-fallback。Core text/session/save 不变。
