# M3: Core-backed Source Mode

## 阶段目标

让 Source Mode 率先接入 Core session，并让保存内容只来自 Core confirmed snapshot，不再来自前端 Markdown serializer。

这是第一次用户路径接入 Core，但不改变默认 WYSIWYG 体验。

## 技术方案

### 1. Session Registry

在 `markflow-runtime` 维护 session registry，Tauri 只暴露 IPC adapter：

```rust
pub struct SessionRegistry {
    sessions: HashMap<SessionId, Arc<SessionHandle>>,
}
```

Tauri command 通过 session id 操作文档，不直接传整篇 Markdown 作为保存真相。

- 每个 session 独立加锁，不能用全局锁包住 parse、save 或 await。
- session 绑定 client/window ownership；关闭一个窗口不能释放其他窗口 session。
- 同一路径多窗口使用独立 session，第二个保存者通过 FileIdentity 进入冲突流程，不做实时合并。

### 2. IPC Commands

新增或替换命令：

```rust
open_document(path) -> DocumentOpened
get_document_text(session_id) -> String
apply_text_patch(session_id, utf16_patch) -> ApplyPatchAck
resync_document(session_id, confirmed_revision) -> ResyncResult
flush_document(session_id) -> FlushResult
save_document(session_id) -> SaveResult
get_outline(session_id) -> Outline
get_document_stats(session_id) -> DocumentStats
close_document(session_id) -> ()
```

`DocumentOpened` 包含：

- session id
- revision
- text
- original snapshot summary
- outline
- stats
- protocol version / capabilities

Normal/普通 Large 文档可在 `DocumentOpened` 返回 text。Huge 文档的首次 text transport 由 M0/M3 benchmark 决定使用 raw payload 或 ordered channel 分块，禁止未经测量固定为 JSON 大字符串。

### 3. CodeMirror 同步

Source Mode 中：

```text
CodeMirror transaction
→ Adapter 立即提交本地乐观镜像
→ 同一 animation frame / composition 内 patch batching
→ apply_text_patch(base_revision, transaction_id, Utf16TextPatch)
→ Runtime 转换坐标，Core 原子应用
→ 返回 Ack(new_revision, affected_ranges)
→ Adapter 更新 confirmed revision
```

错误处理：

- revision mismatch：暂停语义命令，调用 resync，重放仍可安全应用的 pending patch。
- invalid range：记录错误并阻止破坏性写入。
- IPC 暂时失败：保留有上限的 pending queue；禁止保存未确认镜像。
- Core apply 失败：重新同步 confirmed snapshot，不从前端全文兜底写盘。
- 相同 transaction id 重试必须幂等。

### 4. 保存路径迁移

旧路径：

```text
getMarkdown() -> write_file(path, content)
```

新路径：

```text
save_document(session_id)
→ flush pending patch barrier
→ Core 输出 SavePayload(revision)
→ Runtime 请求 Host 比较 FileIdentity 并原子写入
→ Runtime/Core 更新 persisted revision 和 file identity
```

M3 至少要求 Source Mode 保存走新路径；WYSIWYG 可继续走旧路径过渡。

脏状态公式：

```text
dirty = pending_transaction_count > 0
     || confirmed_revision != persisted_revision
```

保存开始后如果又有输入，只能标记本次实际写入的 revision 为 persisted，较新的 revision 必须继续保持 dirty。

### 5. 外部修改与冲突

保留现有 watcher 逻辑，但冲突比较改为 session snapshot：

- last persisted hash
- current revision dirty state
- file identity / mtime / size / content fingerprint

mtime/size 只做快速判断。最终覆盖前必须比较 expected file identity 或内容 fingerprint。

### 6. Large Document UI 状态

当 Core 标记文档超过 1MB：

- Source Mode 必须优先可编辑。
- 状态栏显示 Large Document 状态。
- 大纲可先基于 block scan 输出。
- 图表、图片诊断、全文诊断默认延迟。
- 保存仍走 Core bytes，不降级为前端 serializer。

## 交付物

- Tauri Core Bridge commands。
- Runtime session registry 和 versioned Bridge DTO。
- Core-backed open/save commands。
- 乐观 patch、batching、ack/resync/flush 状态机。
- Source Mode confirmed snapshot 保存链路。
- stats/outline 从 Core 获取的基础路径。
- Large Document Source Mode 状态。

## 验收标准

- Source Mode 编辑并保存不调用 ProseMirror `getMarkdown()`。
- CRLF、BOM、尾空行、FrontMatter、HTML Comment 保存后保持。
- Source Mode 打开 -> 不编辑 -> 保存，文件 byte-for-byte 一致。
- Source Mode 小编辑后，未触及区域 byte-for-byte 一致。
- 超过 1MB 的文档可打开、输入、保存，且不会触发 ProseMirror serializer。
- 10MB 文档 patch ack 和输入提交达到 M0 冻结的 p95 预算。
- 50MB 首次传输的峰值内存和全文副本数达到 M0 冻结预算。
- pending patch 未确认时保存会等待或明确失败，不会写入旧 Core revision。
- revision mismatch 可自动 resync；失败时不丢失或静默覆盖内容。
- 中文、emoji、combining mark、CRLF/Mixed EOL 的 selection 和 patch 不错位。
- 保存冲突检测仍可触发。
- 外部修改 clean 状态下可重新加载。
- 同一路径两个窗口独立编辑时，后保存窗口触发冲突而不是覆盖。
- WYSIWYG 旧路径仍可正常使用，作为兼容模式。

## 测试要求

- Rust tests：session registry、save snapshot。
- Frontend tests：Source Mode transaction -> patch。
- Protocol tests：DTO 版本、幂等重试、ack/resync、pending flush。
- E2E：打开 fixture、Source Mode 保存、磁盘校验。
- Regression：现有保存、冲突、文件树不回退。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| CodeMirror offset 与 Core byte offset 不一致 | IPC 显式使用 UTF-16 range，Runtime 通过 PositionMap 转换，建立 Unicode property test |
| 保存路径双轨导致状态混乱 | 明确 Source Mode 新路径，WYSIWYG legacy 路径，状态栏显示 active engine |
| 外部修改比较复杂 | mtime/size 快速判断 + content fingerprint 最终确认 |
| 高频 IPC 影响输入 | 乐观镜像、小 patch、批处理、backpressure 和 p95 benchmark |
