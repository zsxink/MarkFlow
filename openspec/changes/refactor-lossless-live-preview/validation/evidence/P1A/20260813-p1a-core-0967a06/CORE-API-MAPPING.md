# Core API 文档 + 测试映射（P1A §7 交付物）

candidate: `0967a06`，run: `20260813-p1a-core-0967a06`

## 1. 公共 API 清单

### 类型与坐标（`types.rs`）
| API | 说明 |
| --- | --- |
| `SessionId(u64)` / `DocumentId(u64)` | session/document 身份 |
| `Revision(u64)` | 确认文本版本（open=0，每次 patch +1） |
| `TransactionId(u64)` | 幂等重试事务 id |
| `Utf16Offset(usize)` | UI/CodeMirror UTF-16 坐标 |
| `LogicalByteOffset(usize)` | 逻辑 LF 文本 UTF-8 字节坐标 |
| `SourceByteOffset(usize)` | 磁盘源字节坐标（含 BOM/原始 EOL 宽） |
| `SourceRange<T>` | 半开区间，坐标显式 |

### 错误（`error.rs`）
| API | 说明 |
| --- | --- |
| `CoreError` | 稳定错误枚举 |
| `CoreError::code() -> &'static str` | 前端可分支的稳定错误码 |
| `SourceOffsetError` | InsideBom/InsideCrlf/OutOfBounds/InvalidUtf8Boundary |

### 身份与快照（`identity.rs`、`snapshot.rs`）
| API | 说明 |
| --- | --- |
| `ContentHash::of(bytes) -> ContentHash` | SHA-256 |
| `ContentHash::hex() -> String` | 64 位 hex |
| `FileIdentity` | canonical path/size/mtime/content_hash |
| `BomKind` / `EncodingKind` | UTF-8 BOM / 编码 |
| `OriginalSnapshot::from_bytes(bytes, default_eol)` | 原始快照：hash/len/BOM/每边界 EOL/trailing/identity/dominant |
| `OriginalSnapshot::dominant_line_ending()` | 冻结的文档主导 EOL |
| `LineEndingKind` / `LineEndingMap` | EOL 类型 / 每边界映射 |

### 文本缓冲（`text_buffer.rs`）
| API | 说明 |
| --- | --- |
| `TextBuffer::from_logical_text(text, dominant)` | 逻辑 LF 构造 |
| `TextBuffer::logical_text()` / `len_bytes()` / `boundary_count()` | 访问器 |
| `TextBuffer::line_endings()` | EOL 映射 |
| `TextBuffer::to_source_bytes(bom) -> Vec<u8>` | 源字节回放（唯一保存来源） |

### 坐标映射（`position_map.rs`）
| API | 说明 |
| --- | --- |
| `PositionMap::new(text, bom)` | 构建 |
| `utf16_for_byte` / `byte_for_utf16` | UTF-16↔逻辑字节 |
| `source_byte_for_byte` / `byte_for_source_byte` | 逻辑↔源字节 |

### Patch（`patch.rs`）
| API | 说明 |
| --- | --- |
| `TextPatch { transaction_id, base_revision, changes, selection_after }` | 原子补丁 |
| `TextChange { range, inserted_logical_text, inserted_line_endings }` | 局部 change |
| `NewlineEnding` | Inherit/ExplicitLf/Crlf/Cr |
| `Selection` / `PatchOutcome` | 选择 / 应用结果（revision+hash+selection） |

### Session（`session.rs`）
| API | 说明 |
| --- | --- |
| `LosslessDocumentSession::open_bytes / open_bytes_with_identity` | open |
| `apply_patch(patch) -> PatchOutcome` | 原子应用 |
| `snapshot() -> DocumentSnapshot` | 确认快照 |
| `prepare_save(expected_revision, &FileIdentity) -> SavePayload` | 保存 payload |
| `mark_persisted(revision, new_identity)` | 持久化标记 |
| `reload(bytes, default_eol)` | 重载 |
| `close()` | 关闭 |
| `revision()` / `confirmed_hash()` / `is_dirty()` / `persisted_revision()` | 访问器 |
| `utf16_for_byte` / `byte_for_utf16` / `source_byte_for_byte` / `byte_for_source_byte` | 坐标 facade |
| `retained_transaction_count()` | 重试窗口占用 |

## 2. Public API → 测试映射

| API | 触发测试 |
| --- | --- |
| `OriginalSnapshot::from_bytes` | lib `snapshot::tests::*`；integration `fixture_l0`（24 fixture） |
| `TextBuffer::to_source_bytes` | `fixture_l0::zero_patch_*`；`eol_provenance::*`（13 项）；`property_position::replay_is_self_consistent` |
| `PositionMap::utf16_for_byte` | `property_position::utf16_byte_round_trip_*`；lib `position_map::tests::*` |
| `PositionMap::byte_for_source_byte` | `property_position::source_logical_round_trip_*`；`invalid_source_offsets_are_stable_errors` |
| `TextPatch::normalize_changes`（经 apply） | `negative::*`（16 项全部） |
| `apply_patch`（原子性） | `negative::failure_leaves_session_unchanged`、`multi_change_patch_all_or_nothing`；lib `session::apply_patch_failure_leaves_everything_unchanged` |
| `apply_patch`（幂等） | `negative::duplicate_retry_idempotent`、`duplicate_mismatch_rejected`；lib `session::duplicate_*` |
| `apply_patch`（stale） | `negative::stale_revision_rejected`；lib `session::stale_revision_rejected_atomically` |
| `prepare_save`（stale/conflict） | `negative::prepare_save_stale_revision_rejected`、`prepare_save_identity_conflict_rejected`；lib `session::prepare_save_rejects_*` |
| `mark_persisted` | lib `session::mark_persisted_*` |
| `reload` / `close` | lib `session::reload_resets_content_and_revision`、`closed_session_rejects_all_ops` |
| 零 patch prepare-save = original | `fixture_l0::zero_patch_prepare_save_returns_original_bytes_for_every_fixture`（24 fixture × 4 prepare） |
| 无 parser/serializer 依赖 | `fixture_l0::clean_save_has_no_parser_or_serializer_dependency` |
| L1 全 intent | `fixture_l1::every_l1_intent_matches_oracle`（95 intents） |
| Mixed EOL 继承顺序 | `eol_provenance::inherit_*`（4 项） |
| 显式 paste provenance | `eol_provenance::explicit_*`（3 项）+ `mixed_paste_provenance_per_newline` |
| provenance 数量不符原子拒绝 | `negative::provenance_count_mismatch_rejected`、`eol_provenance::provenance_count_mismatch_atomic_reject` |
| invalid UTF-8 不覆盖 | `negative::invalid_utf8_open_refused`、`invalid_utf8_with_bom_refused` |
| 正文编辑保留尾部空行 | `fixture_l1::body_edit_preserves_trailing_boundaries`（trailing>0 fixtures） |
| 负向控制 | `fixture_l1::negative_control_corrupted_surviving_byte_fails` |

## 3. Core error code → 触发用例

| error code | 触发用例 |
| --- | --- |
| `invalid-encoding` | `negative::invalid_utf8_open_refused`、`invalid_utf8_with_bom_refused` |
| `stale-revision` | `negative::stale_revision_rejected`、`prepare_save_stale_revision_rejected`、lib `session::*` |
| `external-conflict` | `negative::prepare_save_identity_conflict_rejected` |
| `invalid-range` | `negative::out_of_bounds_range_rejected`、`reversed_range_rejected` |
| `invalid-logical-line-ending` | `negative::inserted_text_with_cr_rejected` |
| `invalid-eol-provenance` | `negative::provenance_count_mismatch_rejected`、`eol_provenance::*` |
| `overlapping-changes` | `negative::overlapping_changes_rejected_atomically` |
| `invalid-boundary`（Utf8/Utf16/source） | `negative::invalid_utf8_boundary_rejected`、`property_position::invalid_source_offsets_are_stable_errors`、lib `position_map::*` |
| `duplicate-mismatch` | `negative::duplicate_mismatch_rejected` |
| `session-missing` | lib `session::closed_session_rejects_all_ops` |
| `internal-invariant` | lib `error::error_codes_are_stable_and_mapped` |
| `io` | lib `error::error_codes_are_stable_and_mapped` |

## 4. Scope 声明（人工验收用）

Core 只包含：document snapshot、TextBuffer、LineEndingMap、PositionMap、TextPatch、
LosslessDocumentSession。**不包含**：parser、Render IR、widgets、History、DOM、Tauri、网络。
`Cargo.toml` 依赖仅 `serde` + `sha2`（dev: `serde_json`），确认无 markdown parser。
