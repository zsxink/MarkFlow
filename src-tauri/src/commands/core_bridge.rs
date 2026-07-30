//! Tauri commands for the Core Bridge protocol.
//!
//! These commands form the IPC surface between the frontend and the
//! markflow-runtime. Each command is a thin adapter: DTO unpack -> Runtime call ->
//! DTO pack. No business logic lives here.

use crate::error::{lock_mutex, AppError, AppErrorCode};
use crate::runtime_host::{AppHost, SESSION_REGISTRY};
use markflow_core::{
    EditCommand, EditOrigin, HistoryLabel, ListKind, RenderBlockKind, RenderDocument,
    RenderInlineKind, RenderRequest, Revision, Selection, SessionId, SourceRange, TextChange,
    TextPatch, TransactionId, UiRange, Utf16Offset,
};
use markflow_runtime::error::{RuntimeError, RuntimeErrorCode};
use markflow_runtime::host::Host;
use markflow_runtime::registry::with_session_state;
use markflow_runtime::save::save_document;
use markflow_runtime::session::ClientId;
use markflow_runtime::source::DocumentSource;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tokio::task::spawn_blocking;

// ---------------------------------------------------------------------------
// Protocol version
// ---------------------------------------------------------------------------

/// Current protocol version supported by this backend.
const PROTOCOL_VERSION: u32 = 1;

/// Validate that the frontend's protocol version matches ours.
/// Returns `PROTOCOL_VERSION_UNSUPPORTED` if mismatched.
fn validate_protocol_version(version: u32) -> Result<(), AppError> {
    if version != PROTOCOL_VERSION {
        return Err(AppError::protocol_version_unsupported(format!(
            "Expected protocol version {}, got {}",
            PROTOCOL_VERSION, version
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Frontend transaction ID -> core TransactionId mapping
//
// The frontend sends string-based transaction IDs (e.g. "txn-123") for
// idempotent retry. Core uses u64-based TransactionId. This mapping ensures
// retries with the same frontend ID resolve to the same core TransactionId.
// ---------------------------------------------------------------------------

static NEXT_CORE_TXN_ID: AtomicU64 = AtomicU64::new(1);
static FRONTEND_TXN_MAP: std::sync::LazyLock<Mutex<HashMap<String, TransactionId>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Map a frontend string transaction ID to a core u64 TransactionId.
/// Returns the same core ID for repeated calls with the same string.
fn map_frontend_txn(session_id: SessionId, frontend_id: &str) -> Result<TransactionId, AppError> {
    let key = format!("{}:{}", session_id.0, frontend_id);
    let mut map = lock_mutex(&FRONTEND_TXN_MAP)?;
    if let Some(id) = map.get(&key) {
        return Ok(*id);
    }
    let new_id = TransactionId(NEXT_CORE_TXN_ID.fetch_add(1, Ordering::Relaxed));
    map.insert(key, new_id);
    Ok(new_id)
}

const COMMAND_TXN_CACHE_CAPACITY: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CommandTxnKey {
    session_id: u64,
    frontend_txn_id: String,
}

#[derive(Debug, Clone)]
struct CachedCommandTxn {
    fingerprint: String,
    result: CommandResultDto,
}

#[derive(Debug, Default)]
struct CommandTxnCache {
    entries: HashMap<CommandTxnKey, CachedCommandTxn>,
    order: VecDeque<CommandTxnKey>,
}

static COMMAND_TXN_CACHE: std::sync::LazyLock<Mutex<CommandTxnCache>> =
    std::sync::LazyLock::new(|| Mutex::new(CommandTxnCache::default()));

fn get_cached_command_result(
    key: &CommandTxnKey,
    fingerprint: &str,
) -> Result<Option<CommandResultDto>, AppError> {
    let cache = lock_mutex(&COMMAND_TXN_CACHE)?;
    if let Some(cached) = cache.entries.get(key) {
        if cached.fingerprint == fingerprint {
            return Ok(Some(cached.result.clone()));
        }
        return Err(AppError::new(
            AppErrorCode::TransactionConflict,
            format!(
                "Transaction {} for session {} was reused with a different payload",
                key.frontend_txn_id, key.session_id
            ),
        ));
    }
    Ok(None)
}

fn cache_command_result(
    key: CommandTxnKey,
    fingerprint: String,
    result: CommandResultDto,
) -> Result<(), AppError> {
    let mut cache = lock_mutex(&COMMAND_TXN_CACHE)?;
    if !cache.entries.contains_key(&key) {
        cache.order.push_back(key.clone());
    }
    cache.entries.insert(
        key,
        CachedCommandTxn {
            fingerprint,
            result,
        },
    );

    while cache.order.len() > COMMAND_TXN_CACHE_CAPACITY {
        if let Some(evicted) = cache.order.pop_front() {
            cache.entries.remove(&evicted);
        }
    }
    Ok(())
}

fn clear_command_cache_for_session(session_id: u64) -> Result<(), AppError> {
    let mut cache = lock_mutex(&COMMAND_TXN_CACHE)?;
    cache.entries.retain(|key, _| key.session_id != session_id);
    cache.order.retain(|key| key.session_id != session_id);

    let prefix = format!("{}:", session_id);
    let mut txn_map = lock_mutex(&FRONTEND_TXN_MAP)?;
    txn_map.retain(|key, _| !key.starts_with(&prefix));
    Ok(())
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ProtocolEnvelope<T> {
    pub protocol_version: u32,
    pub request_id: Option<String>,
    pub client_id: Option<String>,
    pub window_label: Option<String>,
    pub session_id: Option<u64>,
    pub payload: T,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentOpenedDto {
    pub protocol_version: u32,
    pub session_id: u64,
    pub document_id: u64,
    pub revision: u64,
    pub persisted_revision: u64,
    pub text: String,
    pub size_class: String,
    pub file_identity: FileIdentityDto,
    pub outline: Vec<OutlineItemDto>,
    pub stats: DocumentStatsDto,
    pub capabilities: DocumentCapabilitiesDto,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileIdentityDto {
    pub canonical_path: Option<String>,
    pub size: u64,
    pub fingerprint_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OutlineItemDto {
    pub level: u32,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentStatsDto {
    pub line_count: usize,
    pub byte_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentCapabilitiesDto {
    pub writable: bool,
    pub patch_editing: bool,
    pub core_save: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Utf16ChangeDto {
    pub from: usize,
    pub to: usize,
    pub insert: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Utf16TextPatchDto {
    pub transaction_id: String,
    pub base_revision: u64,
    pub changes: Vec<Utf16ChangeDto>,
    pub selection_after: Option<SelectionDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct SelectionDto {
    pub anchor: usize,
    pub head: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyPatchAckDto {
    pub transaction_id: String,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveResultDto {
    pub revision: u64,
    pub file_identity: FileIdentityDto,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResyncResultDto {
    pub revision: u64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlushResultDto {
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentTextResultDto {
    pub text: String,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OutlineResultDto {
    pub items: Vec<OutlineItemDto>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReloadResultDto {
    pub revision: u64,
    pub text: String,
    pub file_identity: FileIdentityDto,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct UiRangeDto {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct LineRangeDto {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RenderDocumentDto {
    pub session_id: u64,
    pub document_id: u64,
    pub revision: u64,
    pub request_id: String,
    pub viewport: UiRangeDto,
    pub blocks: Vec<RenderBlockDto>,
    pub large_document: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RenderBlockDto {
    pub id: String,
    pub kind: String,
    pub level: Option<u8>,
    pub source_range: UiRangeDto,
    pub content_range: UiRangeDto,
    pub line_range: LineRangeDto,
    pub text: String,
    pub inlines: Vec<RenderInlineDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RenderInlineDto {
    pub kind: String,
    pub source_range: UiRangeDto,
    pub content_range: UiRangeDto,
    pub marker_ranges: Vec<UiRangeDto>,
    pub text: String,
    pub target: Option<String>,
}

// ---------------------------------------------------------------------------
// EditCommand DTOs — frontend sends UTF-16 selections, Core works in byte offsets
// ---------------------------------------------------------------------------

/// Serialisable edit command variant that the frontend can send.
/// Mirrors `markflow_core::EditCommand` but uses UTF-16 offsets.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EditCommandDto {
    ToggleStrong {
        anchor: usize,
        head: usize,
    },
    ToggleEmphasis {
        anchor: usize,
        head: usize,
    },
    ToggleStrikethrough {
        anchor: usize,
        head: usize,
    },
    ToggleInlineCode {
        anchor: usize,
        head: usize,
    },
    SetHeading {
        anchor: usize,
        head: usize,
        level: u8,
    },
    ToggleBlockQuote {
        anchor: usize,
        head: usize,
    },
    ToggleList {
        anchor: usize,
        head: usize,
        kind: ListKindDto,
    },
    InsertCodeFence {
        position: usize,
        anchor: Option<usize>,
        head: Option<usize>,
        language: Option<String>,
    },
    InsertLink {
        anchor: usize,
        head: usize,
        href: String,
        title: Option<String>,
        text: Option<String>,
    },
    InsertImage {
        position: usize,
        reference: String,
        alt: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
pub enum ListKindDto {
    Unordered,
    Ordered,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct CommandPatchDto {
    pub transaction_id: String,
    pub base_revision: u64,
    pub changes: Vec<Utf16ChangeDto>,
    pub selection_after: Option<SelectionDto>,
}

/// Result of executing an edit command, mapped back to UTF-16 offsets.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct CommandResultDto {
    pub session_id: u64,
    pub transaction_id: String,
    pub revision: u64,
    pub patch: CommandPatchDto,
    pub affected_ranges: Vec<UiRangeDto>,
    pub selection_after: Option<SelectionDto>,
}

fn map_text_patch_to_dto(
    session: &markflow_core::DocumentSession,
    patch: &TextPatch,
    frontend_txn_id: &str,
) -> Result<CommandPatchDto, RuntimeError> {
    let mut changes = Vec::with_capacity(patch.changes.len());
    for change in &patch.changes {
        let from = session.utf16_for_byte(change.range.start).map_err(|_| {
            RuntimeError::new(
                RuntimeErrorCode::InvalidUtf16Boundary,
                format!(
                    "Failed to convert patch range start byte {}",
                    change.range.start.0
                ),
            )
        })?;
        let to = session.utf16_for_byte(change.range.end).map_err(|_| {
            RuntimeError::new(
                RuntimeErrorCode::InvalidUtf16Boundary,
                format!(
                    "Failed to convert patch range end byte {}",
                    change.range.end.0
                ),
            )
        })?;
        changes.push(Utf16ChangeDto {
            from: from.0,
            to: to.0,
            insert: change.replacement.clone(),
        });
    }

    Ok(CommandPatchDto {
        transaction_id: frontend_txn_id.to_string(),
        base_revision: patch.base_revision.0,
        changes,
        selection_after: None,
    })
}

fn map_affected_ranges_to_dto(
    session: &markflow_core::DocumentSession,
    patch: &TextPatch,
) -> Result<Vec<UiRangeDto>, RuntimeError> {
    patch
        .changes
        .iter()
        .map(|change| {
            let start = session.utf16_for_byte(change.range.start).map_err(|_| {
                RuntimeError::new(
                    RuntimeErrorCode::InvalidUtf16Boundary,
                    format!(
                        "Failed to convert affected range start byte {}",
                        change.range.start.0
                    ),
                )
            })?;
            let end = session.utf16_for_byte(change.range.end).map_err(|_| {
                RuntimeError::new(
                    RuntimeErrorCode::InvalidUtf16Boundary,
                    format!(
                        "Failed to convert affected range end byte {}",
                        change.range.end.0
                    ),
                )
            })?;
            Ok(UiRangeDto {
                start: start.0,
                end: end.0,
            })
        })
        .collect()
}

fn map_selection_to_dto(
    session: &markflow_core::DocumentSession,
    selection: Option<Selection>,
) -> Option<SelectionDto> {
    selection.and_then(|sel| {
        let anchor = session.utf16_for_byte(sel.anchor).ok()?.0;
        let head = session.utf16_for_byte(sel.head).ok()?.0;
        Some(SelectionDto { anchor, head })
    })
}

fn map_selection_to_core(
    session: &markflow_core::DocumentSession,
    anchor: usize,
    head: usize,
    revision: Revision,
) -> Result<Selection, AppError> {
    let byte_anchor = session.byte_for_utf16(Utf16Offset(anchor)).map_err(|_| {
        AppError::new(
            AppErrorCode::InvalidUtf16Boundary,
            format!(
                "Failed to convert selection anchor UTF-16 {} to byte",
                anchor
            ),
        )
    })?;
    let byte_head = session.byte_for_utf16(Utf16Offset(head)).map_err(|_| {
        AppError::new(
            AppErrorCode::InvalidUtf16Boundary,
            format!("Failed to convert selection head UTF-16 {} to byte", head),
        )
    })?;
    Ok(Selection {
        anchor: byte_anchor,
        head: byte_head,
        revision,
    })
}

fn build_edit_command(
    session: &markflow_core::DocumentSession,
    dto: EditCommandDto,
    revision: Revision,
) -> Result<EditCommand, AppError> {
    Ok(match dto {
        EditCommandDto::ToggleStrong { anchor, head } => EditCommand::ToggleStrong {
            selection: map_selection_to_core(session, anchor, head, revision)?,
        },
        EditCommandDto::ToggleEmphasis { anchor, head } => EditCommand::ToggleEmphasis {
            selection: map_selection_to_core(session, anchor, head, revision)?,
        },
        EditCommandDto::ToggleStrikethrough { anchor, head } => EditCommand::ToggleStrikethrough {
            selection: map_selection_to_core(session, anchor, head, revision)?,
        },
        EditCommandDto::ToggleInlineCode { anchor, head } => EditCommand::ToggleInlineCode {
            selection: map_selection_to_core(session, anchor, head, revision)?,
        },
        EditCommandDto::SetHeading {
            anchor,
            head,
            level,
        } => EditCommand::SetHeading {
            selection: map_selection_to_core(session, anchor, head, revision)?,
            level,
        },
        EditCommandDto::ToggleBlockQuote { anchor, head } => EditCommand::ToggleBlockQuote {
            selection: map_selection_to_core(session, anchor, head, revision)?,
        },
        EditCommandDto::ToggleList { anchor, head, kind } => {
            let core_kind = match kind {
                ListKindDto::Unordered => ListKind::Unordered,
                ListKindDto::Ordered => ListKind::Ordered,
            };
            EditCommand::ToggleList {
                selection: map_selection_to_core(session, anchor, head, revision)?,
                kind: core_kind,
            }
        }
        EditCommandDto::InsertCodeFence {
            position,
            anchor,
            head,
            language,
        } => {
            let byte_pos = session.byte_for_utf16(Utf16Offset(position)).map_err(|_| {
                AppError::new(
                    AppErrorCode::InvalidUtf16Boundary,
                    format!(
                        "Failed to convert code fence position UTF-16 {} to byte",
                        position
                    ),
                )
            })?;
            let selection = match (anchor, head) {
                (Some(anchor), Some(head)) => {
                    Some(map_selection_to_core(session, anchor, head, revision)?)
                }
                _ => None,
            };
            EditCommand::InsertCodeFence {
                position: byte_pos,
                selection,
                language,
            }
        }
        EditCommandDto::InsertLink {
            anchor,
            head,
            href,
            title,
            text,
        } => EditCommand::InsertLink {
            selection: map_selection_to_core(session, anchor, head, revision)?,
            href,
            title,
            text,
        },
        EditCommandDto::InsertImage {
            position,
            reference,
            alt,
        } => {
            let byte_pos = session.byte_for_utf16(Utf16Offset(position)).map_err(|_| {
                AppError::new(
                    AppErrorCode::InvalidUtf16Boundary,
                    format!(
                        "Failed to convert image position UTF-16 {} to byte",
                        position
                    ),
                )
            })?;
            EditCommand::InsertImage {
                position: byte_pos,
                reference,
                alt,
            }
        }
    })
}

/// Execute a semantic edit command on a Core document session.
#[tauri::command]
pub fn execute_edit_command(
    session_id: u64,
    command: EditCommandDto,
    base_revision: u64,
    frontend_txn_id: String,
) -> Result<CommandResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;
    let sid = SessionId(session_id);
    let base_rev = Revision(base_revision);
    let cache_key = CommandTxnKey {
        session_id,
        frontend_txn_id: frontend_txn_id.clone(),
    };
    let fingerprint = serde_json::json!({
        "op": "execute_edit_command",
        "base_revision": base_revision,
        "command": &command,
    })
    .to_string();
    if let Some(result) = get_cached_command_result(&cache_key, &fingerprint)? {
        return Ok(result);
    }

    let result = with_session_state(registry, sid, |state| {
        let current_revision = state.core.revision();
        if base_rev != current_revision {
            return Err(RuntimeError::revision_mismatch(format!(
                "EditCommand revision mismatch: expected {}, current {}",
                base_rev.0, current_revision.0
            )));
        }

        let core_cmd = build_edit_command(&state.core, command, current_revision)
            .map_err(|e| RuntimeError::internal(format!("Command build error: {}", e.message)))?;

        let core_txn_id = map_frontend_txn(sid, &frontend_txn_id)
            .map_err(|e| RuntimeError::internal(format!("Failed to map txn: {}", e.message)))?;

        // Execute the command (read-only, returns TextPatch)
        let patch = core_cmd
            .execute_with_transaction(&state.core, core_txn_id)
            .map_err(|e| RuntimeError::internal(format!("Command execution error: {:?}", e)))?;
        let patch_dto = map_text_patch_to_dto(&state.core, &patch, &frontend_txn_id)?;
        let affected_ranges = map_affected_ranges_to_dto(&state.core, &patch)?;

        // Apply with history — store the inverse patch for undo.
        // selection_before is None here; frontend can supply it later.
        let outcome = state
            .core
            .apply_patch_with_history(
                patch.clone(),
                EditOrigin::Command,
                HistoryLabel::Command,
                None,
            )
            .map_err(RuntimeError::from)?;

        let new_revision = state.core.revision();

        // Convert selection_after back to UTF-16
        let selection_after = map_selection_to_dto(&state.core, outcome.selection_after);

        tracing::debug!(
            target: "runtime.edit_command",
            session_id = session_id,
            transaction_id = %frontend_txn_id,
            new_revision = new_revision.0,
            "Edit command executed"
        );

        Ok(CommandResultDto {
            session_id,
            transaction_id: frontend_txn_id,
            revision: new_revision.0,
            patch: patch_dto,
            affected_ranges,
            selection_after,
        })
    })
    .map_err(map_error)?;

    cache_command_result(cache_key, fingerprint, result.clone())?;

    Ok(result)
}

/// Undo the last edit in a document session.
#[tauri::command]
pub fn undo_document(
    session_id: u64,
    frontend_txn_id: String,
    max_steps: Option<u32>,
) -> Result<CommandResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;
    let sid = SessionId(session_id);
    let steps = max_steps.unwrap_or(1);
    if steps != 1 {
        return Err(AppError::new(
            AppErrorCode::InvalidRange,
            "undo_document supports only max_steps=1; call it repeatedly for multi-step undo",
        ));
    }
    let cache_key = CommandTxnKey {
        session_id,
        frontend_txn_id: frontend_txn_id.clone(),
    };
    let fingerprint = serde_json::json!({
        "op": "undo_document",
        "max_steps": steps,
    })
    .to_string();
    if let Some(result) = get_cached_command_result(&cache_key, &fingerprint)? {
        return Ok(result);
    }
    let core_txn_id = map_frontend_txn(sid, &frontend_txn_id)
        .map_err(|e| AppError::internal(format!("Failed to map txn: {}", e.message)))?;

    let result = with_session_state(registry, sid, |state| {
        let mut final_revision = state.core.revision();
        let mut selection_after = None::<SelectionDto>;
        let mut all_changes = Vec::<Utf16ChangeDto>::new();
        let mut all_affected = Vec::<UiRangeDto>::new();
        let patch_base_revision = final_revision.0;

        if state.core.can_undo() {
            if let Some(planned) = state.core.plan_undo_patch(core_txn_id) {
                let patch_dto =
                    map_text_patch_to_dto(&state.core, &planned.patch, &frontend_txn_id)?;
                let affected = map_affected_ranges_to_dto(&state.core, &planned.patch)?;
                all_changes.extend(patch_dto.changes);
                all_affected.extend(affected);
            }
            let outcome = state.core.undo(core_txn_id).map_err(RuntimeError::from)?;

            if let Some(outcome) = outcome {
                final_revision = outcome.revision;
                selection_after = map_selection_to_dto(&state.core, outcome.selection_after);
            }
        }

        Ok(CommandResultDto {
            session_id,
            transaction_id: frontend_txn_id.clone(),
            revision: final_revision.0,
            patch: CommandPatchDto {
                transaction_id: frontend_txn_id.clone(),
                base_revision: patch_base_revision,
                changes: all_changes,
                selection_after: None,
            },
            affected_ranges: all_affected,
            selection_after,
        })
    })
    .map_err(map_error)?;

    cache_command_result(cache_key, fingerprint, result.clone())?;

    Ok(result)
}

/// Redo the last undone edit in a document session.
#[tauri::command]
pub fn redo_document(
    session_id: u64,
    frontend_txn_id: String,
    max_steps: Option<u32>,
) -> Result<CommandResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;
    let sid = SessionId(session_id);
    let steps = max_steps.unwrap_or(1);
    if steps != 1 {
        return Err(AppError::new(
            AppErrorCode::InvalidRange,
            "redo_document supports only max_steps=1; call it repeatedly for multi-step redo",
        ));
    }
    let cache_key = CommandTxnKey {
        session_id,
        frontend_txn_id: frontend_txn_id.clone(),
    };
    let fingerprint = serde_json::json!({
        "op": "redo_document",
        "max_steps": steps,
    })
    .to_string();
    if let Some(result) = get_cached_command_result(&cache_key, &fingerprint)? {
        return Ok(result);
    }
    let core_txn_id = map_frontend_txn(sid, &frontend_txn_id)
        .map_err(|e| AppError::internal(format!("Failed to map txn: {}", e.message)))?;

    let result = with_session_state(registry, sid, |state| {
        let mut final_revision = state.core.revision();
        let mut selection_after = None::<SelectionDto>;
        let mut all_changes = Vec::<Utf16ChangeDto>::new();
        let mut all_affected = Vec::<UiRangeDto>::new();
        let patch_base_revision = final_revision.0;

        if state.core.can_redo() {
            if let Some(planned) = state.core.plan_redo_patch(core_txn_id) {
                let patch_dto =
                    map_text_patch_to_dto(&state.core, &planned.patch, &frontend_txn_id)?;
                let affected = map_affected_ranges_to_dto(&state.core, &planned.patch)?;
                all_changes.extend(patch_dto.changes);
                all_affected.extend(affected);
            }
            let outcome = state.core.redo(core_txn_id).map_err(RuntimeError::from)?;

            if let Some(outcome) = outcome {
                final_revision = outcome.revision;
                selection_after = map_selection_to_dto(&state.core, outcome.selection_after);
            }
        }

        Ok(CommandResultDto {
            session_id,
            transaction_id: frontend_txn_id.clone(),
            revision: final_revision.0,
            patch: CommandPatchDto {
                transaction_id: frontend_txn_id.clone(),
                base_revision: patch_base_revision,
                changes: all_changes,
                selection_after: None,
            },
            affected_ranges: all_affected,
            selection_after,
        })
    })
    .map_err(map_error)?;

    cache_command_result(cache_key, fingerprint, result.clone())?;

    Ok(result)
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/// Map a RuntimeError to an AppError with stable error codes.
///
/// Each known RuntimeErrorCode variant maps to a corresponding AppErrorCode
/// that the frontend matches on (via `coreSession.ts` `mapBridgeError` and
/// `editor.sourcePatcher.ts`). Unknown variants fall through to `Internal`.
fn map_error(e: RuntimeError) -> AppError {
    let code = match e.code {
        RuntimeErrorCode::RevisionMismatch => AppErrorCode::RevisionMismatch,
        RuntimeErrorCode::Conflict => AppErrorCode::ConflictDetected,
        RuntimeErrorCode::SessionNotFound => AppErrorCode::SessionNotFound,
        RuntimeErrorCode::TransactionConflict => AppErrorCode::TransactionConflict,
        RuntimeErrorCode::InvalidUtf16Boundary => AppErrorCode::InvalidUtf16Boundary,
        RuntimeErrorCode::SaveFlushTimeout => AppErrorCode::SaveFlushTimeout,
        RuntimeErrorCode::InvalidRange => AppErrorCode::InvalidRange,
        RuntimeErrorCode::UnsupportedEncoding => AppErrorCode::UnsupportedEncoding,
        RuntimeErrorCode::PendingQueueFull => AppErrorCode::PendingQueueFull,
        RuntimeErrorCode::Cancelled => AppErrorCode::Cancelled,
        RuntimeErrorCode::ProtocolVersionUnsupported => AppErrorCode::ProtocolVersionUnsupported,
        RuntimeErrorCode::Internal => AppErrorCode::Internal,
    };
    AppError::new(code, format!("{}: {}", e.code.as_str(), e.detail))
}

fn map_ui_range(range: UiRange) -> UiRangeDto {
    UiRangeDto {
        start: range.start.0,
        end: range.end.0,
    }
}

fn map_render_document(document: RenderDocument) -> RenderDocumentDto {
    RenderDocumentDto {
        session_id: document.session_id.0,
        document_id: document.document_id.0,
        revision: document.revision.0,
        request_id: document.request_id,
        viewport: map_ui_range(document.viewport),
        large_document: document.large_document,
        blocks: document
            .blocks
            .into_iter()
            .map(|block| {
                let (kind, level) = match block.kind {
                    RenderBlockKind::Heading { level } => ("heading".to_string(), Some(level)),
                    RenderBlockKind::Paragraph => ("paragraph".to_string(), None),
                    RenderBlockKind::Blockquote => ("blockquote".to_string(), None),
                    RenderBlockKind::BulletList => ("bullet_list".to_string(), None),
                    RenderBlockKind::OrderedList => ("ordered_list".to_string(), None),
                    RenderBlockKind::TaskList => ("task_list".to_string(), None),
                    RenderBlockKind::CodeFence => ("code_fence".to_string(), None),
                    RenderBlockKind::Image => ("image".to_string(), None),
                    RenderBlockKind::Unknown => ("unknown".to_string(), None),
                };
                RenderBlockDto {
                    id: block.id,
                    kind,
                    level,
                    source_range: map_ui_range(block.source_range),
                    content_range: map_ui_range(block.content_range),
                    line_range: LineRangeDto {
                        start: block.line_range.start,
                        end: block.line_range.end,
                    },
                    text: block.text,
                    inlines: block
                        .inlines
                        .into_iter()
                        .map(|span| RenderInlineDto {
                            kind: match span.kind {
                                RenderInlineKind::Strong => "strong",
                                RenderInlineKind::Emphasis => "emphasis",
                                RenderInlineKind::InlineCode => "inline_code",
                                RenderInlineKind::Link => "link",
                                RenderInlineKind::ImageReference => "image_reference",
                            }
                            .to_string(),
                            source_range: map_ui_range(span.source_range),
                            content_range: map_ui_range(span.content_range),
                            marker_ranges: span
                                .marker_ranges
                                .into_iter()
                                .map(map_ui_range)
                                .collect(),
                            text: span.text,
                            target: span.target,
                        })
                        .collect(),
                }
            })
            .collect(),
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Open a document and return the session state.
///
/// Uses spawn_blocking for file I/O to avoid blocking the Tauri async runtime.
#[tauri::command]
pub async fn open_document(path: String) -> Result<DocumentOpenedDto, AppError> {
    let registry = &*SESSION_REGISTRY;

    // U6.4: Read bytes via spawn_blocking (file I/O outside async context)
    let path_buf = PathBuf::from(&path);
    let source = DocumentSource::new_file(path_buf.clone());

    let io_result = spawn_blocking(move || {
        let host = AppHost;
        host.read_document_bytes(&path_buf)
            .map_err(|e| AppError::internal(format!("File read error: {}", e.detail)))
    })
    .await
    .map_err(|e| AppError::internal(format!("Task join error: {}", e)))?;
    let (bytes, identity) = io_result?;

    let session_id = registry
        .create(
            ClientId("default".into()),
            "default".into(),
            source,
            identity.clone(),
            |sid, did| {
                let session = markflow_core::DocumentSession::open_bytes(sid, did, &bytes)
                    .map_err(RuntimeError::from)?;

                Ok(session)
            },
        )
        .map_err(map_error)?;

    // Read back session info
    let (text, revision, line_count, byte_count, document_id) =
        with_session_state(registry, session_id, |state| {
            let text = state.core.text().logical_text().to_string();
            let revision = state.core.revision();
            let line_count = state.core.line_count();
            let byte_count = state.core.text().logical_text().len();
            let document_id = state.core.document_id.0;
            Ok((text, revision, line_count, byte_count, document_id))
        })
        .map_err(map_error)?;

    // Compute size class matching frontend thresholds (see src/lib/fileSizeTier.ts)
    let size_class = if byte_count >= 10_485_760 || line_count >= 50_000 {
        "huge"
    } else if byte_count >= 1_048_576 || line_count >= 5_000 {
        "large"
    } else {
        "normal"
    };

    let dto = DocumentOpenedDto {
        protocol_version: 1,
        session_id: session_id.0,
        document_id,
        revision: revision.0,
        persisted_revision: revision.0,
        text,
        size_class: size_class.into(),
        file_identity: FileIdentityDto {
            canonical_path: identity
                .canonical_path
                .map(|p| p.to_string_lossy().to_string()),
            size: identity.size,
            fingerprint_hash: identity.fingerprint.hash_prefix,
        },
        outline: vec![], // TODO: populate from core parse_index
        stats: DocumentStatsDto {
            line_count,
            byte_count,
        },
        capabilities: DocumentCapabilitiesDto {
            writable: true,
            patch_editing: true,
            core_save: true,
        },
    };

    Ok(dto)
}

/// Apply a text patch to a document session.
///
/// The frontend sends UTF-16-based changes. This command:
/// 1. Converts UTF-16 offsets to byte offsets using DocumentSession::byte_for_utf16()
/// 2. Constructs a TextPatch with byte-based SourceRange changes
/// 3. Applies the patch via DocumentSession::apply_patch()
#[tauri::command]
pub fn apply_text_patch(
    envelope: ProtocolEnvelope<Utf16TextPatchDto>,
) -> Result<ApplyPatchAckDto, AppError> {
    // Validate protocol version
    validate_protocol_version(envelope.protocol_version)?;

    let session_id = envelope
        .session_id
        .ok_or_else(|| AppError::internal("Missing session_id"))?;
    let session_id = SessionId(session_id);
    let patch = envelope.payload;
    let frontend_txn_id = patch.transaction_id.clone();

    let registry = &*SESSION_REGISTRY;

    let base_revision = Revision(patch.base_revision);

    let ack = with_session_state(registry, session_id, |state| {
        // Verify base revision
        let current_revision = state.core.revision();
        if base_revision != current_revision {
            return Err(RuntimeError::revision_mismatch(format!(
                "Expected revision {} but current is {}",
                base_revision.0, current_revision.0
            )));
        }

        // Convert UTF-16 changes to byte-based TextChanges
        let mut text_changes: Vec<TextChange> = Vec::with_capacity(patch.changes.len());

        for c in &patch.changes {
            let from_byte = state
                .core
                .byte_for_utf16(Utf16Offset(c.from))
                .map_err(|_| {
                    RuntimeError::new(
                        RuntimeErrorCode::InvalidUtf16Boundary,
                        format!("Failed to convert UTF-16 offset {} to byte offset", c.from),
                    )
                })?;

            let to_byte = state.core.byte_for_utf16(Utf16Offset(c.to)).map_err(|_| {
                RuntimeError::new(
                    RuntimeErrorCode::InvalidUtf16Boundary,
                    format!("Failed to convert UTF-16 offset {} to byte offset", c.to),
                )
            })?;

            text_changes.push(TextChange {
                range: SourceRange {
                    revision: current_revision,
                    start: from_byte,
                    end: to_byte,
                },
                replacement: c.insert.clone(),
            });
        }

        // Map frontend string transaction ID to core u64 TransactionId
        let core_txn_id = map_frontend_txn(session_id, &patch.transaction_id).map_err(|e| {
            RuntimeError::internal(format!("Failed to map frontend txn: {}", e.message))
        })?;

        // Convert selection if present — the frontend sends UTF-16 offsets
        // (CodeMirror convention), but Core expects byte offsets. Use
        // byte_for_utf16() for proper conversion (same as TextChange above).
        let selection_after = match patch.selection_after.as_ref() {
            Some(sel) => {
                let anchor_byte = state
                    .core
                    .byte_for_utf16(Utf16Offset(sel.anchor)) // UTF-16 -> byte offset
                    .map_err(|_| {
                        RuntimeError::new(
                            RuntimeErrorCode::InvalidUtf16Boundary,
                            format!(
                                "Failed to convert selection anchor UTF-16 offset {} to byte offset",
                                sel.anchor
                            ),
                        )
                    })?;
                let head_byte = state.core.byte_for_utf16(Utf16Offset(sel.head)) // UTF-16 -> byte offset
                    .map_err(|_| {
                        RuntimeError::new(
                            RuntimeErrorCode::InvalidUtf16Boundary,
                            format!(
                                "Failed to convert selection head UTF-16 offset {} to byte offset",
                                sel.head
                            ),
                        )
                    })?;
                Some(Selection {
                    anchor: anchor_byte,
                    head: head_byte,
                    revision: current_revision,
                })
            }
            None => None,
        };

        // Build TextPatch with byte-based changes
        let text_patch = TextPatch {
            transaction_id: core_txn_id,
            base_revision,
            changes: text_changes,
            selection_after,
        };

        let _outcome = state
            .core
            .apply_patch(text_patch)
            .map_err(RuntimeError::from)?;

        let new_revision = state.core.revision();

        tracing::debug!(
            target: "runtime.patch",
            session_id = session_id.0,
            transaction_id = %patch.transaction_id,
            old_revision = base_revision.0,
            new_revision = new_revision.0,
            "Patch applied"
        );

        Ok(ApplyPatchAckDto {
            transaction_id: frontend_txn_id,
            revision: new_revision.0,
        })
    })
    .map_err(map_error)?;

    Ok(ack)
}

/// Save a document through the Runtime save workflow.
///
/// Uses spawn_blocking for file I/O (Host::compare_and_atomic_write).
#[tauri::command]
pub async fn save_document_command(session_id: u64) -> Result<SaveResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;
    let sid = SessionId(session_id);

    // U6.4: Move the save (with file I/O) to a blocking thread
    let result = spawn_blocking(
        move || -> Result<markflow_runtime::save::SaveResult, AppError> {
            let host = AppHost;
            save_document(registry, sid, &host).map_err(map_error)
        },
    )
    .await
    .map_err(|e| AppError::internal(format!("Task join error: {}", e)))??;

    Ok(SaveResultDto {
        revision: result.revision.0,
        file_identity: FileIdentityDto {
            canonical_path: result
                .file_identity
                .canonical_path
                .map(|p| p.to_string_lossy().to_string()),
            size: result.file_identity.size,
            fingerprint_hash: result.file_identity.fingerprint.hash_prefix,
        },
    })
}

/// Resync a document — return the confirmed snapshot text.
///
/// The frontend provides `confirmed_revision` — the revision the frontend last
/// acknowledged. If the current revision is older than this, the frontend has
/// seen data the session doesn't reflect, indicating a stale session. We reject
/// such resyncs so the caller can re-open.
#[tauri::command]
pub fn resync_document(
    session_id: u64,
    confirmed_revision: u64,
) -> Result<ResyncResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;

    let sid = SessionId(session_id);

    let (text, revision) = with_session_state(registry, sid, |state| {
        let current_revision = state.core.revision().0;
        if current_revision < confirmed_revision {
            return Err(RuntimeError::revision_mismatch(format!(
                "Resync stale: confirmed revision {} is ahead of current {}",
                confirmed_revision, current_revision,
            )));
        }
        let text = state.core.text().logical_text().to_string();
        Ok((text, state.core.revision()))
    })
    .map_err(map_error)?;

    Ok(ResyncResultDto {
        revision: revision.0,
        text,
    })
}

/// Flush pending patches (barrier) — in this synchronous implementation,
/// this is a no-op because patches are applied synchronously.
/// For async patches, this would wait for all pending acks.
#[tauri::command]
pub fn flush_document(session_id: u64) -> Result<FlushResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;

    let sid = SessionId(session_id);

    let revision =
        with_session_state(registry, sid, |state| Ok(state.core.revision())).map_err(map_error)?;

    Ok(FlushResultDto {
        revision: revision.0,
    })
}

/// Get full document text.
#[tauri::command]
pub fn get_document_text(session_id: u64) -> Result<DocumentTextResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;

    let sid = SessionId(session_id);

    let (text, revision) = with_session_state(registry, sid, |state| {
        let text = state.core.text().logical_text().to_string();
        let revision = state.core.revision();
        Ok((text, revision))
    })
    .map_err(map_error)?;

    Ok(DocumentTextResultDto {
        text,
        revision: revision.0,
    })
}

/// Get viewport-scoped Render IR for Core-backed WYSIWYG.
#[tauri::command]
pub fn get_render_blocks(
    session_id: u64,
    revision: u64,
    viewport: UiRangeDto,
    request_id: String,
) -> Result<RenderDocumentDto, AppError> {
    let registry = &*SESSION_REGISTRY;
    let sid = SessionId(session_id);

    let document = with_session_state(registry, sid, |state| {
        state
            .core
            .render_blocks(RenderRequest {
                revision: Revision(revision),
                viewport: UiRange {
                    start: Utf16Offset(viewport.start),
                    end: Utf16Offset(viewport.end),
                },
                request_id,
            })
            .map_err(RuntimeError::from)
    })
    .map_err(map_error)?;

    Ok(map_render_document(document))
}

/// Get document outline.
#[tauri::command]
pub fn get_outline(session_id: u64) -> Result<OutlineResultDto, AppError> {
    let registry = &*SESSION_REGISTRY;

    let sid = SessionId(session_id);

    with_session_state(registry, sid, |_state| {
        // For now, return an empty outline.
        // Full outline from ParseIndex would be implemented in M3 follow-up.
        Ok(OutlineResultDto { items: vec![] })
    })
    .map_err(map_error)
}

/// Get document stats (line count, byte count).
#[tauri::command]
pub fn get_document_stats(session_id: u64) -> Result<DocumentStatsDto, AppError> {
    let registry = &*SESSION_REGISTRY;

    let sid = SessionId(session_id);

    let (line_count, byte_count) = with_session_state(registry, sid, |state| {
        let line_count = state.core.line_count();
        let byte_count = state.core.text().logical_text().len();
        Ok((line_count, byte_count))
    })
    .map_err(map_error)?;

    Ok(DocumentStatsDto {
        line_count,
        byte_count,
    })
}

/// Reload a document from disk.
///
/// Uses spawn_blocking for file I/O. Performs a proper reload:
/// 1. Get file path (outside session lock)
/// 2. Read via Host (outside session lock)
/// 3. Re-acquire lock, verify session is clean
/// 4. Create new Core state from loaded bytes, atomically replace
#[tauri::command]
pub async fn reload_document(session_id: u64) -> Result<ReloadResultDto, AppError> {
    let sid = SessionId(session_id);

    // U6.4: Move the reload (with file I/O) to a blocking thread
    let result = spawn_blocking(move || -> Result<ReloadResultDto, AppError> {
        let registry = &*SESSION_REGISTRY;
        let host = AppHost;

        // 1. Get the file path (outside session lock)
        let handle = registry
            .get(sid)
            .ok_or_else(RuntimeError::session_not_found)
            .map_err(map_error)?;
        let path = handle
            .source
            .path
            .clone()
            .ok_or_else(|| RuntimeError::internal("No path for reload"))
            .map_err(map_error)?;

        // 2. Read via host outside session lock
        let (bytes, _identity) = host.read_document_bytes(&path).map_err(map_error)?;

        // 3. Re-acquire lock, verify clean, replace Core state
        let (text, revision) = with_session_state(registry, sid, |state| {
            if state.is_dirty() {
                return Err(RuntimeError::new(
                    RuntimeErrorCode::TransactionConflict,
                    "Cannot reload: session has unpersisted changes",
                ));
            }

            let core_session =
                markflow_core::DocumentSession::open_bytes(sid, state.core.document_id, &bytes)
                    .map_err(RuntimeError::from)?;

            state.core = core_session;

            let text = state.core.text().logical_text().to_string();
            let revision = state.core.revision();
            Ok((text, revision))
        })
        .map_err(map_error)?;

        let identity = FileIdentityDto {
            canonical_path: None,
            size: text.len() as u64,
            fingerprint_hash: String::new(),
        };

        Ok(ReloadResultDto {
            revision: revision.0,
            text,
            file_identity: identity,
        })
    })
    .await
    .map_err(|e| AppError::internal(format!("Task join error: {}", e)))??;

    Ok(result)
}

/// Close a document session.
#[tauri::command]
pub fn close_document(session_id: u64) -> Result<(), AppError> {
    let registry = &*SESSION_REGISTRY;

    let sid = SessionId(session_id);

    registry.close(sid).map_err(map_error)?;
    clear_command_cache_for_session(session_id)?;

    tracing::debug!(target: "runtime.command", session_id = session_id, "Document session closed");

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppErrorCode;
    use markflow_core::DocumentSession;
    use markflow_runtime::error::{RuntimeError, RuntimeErrorCode};
    use markflow_runtime::{FileIdentity, SessionRegistry};
    use std::path::PathBuf;

    /// Construct all known RuntimeErrorCodes, pass each through
    /// map_error, and verify:
    ///
    ///   * Every RuntimeErrorCode maps 1:1 to a matching AppErrorCode variant.
    ///   * The stable code string (e.g. "REVISION_MISMATCH") appears in
    ///     the message so the frontend fallback heuristic still works.
    ///   * The original detail string is preserved in the message.
    #[test]
    fn map_error_all_codes_map_to_correct_app_error_code() {
        let cases: Vec<(
            RuntimeErrorCode,
            AppErrorCode,
            &str, // expected code string in message
            &str, // detail
        )> = vec![
            (
                RuntimeErrorCode::RevisionMismatch,
                AppErrorCode::RevisionMismatch,
                "REVISION_MISMATCH",
                "expected rev 5, got 10",
            ),
            (
                RuntimeErrorCode::InvalidUtf16Boundary,
                AppErrorCode::InvalidUtf16Boundary,
                "INVALID_UTF16_BOUNDARY",
                "offset at 42",
            ),
            (
                RuntimeErrorCode::TransactionConflict,
                AppErrorCode::TransactionConflict,
                "TRANSACTION_CONFLICT",
                "concurrent edit detected",
            ),
            (
                RuntimeErrorCode::Conflict,
                AppErrorCode::ConflictDetected,
                "CONFLICT",
                "external modification detected",
            ),
            (
                RuntimeErrorCode::SessionNotFound,
                AppErrorCode::SessionNotFound,
                "SESSION_NOT_FOUND",
                "session id 42 not found",
            ),
            (
                RuntimeErrorCode::SaveFlushTimeout,
                AppErrorCode::SaveFlushTimeout,
                "SAVE_FLUSH_TIMEOUT",
                "timed out after 5 s",
            ),
            (
                RuntimeErrorCode::InvalidRange,
                AppErrorCode::InvalidRange,
                "INVALID_RANGE",
                "offset out of bounds",
            ),
            (
                RuntimeErrorCode::UnsupportedEncoding,
                AppErrorCode::UnsupportedEncoding,
                "UNSUPPORTED_ENCODING",
                "utf-32 is not supported",
            ),
            (
                RuntimeErrorCode::PendingQueueFull,
                AppErrorCode::PendingQueueFull,
                "PENDING_QUEUE_FULL",
                "max 100 items",
            ),
            (
                RuntimeErrorCode::Cancelled,
                AppErrorCode::Cancelled,
                "CANCELLED",
                "operation cancelled by user",
            ),
            (
                RuntimeErrorCode::ProtocolVersionUnsupported,
                AppErrorCode::ProtocolVersionUnsupported,
                "PROTOCOL_VERSION_UNSUPPORTED",
                "version 2 is unsupported",
            ),
            (
                RuntimeErrorCode::Internal,
                AppErrorCode::Internal,
                "INTERNAL",
                "unexpected failure",
            ),
        ];

        for (code, expected_app_code, expected_code_str, detail) in cases {
            let e = RuntimeError::new(code, detail);
            let app_err = map_error(e);
            assert_eq!(
                app_err.code, expected_app_code,
                "map_error({:?}) should produce {:?}, got {:?}",
                code, expected_app_code, app_err.code,
            );
            assert!(
                app_err.message.contains(expected_code_str),
                "Expected code '{}' in message '{}' for {:?}",
                expected_code_str,
                app_err.message,
                code,
            );
            assert!(
                app_err.message.contains(detail),
                "Expected detail '{}' in message '{}' for {:?}",
                detail,
                app_err.message,
                code,
            );
        }
    }

    fn create_render_test_session(bytes: &'static [u8]) -> markflow_core::SessionId {
        let registry: &SessionRegistry = &SESSION_REGISTRY;
        registry
            .create(
                ClientId("test".into()),
                "test-window".into(),
                DocumentSource::new_file(PathBuf::from(format!(
                    "/tmp/markflow-render-test-{}.md",
                    bytes.len()
                ))),
                FileIdentity::empty(),
                |sid, did| DocumentSession::open_bytes(sid, did, bytes).map_err(RuntimeError::from),
            )
            .unwrap()
    }

    fn create_command_test_session(bytes: &'static [u8]) -> markflow_core::SessionId {
        create_render_test_session(bytes)
    }

    fn session_text(session_id: markflow_core::SessionId) -> String {
        with_session_state(&SESSION_REGISTRY, session_id, |state| {
            Ok(state.core.text().logical_text().to_string())
        })
        .unwrap()
    }

    #[test]
    fn execute_edit_command_returns_utf16_patch_for_non_ascii_selection() {
        let session_id = create_command_test_session("你好 world".as_bytes());
        let result = execute_edit_command(
            session_id.0,
            EditCommandDto::ToggleStrong { anchor: 0, head: 2 },
            0,
            "cmd-non-ascii".into(),
        )
        .unwrap();
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(result.session_id, session_id.0);
        assert_eq!(result.revision, 1);
        assert_eq!(result.patch.base_revision, 0);
        assert_eq!(result.patch.changes.len(), 1);
        assert_eq!(result.patch.changes[0].from, 0);
        assert_eq!(result.patch.changes[0].to, 2);
        assert_eq!(result.patch.changes[0].insert, "**你好**");
        assert_eq!(
            result.affected_ranges,
            vec![UiRangeDto { start: 0, end: 2 }]
        );
        assert_eq!(
            result.selection_after,
            Some(SelectionDto { anchor: 0, head: 6 })
        );
    }

    #[test]
    fn execute_edit_command_rejects_revision_mismatch() {
        let session_id = create_command_test_session(b"abc");
        let err = execute_edit_command(
            session_id.0,
            EditCommandDto::ToggleStrong { anchor: 0, head: 1 },
            9,
            "cmd-stale".into(),
        )
        .unwrap_err();
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(err.code, AppErrorCode::RevisionMismatch);
    }

    #[test]
    fn execute_edit_command_rejects_unknown_session() {
        let err = execute_edit_command(
            u64::MAX,
            EditCommandDto::ToggleStrong { anchor: 0, head: 1 },
            0,
            "cmd-missing".into(),
        )
        .unwrap_err();

        assert_eq!(err.code, AppErrorCode::SessionNotFound);
    }

    #[test]
    fn execute_edit_command_retries_are_idempotent() {
        let session_id = create_command_test_session(b"abc");
        let command = EditCommandDto::ToggleStrong { anchor: 0, head: 1 };
        let first =
            execute_edit_command(session_id.0, command.clone(), 0, "cmd-retry".into()).unwrap();
        let second = execute_edit_command(session_id.0, command, 0, "cmd-retry".into()).unwrap();
        let text = session_text(session_id);
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(second, first);
        assert_eq!(text, "**a**bc");
    }

    #[test]
    fn execute_edit_command_reused_transaction_with_different_payload_conflicts() {
        let session_id = create_command_test_session(b"abc");
        let _ = execute_edit_command(
            session_id.0,
            EditCommandDto::ToggleStrong { anchor: 0, head: 1 },
            0,
            "cmd-conflict".into(),
        )
        .unwrap();
        let err = execute_edit_command(
            session_id.0,
            EditCommandDto::ToggleEmphasis { anchor: 0, head: 1 },
            0,
            "cmd-conflict".into(),
        )
        .unwrap_err();
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(err.code, AppErrorCode::TransactionConflict);
    }

    #[test]
    fn execute_edit_command_insert_link_uses_display_text_for_empty_selection() {
        let session_id = create_command_test_session(b"prefix ");
        let result = execute_edit_command(
            session_id.0,
            EditCommandDto::InsertLink {
                anchor: 7,
                head: 7,
                href: "https://example.com/".into(),
                title: None,
                text: Some("Example".into()),
            },
            0,
            "cmd-link-text".into(),
        )
        .unwrap();
        let text = session_text(session_id);
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(text, "prefix [Example](https://example.com/)");
        assert_eq!(
            result.patch.changes[0].insert,
            "[Example](https://example.com/)"
        );
    }

    #[test]
    fn execute_edit_command_insert_code_fence_wraps_selection() {
        let session_id = create_command_test_session(b"before\ncode\nafter");
        let result = execute_edit_command(
            session_id.0,
            EditCommandDto::InsertCodeFence {
                position: 7,
                anchor: Some(7),
                head: Some(11),
                language: None,
            },
            0,
            "cmd-code-fence-selection".into(),
        )
        .unwrap();
        let text = session_text(session_id);
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(text, "before\n```\ncode\n```\nafter");
        assert_eq!(result.patch.changes[0].from, 7);
        assert_eq!(result.patch.changes[0].to, 11);
        assert_eq!(result.patch.changes[0].insert, "```\ncode\n```");
    }

    #[test]
    fn undo_redo_reject_multi_step_patch_result() {
        let session_id = create_command_test_session(b"abc");
        let undo_err = undo_document(session_id.0, "undo-two".into(), Some(2)).unwrap_err();
        let redo_err = redo_document(session_id.0, "redo-zero".into(), Some(0)).unwrap_err();
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(undo_err.code, AppErrorCode::InvalidRange);
        assert_eq!(redo_err.code, AppErrorCode::InvalidRange);
    }

    #[test]
    fn undo_redo_are_session_isolated_and_return_patches() {
        let left = create_command_test_session(b"left");
        let right = create_command_test_session(b"right");
        let _ = execute_edit_command(
            left.0,
            EditCommandDto::ToggleStrong { anchor: 0, head: 4 },
            0,
            "left-bold".into(),
        )
        .unwrap();
        let _ = execute_edit_command(
            right.0,
            EditCommandDto::ToggleEmphasis { anchor: 0, head: 5 },
            0,
            "right-italic".into(),
        )
        .unwrap();

        let undo = undo_document(left.0, "left-undo".into(), None).unwrap();
        let redo = redo_document(left.0, "left-redo".into(), None).unwrap();
        let left_text = session_text(left);
        let right_text = session_text(right);
        let _ = SESSION_REGISTRY.close(left);
        let _ = SESSION_REGISTRY.close(right);

        assert_eq!(undo.patch.changes[0].from, 0);
        assert_eq!(undo.patch.changes[0].insert, "left");
        assert_eq!(redo.patch.changes[0].insert, "**left**");
        assert_eq!(left_text, "**left**");
        assert_eq!(right_text, "*right*");
    }

    #[test]
    fn map_render_document_returns_stable_dto_names() {
        let session = DocumentSession::open_bytes(
            markflow_core::SessionId(10),
            markflow_core::DocumentId(20),
            b"# Title\n\n**bold**\n",
        )
        .unwrap();
        let document = session
            .render_blocks(RenderRequest {
                revision: Revision(0),
                viewport: UiRange::new(0, session.text().logical_text().len()),
                request_id: "dto".into(),
            })
            .unwrap();

        let dto = map_render_document(document);

        assert_eq!(dto.session_id, 10);
        assert_eq!(dto.document_id, 20);
        assert_eq!(dto.request_id, "dto");
        assert_eq!(dto.blocks[0].kind, "heading");
        assert_eq!(dto.blocks[0].level, Some(1));
        assert_eq!(dto.blocks[1].inlines[0].kind, "strong");
        assert_eq!(dto.blocks[1].inlines[0].marker_ranges.len(), 2);
    }

    #[test]
    fn get_render_blocks_returns_matching_response() {
        let session_id = create_render_test_session(b"# Title\n\n![alt](img.png)\n");
        let result = get_render_blocks(
            session_id.0,
            0,
            UiRangeDto { start: 0, end: 24 },
            "req-1".into(),
        )
        .unwrap();
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(result.session_id, session_id.0);
        assert_eq!(result.revision, 0);
        assert_eq!(result.request_id, "req-1");
        assert_eq!(result.blocks[0].kind, "heading");
        assert_eq!(result.blocks[1].kind, "image");
        assert_eq!(result.blocks[1].inlines[0].kind, "image_reference");
    }

    #[test]
    fn get_render_blocks_rejects_stale_revision() {
        let session_id = create_render_test_session(b"abc\n");
        with_session_state(&SESSION_REGISTRY, session_id, |state| {
            state
                .core
                .apply_patch(TextPatch {
                    transaction_id: TransactionId(9),
                    base_revision: Revision(0),
                    changes: vec![TextChange {
                        range: SourceRange::new(Revision(0), 0, 0),
                        replacement: "x".into(),
                    }],
                    selection_after: None,
                })
                .map_err(RuntimeError::from)?;
            Ok(())
        })
        .unwrap();

        let err = get_render_blocks(
            session_id.0,
            0,
            UiRangeDto { start: 0, end: 1 },
            "stale".into(),
        )
        .unwrap_err();
        let _ = SESSION_REGISTRY.close(session_id);

        assert_eq!(err.code, AppErrorCode::RevisionMismatch);
    }

    #[test]
    fn get_render_blocks_rejects_unknown_session() {
        let err = get_render_blocks(
            u64::MAX,
            0,
            UiRangeDto { start: 0, end: 1 },
            "missing".into(),
        )
        .unwrap_err();

        assert_eq!(err.code, AppErrorCode::SessionNotFound);
    }
}
