# Design

## Context

实测基线（2026-10-25，本机 M 系列芯片，fixture 与日志在 `.tmp/perf-411/`，生成脚本 `gen-fixtures.mjs` 可复现）：

| 场景 | 步骤 | 实测中位数 | #411 目标 | 判定 |
|---|---|---|---|---|
| 10MB 长文本（69 块）WYSIWYG | decideAdmission 全链 | 588ms | 打开 ≤5s | ✓ 已达标 |
| 10MB 长文本 WYSIWYG | 按键（PM 事务 0.6ms + onUpdate 全量 serialize 14.3ms） | 14.3ms | P95 ≤50ms | ✓ |
| 10MB 长文本 | reconcileSave（serialize+指纹） | 286ms | 保存 ≤2s | ✓ |
| 1.9MB 碎块（11.6 万节点） | marked.lexer（真实管线） | **25.6s** | — | ✗ |
| 1.9MB 碎块 | decideAdmission 全链 | **48s** | — | ✗ |
| 10MB 碎块 | 任何 parse | 测试进程挂死 | — | ✗ |
| 1.9MB 碎块 | 按键（含全量 serialize 148ms） | 127.8ms | ≤50ms | ✗ |
| 10MB 碎块 | marked.lexer **裸实例**（无扩展注册） | 430ms（线性） | — | 根因定位 |
| 1.9MB 碎块 | 慢 start 扩展 PoC / 有界 start PoC / 裸 | 1.4s / 118ms / 82ms | — | 修法验证 |
| 50MB 混合 源码模式 | CM6 EditorState.create（10MB 实测 13ms 线性外推） | ~70ms | 打开 ≤3s | ✓ |
| 50MB 混合 源码模式 | 按键路径 doc.toString + **normalizeImageMarkdown** | 0.1ms + **51.4ms** | ≤50ms | ⚠ 贴线 |
| 50MB 混合 | IPC JSON 编+解码 | 43ms | — | ✓ |

**根因**：marked 在每个块边界对每个 block 级自定义扩展调用 `start(剩余全文)`。`math-block.ts` 的 `src.search(/^[ \t]{0,3}\$\$/m)`（多行锚定正则）与 `opaque/extension.ts` 的 `src.indexOf(OPAQUE_SENTINEL_PREFIX)` 在**无匹配时全扫剩余文本**——普通文档不含 `$$`/sentinel 必然无匹配 → 每块边界 O(剩余长度) → O(n²)。碎块块数多，平方项引爆；长文本型块数少（69 块），故已达标。裸实例 430ms 线性与慢管线 25.6s 的对照、以及 PoC（慢 start 1.4s → 有界 118ms ≈ 裸跑 82ms）三层验证确认。

**次生热点**：① `init.ts` onUpdate 对每个 docChanged 事务**同步**执行全量 serializeMarkdown（WYSIWYG）或 normalizeImageMarkdown（源码）——结果只被 400ms 防抖后的 dirty 比较消费；② 源码模式 50MB 按键 normalize 51.4ms 贴线即来自此。

## Goals / Non-Goals

**Goals:**
- 碎块型文档的准入链从「48s/挂死」降到与块数线性，预算内最坏准入秒级内
- 按键路径脱离全量同步 serialize/normalize（两模式），大文档按键回 50ms 内
- 超预算文档快速、明确地留在源码模式（CM6 侧实测接近免费）
- 基准数据固化为可回归测试

**Non-Goals:**
- Web Worker 化准入/序列化（修复后最坏路径已在秒级，引入 Worker 的模块化成本不成比例）
- ProseMirror 虚拟化渲染（预算闸门控制进入 WYSIWYG 的规模，避免该架构级工程）
- marked 底层升级/替换（有界 start 是对注册约定的正确使用，非绕过）
- 滚动/输入 P95 的真机自动化测量（留人工验证清单；自动化覆盖 CPU 侧全链）
- Rust 侧改动（IPC 43ms@50MB 无瓶颈）

## Decisions

### D1. tokenizer `start` 有界扫描（根因修复）

`math-block.ts` 与 `opaque/extension.ts` 的 `start` 改为：`src.substring(0, LIMIT)` 窗口内用 `indexOf` 探测（math：找 `$$` 后回看行首与 ≤3 缩进；opaque：找 sentinel 前缀首种子子串），窗口内无命中返回 -1。`LIMIT = 64 * 1024`。

- 实施补充（火焰图定位后的完整修复面）：仅修自家 math/opaque `start` 后碎块 lexer 仍 22s——逐 starter 禁用、整体禁用扩展数组、Lexer 方法插桩、CPU profile 四层探针最终定位剩余两个 O(n²) 源：`extension-table` 上游 `start` 的 `src.split('\n')` 全扫剩余文本，与 `extension-list` 上游 orderedList/taskList `tokenize` 的全量入口（profile：11.2s `parseIndentedBlocks` + 10.9s `split`）。修法为项目侧运行时合成覆盖——`table.ts` 的 `tableStart`（只扫到第二个换行，与上游首两行判定逐条件等价）与 `list-fast-tokenizer.ts` 的 512 字符首行 guard（宽松于上游接受条件，guard false ⇒ 上游必 false）。全部落地后 1.9MB 碎块真实管线 lexer 22.7s→172ms。
- 收益依据：PoC 118ms ≈ 裸 82ms；substring 复制 + SIMD indexOf 每次微秒级，块边界调用量 × 64KB 复制在 10MB 碎块外推 ~0.2-0.5s，线性。
- **语义正确性**：`start` 返回 -1 只意味着「本轮不截断」，内建 tokenizer 照常消费下一个块；下一块边界 `start` 再次被调，匹配进入窗口后仍会被发现。唯一风险是单个内建块一次消费超过 64KB 且把真实 `$$`/sentinel 行吞进段落（连续无空行 >64KB 的段落/列表）——该场景由既有往返指纹校验兜底为局部字面量保留，**无损性不变**（这是 admission 管线的既有安全网，不是新豁免）。
- 备选否决：按剩余全文手写扫描（仍 O(n²) 常数小一点）；升级 marked（`start` 契约未变，问题在注册侧使用方式）；为 start 加跨调用缓存（src 每次是新 string，无恒等性）。

### D2. 结构复杂度预算闸门（准入预扫）

在 `classifyEligibility`（体积/行数检查之后、任何 parse 之前）追加单遍块级结构计数：空行分隔的块 + 列表项/引用行等结构行，O(n) 无回溯（10MB ~30ms）。超过预算常量 → `{ verdict: 'source-only', reason: 'too-complex', category: 'admission-threshold' }`，不进入 parse/往返/fallback。

- **预算值定档方法**（apply 阶段执行）：D1 落地后跑块数-耗时曲线（5k/2 万/5 万块量级 fixture），取「decideAdmission 最坏 ≤2s」的块数向下取整为安全档（初值预期 2 万~5 万块），写为具名常量并记录定档数据于基准测试注释。预算不是用户设置（#405 精简方向），文案引用预算数值（对齐「超限提示引用实际生效数值」既有契约）。
- 与 #450 删除的 complexity 闸门的区别：旧闸门是编辑中 toast（零强制力、每事务开销）；新预算是准入时点的硬闸门（拒绝进 WYSIWYG、一次 O(n) 预扫、无编辑期开销）。
- 备选否决：parse 中途取消（侵入 marked/tiptap 管线，且 25s 级 parse 已被 D1 消除，预算只需拦「线性也撑不住的规模」）；节点数闸门（需先 parse 才知道节点数，预扫块数是 parse 前可得的相关量）。

### D3. onUpdate 序列化防抖化

`init.ts` onUpdate：删除同步 `serializeMarkdown` / `normalizeImageMarkdown(getSourceContent())`，改为在既有 `scheduler.schedule('dirty-check', 400)` 回调内执行序列化+比较。同步保留的仅 `bumpRevision()`（正确性边界，原注释已说明）。

- 语义影响：dirty 标记的出现延迟到防抖窗口内（400ms 后）——dirty 判断本来就延迟 400ms，语义不变；保存/切模式路径自行调用 serialize（bridge 独立入口），不受影响。
- 收益：WYSIWYG 大文档按键从「含 14.3ms（10MB 长文）~148ms（碎块）serialize」回到纯事务 0.6ms 级；源码模式 50MB 按键从 51.4ms 回到亚毫秒。
- 风险：dirty-check 回调里 serialize 失败（`serialized?.ok === false`）时维持现行为（不置 dirty）。防抖回调中文档可能已被切换——现有 `dirty-check` 已有取消逻辑（session.ts 注释「Cancel any pending dirty-check」），沿用。

### D4. 基准固化

整理 `.tmp` 三份临时 bench 为正式测试（预计 `src/editor/__tests__/large-doc-benchmark.test.ts`）：修复后基线数据写入注释；断言策略沿用现有 benchmark 先例（finite + 数量级 sanity，不做硬阈值 gate 防 CI 抖动）；50MB 用例设独立大 timeout 并控制在少数用例；删除临时 bisect/supplementary 文件与 `.tmp` 依赖（正式测试用程序化生成的 fixture，尺寸缩小到 CI 可接受：如 10MB 碎块 + 50MB 仅源码侧两个用例）。修 `st.update` 用法笔误。

### D5. spec 契约

`wysiwyg-markdown-reconciliation`「WYSIWYG 资格门禁」MODIFIED 增「结构过于复杂的文档」场景；`document-limits-settings`「档位判定与准入分类从三项设置读取阈值」MODIFIED 补内部预算与三项设置的关系 + 碎块拦截场景。基准数据与预算定档记录在 design/测试注释，不进 spec（非用户可见行为契约的数值）。

## Risks / Trade-offs

- [有界窗口吞并：>64KB 连续无空行块内嵌 `$$`/sentinel] → 往返指纹校验兜底为局部字面量保留，无损性不变；该形态在真实文档中趋零（数学块与 opaque 均独立成行、前后空行）。基准中加入边界用例锚定。
- [预算值定档依赖本机数据，跨机波动] → 定档留 2 倍安全余量；预算只影响「多大碎块文档进 WYSIWYG」，误伤面是留源码（安全侧）；基准测试记录定档依据可复查。
- [onUpdate 防抖化改变 dirty 时序] → dirty 语义本就 400ms 延迟；保存/切模式不依赖该回调的 serialize 结果。verify 阶段专项走查保存与切换路径。
- [碎块大文档从可进（卡死后进）变为不可进 WYSIWYG] → 预期行为变化，spec 已声明；源码模式（CM6）实测可流畅承载，降级路径明确。

## Migration Plan

代码即迁移，无数据迁移。回滚 = 还原版本；预算拒绝的文档在回滚后回到旧的冻结行为。

## Open Questions

（预算精确常数值在 apply 阶段按 D2 的定档方法确定，属既定流程而非未决分歧。）
