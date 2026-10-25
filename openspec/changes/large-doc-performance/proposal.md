# Proposal

## Why

#411 要求 WYSIWYG 最大支持 10MB、源码模式最大支持 50MB 且全程流畅。实测基线（.tmp/perf-411/，三份 fixture × 真实管线计时）显示：10MB 长文本型文档已经全链达标（准入 588ms、按键 14.3ms、保存 286ms），50MB 源码模式的 CodeMirror 创建/IPC 接近免费；但**碎块型文档**（大量标题/列表/短段落）在 1.9MB 就让准入校验耗时 48 秒（10MB 直接挂死测试进程）——根因是 marked 自定义 tokenizer 的 `start` 回调在每个块边界全扫剩余文本造成 O(n²)，以及每按键同步全量 serialize/normalize 在大文档上贴近 50ms 上限。本变更按实测数据修复根因并固化可回归的基准。

## What Changes

- **tokenizer `start` 有界扫描（根因修复）**：`math-block` 与 `opaque` 两个 block 级 markdown tokenizer 的 `start` 回调改为 64KB 有界窗口扫描（substring + indexOf 手写探测，无回溯正则）。PoC 实测：慢 start 使碎块 lexer 82ms→1.4s（真实管线放大至 25.6s），有界版 118ms≈裸跑，收益约两个数量级。
- **结构复杂度预算闸门（准入预扫）**：WYSIWYG 准入新增内部结构块数预算（O(n) 单遍行扫描，非用户设置），超预算的文档留在源码模式并给出「结构过于复杂」提示（新稳定原因 `too-complex`）。预算值由修复后的实测块数-耗时曲线定档，保证预算内最坏准入耗时在秒级内。10MB 长文本型（~70 块）不受影响。
- **每按键路径削减**：onUpdate 不再同步执行全量 serialize（WYSIWYG）/ normalizeImageMarkdown（源码模式，50MB 实测 51.4ms 贴线），序列化与规范化挪入既有 400ms dirty-check 防抖回调。dirty 标记语义不变，仅延迟至防抖窗口内。
- **性能基准固化**：临时 bisect 基准整理为正式回归测试（大文档 parse/serialize/准入链、源码模式按键路径、50MB 用例），修复后数据作为回归基线；50MB 用例控制 CI 超时。
- **BREAKING（行为变化）**：超过复杂度预算的文档（原可被判 eligible 的大体量碎块文档）从「进入 WYSIWYG（长时间冻结后）」变为「留在源码模式 + 提示」；数学块/保留片段出现在 64KB 连续无空行块内部且其前文本超过窗口的极端场景下不再被 tokenizer 优先截取，由既有往返指纹校验兜底为局部字面量保留（无损性不变）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `wysiwyg-markdown-reconciliation`: 「WYSIWYG 资格门禁」新增结构复杂度预算拒绝场景（source-only + 稳定原因 too-complex），保持既有场景语义
- `document-limits-settings`: 「档位判定与准入分类从三项设置读取阈值」正文补充内部结构复杂度预算（非用户配置）与三项设置的关系，新增对应场景

## Impact

- **TS**：`src/editor/extensions/math-block.ts` 与 `src/editor/markdown/opaque/extension.ts`（start 有界扫描）、`src/editor/markdown/eligibility.ts`（复杂度预扫 + too-complex 原因）、`src/editor/markdown/admission.ts`（原因文案）、`src/editor/init.ts`（onUpdate 防抖化）、基准测试整理进 `src/__tests__/` 或 `src/editor/__tests__/`
- **测试**：新增复杂度预算判定用例、有界 start 行为用例（含 64KB 边界）、基准回归数据；删除临时 bisect 文件
- **Rust**：无改动（IPC 实测 50MB 编解码 43ms 无瓶颈）
- **spec**：两个 capability 的 delta（见上）
- **非目标**：Web Worker 化准入（修复后最坏路径已在秒级内，无需引入）；ProseMirror 虚拟化渲染（预算闸门保证进入 WYSIWYG 的文档规模可控）；marked 库升级；#405 主体的设置界面重构
