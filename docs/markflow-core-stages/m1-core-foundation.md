# M1: Core Foundation

## 阶段目标

建立 `markflow-core` 的最小文档内核，先证明 MarkFlow 可以做到：

- 打开 Markdown。
- 记录原始格式。
- 应用文本 patch。
- 未编辑文档保存后逐字节不变；编辑后未触及范围逐字节不变。
- Core 测试脱离 Tauri 运行。

本阶段不追求完整 Markdown 解析，不做 Live Preview，不替换 UI。

## 技术方案

### 1. crate 结构

M0 ADR 默认冻结为独立 crate：

```text
crates/
  markflow-core/
    Cargo.toml
    src/
      lib.rs
      document/
        mod.rs
        session.rs
        snapshot.rs
        line_index.rs
        line_ending_map.rs
        position_map.rs
        text_buffer.rs
        patch.rs
      testing/
        mod.rs
```

只有 M0 workspace spike 证明独立 crate 会阻塞当前 Tauri 构建时，才允许暂时在 `src-tauri/src/core/` 孵化；该例外必须记录退出条件，public API 仍按独立 crate 设计。

### 2. DocumentSession

最小模型：

```rust
pub struct DocumentSession {
    pub id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub original: OriginalSnapshot,
    pub text: TextBuffer,
    pub line_index: LineIndex,
    pub position_map: PositionMap,
}
```

职责：

- 持有当前文档文本。
- 持有原始文件快照。
- 跟踪 revision。
- 提供 byte offset 与 line/column 映射。
- 应用 `TextPatch`。
- 输出保存用 `SavePayload`；Core 不直接写文件。

### 3. OriginalSnapshot

记录打开文件时的格式信息：

```rust
pub struct OriginalSnapshot {
    pub bom: BomKind,
    pub encoding: EncodingKind,
    pub dominant_line_ending: LineEndingKind,
    pub trailing_newlines: usize,
    pub final_newline: bool,
    pub byte_len: usize,
    pub content_hash: ContentHash,
}
```

P0 完整支持 UTF-8 与 UTF-8 BOM。无效 UTF-8 或其他编码返回 `UnsupportedEncoding`，不得静默转码。

EOL 策略：

- 全 LF：保存继续 LF。
- 全 CRLF：保存继续 CRLF。
- Mixed：通过 `LineEndingMap` 逐行保留；新增行继承当前块或相邻行，最后使用主导换行风格。

Mixed EOL 行级保真是 M1 退出条件，不能只识别文档为 Mixed。

### 4. TextBuffer

P0 使用 LF 逻辑文本 + EOL map：

```rust
pub struct TextBuffer {
    logical_text: String,
    line_endings: LineEndingMap,
}
```

保留未来替换 rope 的边界：

- `len_bytes()`
- `slice(range)`
- `chunks(range)`
- `replace(range, text)`
- `write_save_payload(writer, policy)`

`LineEndingMap` 不使用“每行一个重量对象”的直接表示。普通 LF/CRLF 文档使用单一 span，Mixed EOL 使用 run-length encoded spans，并支持 patch 后局部更新。

### 5. PositionMap

明确三种坐标：

- Core 内部 UTF-8 byte offset。
- CodeMirror / IPC UTF-16 code unit offset。
- 保存时源字节 offset。

`PositionMap` 提供双向转换，所有跨层 range 使用 typed newtype 并绑定 revision。中英文、emoji、combining mark、CRLF 和 Mixed EOL 必须有 property test。

### 6. TextPatch

```rust
pub struct TextPatch {
    pub transaction_id: TransactionId,
    pub base_revision: Revision,
    pub changes: Vec<TextChange>,
    pub selection_after: Option<Selection>,
}

pub struct TextChange {
    pub range: SourceRange,
    pub replacement: String,
}
```

应用规则：

- `base_revision` 必须匹配当前 session revision。
- 多 change 需要按 range 排序并检查不重叠。
- patch 成功后 revision + 1。
- patch 失败不能修改 session。
- 相同 transaction id 重试必须幂等。
- range 不能落在 UTF-8 code point 或 UTF-16 surrogate pair 中间。

### 7. Lossless fixtures

建立 fixtures：

```text
crates/markflow-core/fixtures/lossless/
  lf.md
  crlf.md
  mixed-eol.md
  utf8-bom.md
  unicode-offsets.md
  trailing-newlines.md
  frontmatter.md
  html-comment.md
  mixed-list-markers.md
  code-fence-backtick.md
  code-fence-tilde.md
  table-alignment.md
```

测试类型：

- open -> save byte-for-byte。
- open -> apply small patch -> save。
- untouched ranges byte-for-byte。
- 对 `bekoedit-markdown` 参考行为运行同一 fixture，差异必须记录在 M0 采用策略 ADR，不能把上游行为直接定义为 MarkFlow contract。

## 交付物

- Core 基础 crate/module。
- `DocumentSession`。
- `OriginalSnapshot`。
- `LineIndex`。
- `LineEndingMap`。
- `PositionMap`。
- `TextPatch`。
- lossless fixture 测试。

## 验收标准

- 未编辑 fixture open -> save 后 byte-for-byte 一致。
- CRLF 文件保存后仍为 CRLF。
- Mixed EOL 文件未编辑行逐行保持原 EOL。
- UTF-8 BOM 文件保存后仍保留 BOM。
- 尾部空行数量保存后不变。
- 对单段落应用 patch 后，未编辑区域 byte-for-byte 一致。
- patch revision 不匹配时失败，且 session 内容不变。
- UTF-8 byte / UTF-16 / source byte 映射双向一致。
- Core crate 依赖图不包含 Tauri、WebView、DOM 或网络/文件 IO adapter。
- Core 单元测试不需要启动 Tauri。
- Core public API 不暴露 `bekoedit-markdown` 类型；即使 M0 决定复用，也必须通过 MarkFlow-owned facade 隔离。
- 当前应用旧编辑路径不回退。

## 测试要求

- Rust unit tests：snapshot、line index、patch apply、save bytes。
- Fixture tests：lossless roundtrip。
- Property tests：随机 Unicode patch 不产生 invalid UTF-8，位置和 EOL map 可逆。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| P0 就引入 rope 导致复杂度上升 | P0 使用 String，保留 trait 边界 |
| Mixed EOL 映射复杂 | M1 直接建立行级 EOL map，用 property test 固化；不把复杂度推到保存阶段 |
| Core crate workspace 调整影响 Tauri build | 可先内部模块孵化，但 API 按 crate 设计 |
