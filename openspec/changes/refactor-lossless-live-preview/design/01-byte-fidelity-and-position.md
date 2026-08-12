# Byte fidelity、EOL 与坐标设计

## 1. 核心合同

### L0：未编辑保真

同一文件打开后未发生正文 transaction 时：

- autosave 不得写盘；
- 显式 Save 若执行写盘，输出 bytes 必须与输入完全相同；
- Source/Live Preview 切换、主题切换、projection 重建、outline 和 export preview 不得改变正文 revision；
- mtime 是否改变由“是否跳过干净保存”策略决定，但 bytes 必须一致。

### L1：编辑后未触及区域保真

用户编辑只允许改变 transaction 显式覆盖的 source byte spans 和为该操作新增的 bytes。未触及 BOM、EOL boundary、尾部换行、marker、空格、fence、HTML、引用定义和未知语法必须保留。

L1 不等于输出与输入全文件相同。验证器需要保存 edit intent，并证明 surviving prefix/suffix 或 interval map 对应 bytes 相同。

## 2. 文本表示

```rust
struct OriginalSnapshot {
    original_hash: ContentHash,
    original_len: u64,
    bom: BomKind,
    encoding: EncodingKind,
    line_endings: LineEndingMap,
    trailing_line_breaks: u32,
    file_identity: FileIdentity,
}

struct TextBuffer {
    logical_lf_text: RopeOrString,
    original: OriginalSnapshot,
    revision: Revision,
}
```

CodeMirror 始终看到 LF 逻辑文本。Core 保存时根据 surviving/new boundary provenance 恢复 source bytes。`trailing_line_breaks` 只用于诊断和快速断言，不作为像 #189 那样的补偿元数据；真正保存结果来自 TextBuffer 与 boundary provenance。

## 3. EOL boundary 规则

每个逻辑 `\n` 对应一个 `LineEndingEntry`：`LF`、`CRLF` 或 `CR`。规则如下：

1. 未被 edit range 覆盖的 boundary 保留原类型。
2. 删除换行时删除对应 boundary。
3. 新增换行若逐项携带显式 `LF/CRLF/CR` provenance（例如 paste/drop），Core 使用该显式类型。
4. 普通 `inherit` 换行按固定顺序解析：同序号被替换 boundary → 插入点右邻 surviving boundary → 左邻 surviving boundary → 文档主导 EOL → 新文档默认 EOL。禁止不同模块交换右邻和左邻优先级。
5. 一次 replacement 插入多个 `inherit` 换行时，按文档顺序一对一消费被替换 boundary；超出部分继续使用同一固定邻域顺序。
6. 文档主导 EOL 由原始 snapshot 中各类型数量决定；并列时使用文档创建/打开时冻结的 `defaultEol`，不得根据当前平台临时变化。
7. 文件无换行时使用文档创建配置中冻结的 `defaultEol`。
8. paste/drop 管线必须在 CodeMirror 归一化前读取原始 payload，把每个原始 CRLF/CR/LF 编码为 transaction annotation；普通键入和没有可信 provenance 的程序化命令使用 `inherit`。
9. Save As 默认保留已有文档 BOM/EOL；新文档使用显式默认。改变格式必须是用户命令并显示影响。

上述规则必须在 P0 ADR 冻结，任何修改都要同步 capability spec、Patch DTO 和 golden fixtures。

## 4. 坐标类型

禁止裸 `number` 跨层传递文本位置。至少定义：

- `Utf16Offset`：CodeMirror transaction/selection 使用；
- `LogicalUtf8ByteOffset`：Core logical LF text 使用；
- `SourceByteOffset`：包含 BOM 和原始 EOL 宽度的磁盘 bytes 使用；
- `Revision`：位置所属文本版本；
- `Affinity`：边界插入时 selection 偏向 before/after；
- `SourceRange<T>`：同一坐标系的半开区间。

DTO 必须带 `positionEncoding` 或使用不同字段名。Rust newtype 与 TypeScript branded type 都要阻止误用。

## 5. PositionMap

PositionMap 提供：

- UTF-16 ↔ logical UTF-8 byte；
- logical UTF-8 byte ↔ source byte；
- revision N range 经 TextPatch 映射到 N+1；
- selection direction/affinity 映射；
- invalid boundary 的明确错误。

不得把 offset 截断到最近字符边界后继续。落入 surrogate pair、UTF-8 continuation byte、CRLF 中间或 BOM 中间的请求必须返回稳定错误码。

## 6. Canonical fixtures

最小矩阵包括：

- UTF-8 无 BOM、UTF-8 BOM；
- LF、CRLF、CR、Mixed；
- 尾部 0、1、2、3 个 line breaks；
- 空文件、仅 BOM、仅换行、仅空格；
- CJK、emoji、组合字符、ZWJ emoji、surrogate pair；
- heading、list marker、nested list、blockquote、fence、frontmatter、table、reference、footnote；
- raw HTML、未知 extension、malformed fence/link/table；
- 图片前后多个空行；
- 1MB、10MB、50MB 生成文件。

每个 fixture 配套：原始二进制文件、SHA-256、逻辑文本预期、EOL map 预期、L0 expected bytes，以及至少三组 L1 edit intent 和 expected surviving intervals。

## 7. 验证算法

L0：

```text
input_sha256 == saved_sha256
input_length == saved_length
byte_diff_count == 0
```

L1：

1. 记录 source edit ranges 和 inserted bytes；
2. 根据 patch 生成 old→new surviving interval map；
3. 对每个 surviving interval 比较原始 bytes 与保存 bytes；
4. 对新插入范围核对 intent；
5. 单独断言 BOM、尾部 line breaks、未触及 EOL entries；
6. 输出 machine-readable JSON diff report。

只比较渲染后 Markdown 字符串、去掉尾换行后字符串或 parser AST 不足以证明 L0/L1。

## 8. 失败行为

- 无效 UTF-8：P1 首期只读或拒绝，不得 replacement decode 后覆盖。
- PositionMap 失败：patch 被拒绝，pipeline 进入 blocked/resync，不得猜 offset。
- EOL provenance 不一致：保存被阻止并输出诊断，不得统一为 LF。
- hash/identity 冲突：进入 external conflict，不得自动覆盖。
- 内存不足或超限：回退 Source/只读；不能牺牲 bytes 换取打开成功。
