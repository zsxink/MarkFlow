# M2: Parse Index, StyleMap and Large Document Policy

## 阶段目标

让 Core 能理解 Markdown 的基础块结构，捕获原文风格信息，并建立按文件大小触发的大文件策略。

本阶段仍不替换 UI，只输出结构化索引。

## 技术方案

### 1. Block Scanner

基于 M0 选定 parser 的 concrete token/position 建立 block index，并用 MarkFlow lexical/style scanner 补充 trivia。只有在 benchmark 证明完整 parser 无法满足首屏预算时，才增加轻量 Level 1 block scanner；它不能演变为第二套完整 CommonMark。

覆盖 MarkFlow 最重要的 Markdown 块：

- FrontMatter
- HTML Comment
- Heading
- Paragraph
- Blockquote
- Bullet List
- Ordered List
- Task List
- Code Fence
- Table
- Link Reference
- Image block
- Thematic Break

输出：

```rust
pub struct BlockNode {
    pub id: BlockId,
    pub kind: BlockKind,
    pub range: SourceRange,
    pub content_range: SourceRange,
    pub line_range: LineRange,
    pub parent: Option<BlockId>,
    pub children: Vec<BlockId>,
}
```

### 2. ParseIndex

```rust
pub struct ParseIndex {
    pub revision: Revision,
    pub blocks: Vec<BlockNode>,
    pub outline: Vec<OutlineItem>,
    pub block_by_line: Vec<BlockId>,
}
```

`BlockId` 默认只在当前 revision 内有效。表格、widget 或诊断如果跨 revision 保存引用，必须通过 kind、邻近 source anchor 和 content fingerprint 做 reconciliation；禁止把旧 id 直接用于新 revision edit command。

用途：

- UI 大纲。
- viewport render。
- edit command 查上下文。
- diagnostics 查范围。
- search result 映射。

### 3. StyleMap

捕获原文风格：

```rust
pub struct StyleMap {
    pub dominant_line_ending: LineEndingKind,
    pub default_bullet: Option<BulletMarker>,
    pub default_ordered_marker: Option<OrderedMarker>,
    pub default_fence: Option<FenceStyle>,
    pub list_spans: Vec<ListStyleSpan>,
    pub quote_spans: Vec<QuoteStyleSpan>,
    pub table_spans: Vec<TableStyleSpan>,
}
```

示例：

- `* item` 所在 list span 记录 bullet 为 `*`。
- `~~~rust` 记录 fence marker 为 `~`，长度为 3。
- 表格记录每列 alignment、pipe padding、是否首尾 pipe。

### 4. Parser 对照

第三方 parser 不直接成为产品 API，但 M0 选定的主 parser 是 Core 内部语义来源：

- 对照 heading/list/code/table 的识别。
- 对照 GFM table 和 task list。
- 对照异常 Markdown 的容错行为。
- 使用 CommonMark/GFM 官方用例和 MarkFlow lossless fixture 做 differential test。

### 5. 增量边界预留

M2 可以先全量 block scan，但 API 需要预留：

```rust
fn update_after_patch(&mut self, patch: &AppliedPatch) -> AffectedRanges;
```

后续 M4/M6 再优化增量解析。

增量规则：

- 每次 patch 先向前找到安全 block boundary，再向后扫描到结构重新同步。
- fence、HTML block、list 等无法在预算内确认边界时，返回局部 stale 标记并调度后台全量 parse。
- 同步输入路径有明确时间/字节预算，不能无限扫描到文档末尾。
- 后台结果绑定 revision，旧结果直接取消或丢弃。

### 6. Large Document Policy

大文件按大小定义，第一版阈值：

```text
Normal: <= 1MB
Large:  > 1MB 且 <= 10MB
Huge:   > 10MB
```

超过 1MB 后：

- 打开后仍立即进入可编辑状态。
- 默认只做 Level 0/1：字节、行索引、block scan。
- inline parse、diagram render、image diagnostics、full diagnostics 进入按需或空闲任务。
- Render IR 默认按 viewport 请求。
- 搜索分页返回。

后续可以继续调整或细分档位，但产品触发点始终以 `> 1MB` 为准。

行数、最大单行长度、嵌套深度和节点数只影响档位内预算，不改变按字节数得到的产品档位。Huge 仍保留 Source 和 WYSIWYG；进一步收紧的是同步解析、诊断和自动 widget 预算。

## 交付物

- `BlockScanner`。
- `ParseIndex`。
- `StyleMap`。
- `LargeDocumentPolicy`。
- `Outline` 输出。
- block range fixture。

## 验收标准

- Fixture 中每个 block 都有正确 byte range。
- 大纲输出与 Markdown 标题层级一致。
- FrontMatter 被识别为独立 block，内容不被当成普通 thematic break。
- HTML Comment 被识别并保留 range。
- 不同 list marker 能被记录到 StyleMap。
- 不同 code fence marker 和 fence length 能被记录。
- GFM table alignment 能被记录。
- 超过 1MB 的 fixture 被标记为 Large Document。
- 超过 10MB 的 fixture 被标记为 Huge。
- Large Document 不默认启动全量 inline parse、图表渲染和全量 diagnostics。
- Parser 不改写文档内容。
- 未知语法不会导致整个 parse 失败。
- 10MB patch 后同步重扫不超过 M0 冻结预算；超限时能够取消并后台恢复。
- parser、style scanner 与官方/对照 fixture 的差异均有 allowlist 和理由。

## 测试要求

- Rust unit tests：每类 block scanner。
- Fixture tests：source range snapshot。
- Golden tests：outline JSON。
- Parser comparison tests：与选定第三方 parser 的基础结构对照。
- Incremental tests：fence 开闭、列表缩进和 HTML block 引起的远距离失效。
- Benchmark：1MB、10MB、50MB 的 initial parse、viewport parse 和 patch reparse。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| Markdown 语法边界复杂 | M2 只做 block scanner，不做完整 inline parser |
| 第三方 parser 输出和 Core 不一致 | Core API 以 source range 和保真为准，第三方只做参考 |
| 表格识别误判普通段落 | 只在符合 GFM delimiter row 时识别 table |
