# Parser、Local Projection、Widgets 与非功能设计

## 1. Parser/source-map 终态

P4A 已完成 CodeMirror Lezer、draft ParseIndex、markdown-rs、pulldown-cmark/comrak 的统一评估：

- CommonMark/GFM/现有 extension 覆盖；
- source/content/marker range 精度；
- malformed/unknown fallback；
- UTF-16、UTF-8、CRLF/Mixed EOL 映射；
- incremental/viewport 性能；
- AST identity 稳定性；
- WASM/IPC payload；
- 许可、维护活跃度和供应链风险。

Parser 只提供 ranges/structure/diagnostics，不成为保存 serializer。已冻结结论为 `SPIKE_COMPLETE_NO_CORE_IR`：Lezer local ranges 是本 change 唯一受信 source-map；复杂或不可信范围回退源码。

## 2. Local construct descriptor

```text
LocalConstructDescriptor {
  bindingGeneration, sessionId, documentId, revision,
  constructId, parentId, kind,
  sourceRange, contentRange, markerRanges,
  owner: local | widget | source-fallback,
  editableSlots, fallbackPolicy
}
```

所有 ranges 半开且使用 CodeMirror UTF-16 坐标；跨 Core patch 时经 PositionMap 转换。Descriptor 在同一 EditorState revision 内派生，不经 IPC、不持久化、不携带可执行 HTML。异步 widget result 仍必须校验完整 identity。

## 3. Identity 与嵌套 owner

construct ID 可基于结构 path、source anchor、content hash 与 transaction mapping 组合，但不能假设 offset 永不变化。身份不可信时销毁对应 widget 并回退源码，不能把旧 widget 状态应用到新文本。

Owner 唯一性以 construct identity 为粒度，不表示父子 source range 绝对不能包含。Parent 必须声明让出的 child ranges/editable slots：task-in-list 由 list owner 让出 checkbox marker；image-in-paragraph 由 paragraph owner 让出 image range；table widget 只在可信 cell slot 内允许 P6 inline owner。最小 `source-fallback` range 压制其内部全部投影。Owner handoff 必须在一个状态更新内完成，不能出现重复 decoration 帧。

## 4. Widget protocol

每个 widget 必须声明：

- source/content/marker ranges；
- read-only projection 与可编辑控制；
- focus、keyboard、selection、reveal 行为；
- commit/cancel 生成的 CM transaction；
- History boundary；
- async request identity/cancel；
- failure fallback；
- sanitize/CSP/URL policy；
- accessibility name、role、state；
- print/export policy。

Widget DOM 永远不是正文。widget commit 只能返回 source changes，由 active binding 校验。

## 5. Cohort 与阶段归属

1. P4B：owner/visibility/interaction harness、task checkbox、code fence controls、FrontMatter safe projection、raw HTML policy；marker 保持 visible/dimmed。
2. P6：heading/paragraph/thematic break → inline marks → links → quote/lists/task → fence 的 hidden/reveal cohorts。
3. P7：P4B 轻量 widget 与 hidden 联动收口 → image → GFM table → Mermaid/PlantUML → 发布支持矩阵。

每项独立 projection flag 与 visibility flag。一个 cohort/widget 失败只关闭自身并回到 dimmed/source fallback，不能让基础 Live Preview、其他 construct 或保存失效。

## 6. 性能等级

| 等级 | 建议阈值 | 投影策略 |
| --- | --- | --- |
| Normal | 小于 1MB 且少于 5k 行 | 完整基础投影，viewport 高级 widgets |
| Large | 1-10MB 或 5k-50k 行 | viewport-only、扩大 debounce、重型 widget 按需 |
| Huge | 大于 10MB 或 50k 行 | 默认 Source，禁用重型 widget，保留无损编辑/保存 |

必须记录打开时间、首可输入时间、transaction p50/p95/p99、local projection latency、widget render latency、save latency、峰值 RSS、DOM/widget 数。性能降级不能改变 byte 合同。

以下为初始 release SLO；P0/P1B 可用基线数据提出 ADR 调整，但必须在进入 P4A 前冻结，变更需 Program Owner 与 Reviewer 签字，不能在测试失败后临时放宽：

| 等级 | 首可输入 p95 | 普通输入端到端 p95/p99 | 保存 p95 | 峰值增量 RSS | 投影 |
| --- | --- | --- | --- | --- | --- |
| Normal（1MB fixture） | ≤ 500ms | ≤ 16ms / 50ms | ≤ 1s | ≤ 200MB | 基础全量 + viewport widgets |
| Large（10MB fixture） | ≤ 2s | ≤ 50ms / 100ms | ≤ 3s | ≤ 400MB | viewport-only |
| Huge（50MB fixture） | ≤ 5s | ≤ 100ms / 200ms | ≤ 10s | ≤ 750MB | 默认 Source，无重型 widget |

测量至少包含 30 次冷打开、1,000 次确定性输入 transaction 和 30 次保存；报告硬件、OS/WebView、fixture hash、warm/cold 状态与置信区间。三平台分别判定，不得用高性能平台平均值掩盖失败平台。任一 byte、安全或正确性失败均优先于性能结果。

## 7. 安全

- raw HTML 默认源码显示或严格 sanitize preview；
- link/image URL 使用现有安全 URL policy；
- Mermaid/PlantUML 不执行任意脚本；
- 外部网络资源受产品设置、CSP、SSRF 与下载策略约束；
- widget/diagnostic/log 不包含完整正文；
- clipboard HTML 必须 sanitize；
- widget message 必须校验 identity、schema 和长度；
- fuzz malformed Markdown、超深 nesting、巨大 token 和恶意 URI。

## 8. Accessibility

每个默认 cohort/widget 验证：keyboard-only、screen reader name/role/value、focus visible、high contrast、reduced motion、zoom 200%、marker reveal 可发现性、atomic range 可绕过、错误状态可读。隐藏 marker 不得让屏幕阅读器丢失正文或让复制结果缺少 Markdown source；screen-reader descriptor 与 plain-text copy 必须读取 CodeMirror/Core source range，不能依赖 rendered DOM 是否保留 marker。

## 9. 观测性

结构化事件：session open/close、patch send/ack/retry/resync/blocked、projection local/widget/fallback、widget stale/cancel/error/create/dispose、save prepare/write/commit/conflict、feature flag snapshot。

日志只记录哈希化 identity、revision、range 长度、计数、耗时、错误码和环境；正文、clipboard 内容、token 与完整私人路径必须脱敏。

## 10. 发布稳定性

P5 需要至少覆盖：长时间编辑、频繁模式切换、多文档切换、autosave、外部修改、休眠恢复、窗口关闭、IME、图片、表格、图表、Large/Huge 文档。每次 observation 绑定同一 release candidate commit；中途改代码后重新计时。

冻结候选的最低稳定观察合同：

- macOS、Windows、Linux 每个平台累计至少 8 小时，至少 2 个独立 session；
- 每个平台至少 500 次人工/录制用户操作、100 次模式切换、50 次保存、20 次 autosave、10 次外部冲突、10 次 A/B 文档切换和 5 次休眠/恢复或等价生命周期；
- 另运行至少 10,000 次自动化 text transactions、1,000 次 save/reconcile、1,000 次模式切换和 100 次 failure injection；
- Data Loss、Security、Cross-document、Save Safety、不可恢复 crash 数必须为 0；
- 非阻塞功能错误率必须 ≤ 0.1%，且每个失败都建立 issue；同一根因重复两次即 No-Go，不得用平均值稀释；
- SLO 表全部通过，且无持续增长的 RSS、widget/DOM/session 泄漏。

观察时长、样本数或门槛若需调整，必须在冻结 release candidate 前通过 ADR；候选运行过程中不得降级验收标准。
