//! Guarded atomic write + durable receipt — P1B task 3.6.
//!
//! Implements design 04 §3:
//!
//! - `guarded_atomic_write(path, payload, expectedFileIdentity, saveOperationId)`
//!   is a single native command: unique temp file in the target directory,
//!   write + fsync, then an atomic exchange that preserves the displaced target,
//!   followed by displaced-identity verification.
//! - `saveOperationId` is idempotent: same operation + payload retries return
//!   the original result; the same operation with a different payload is
//!   rejected. Every operation persists a durable receipt
//!   (`Prepared → Written → Committed`, with `Conflict` terminal state).
//! - `reconcile_document_save(saveOperationId)` classifies outcome-unknown
//!   writes from the receipt + current disk identity.
//! - On application start, unfinished receipts are scanned before any related
//!   path may enter autosave.
//!
//! ## Platform capability
//!
//! Every supported platform has a native exchange primitive that preserves the
//! displaced target, so the replace point can hash it and compare it to
//! `expectedFileIdentity`. This satisfies the design's "backup-preserving
//! replace with displaced-identity verification" requirement (no true CAS
//! primitive, but an atomic swap is equivalent for this purpose). All three
//! implementations guarantee the same post-condition: after `atomic_exchange`
//! returns `Ok`, `target` holds the new payload and `tmp` holds the displaced
//! original bytes.
//!
//! - macOS: `renameatx_np(RENAME_SWAP)` — a single atomic swap of the two
//!   paths.
//! - Linux: `renameat2(RENAME_EXCHANGE)` — the same atomic swap semantic.
//! - Windows: `ReplaceFileW` with a backup file — the replaced target is moved
//!   to the backup path and the replacement is consumed, so the backup is
//!   renamed back onto `tmp` to restore the shared post-condition.
//!
//! A target expected to be absent (`expectedFileIdentity == None`) uses the
//! create-if-absent path (`renameatx_np(RENAME_EXCL)` /
//! `renameat2(RENAME_NOREPLACE)` / `MoveFileExW` without
//! `MOVEFILE_REPLACE_EXISTING`); if the path exists at the replace point it is
//! a conflict, never treated as a replaceable old file.
//!
//! Where the primitive is unavailable at runtime — a filesystem without
//! `RENAME_EXCHANGE` support (overlayfs, some FUSE/network filesystems) or a
//! volume where `ReplaceFileW` is rejected — this module refuses default
//! replacement (returns a documented `unsupported-platform` error so the caller
//! degrades to Save Copy), rather than claiming a guarded write with plain
//! rename, which would silently overwrite a target replaced at the swap
//! instant.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use markflow_core::{ContentHash, DocumentId, FileIdentity, SessionId};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::dto::{LosslessError, ReceiptState, SaveReceipt};
use crate::paths::app_config_dir;
use crate::state::AppState;

// Deterministic dispatcher-test barrier: it fires after the initial receipt /
// generation validation and temp-file fsync, immediately before the final
// replacement-point lease validation. It models a reload/close revocation that
// arrives in exactly the historical check-to-exchange window.
#[cfg(test)]
thread_local! {
    static REVOKE_LEASE_BEFORE_REPLACE_ONCE: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(test)]
pub fn inject_lifecycle_revocation_before_replace_once() {
    REVOKE_LEASE_BEFORE_REPLACE_ONCE.with(|flag| flag.set(true));
}

#[cfg(test)]
fn test_revoke_lease_before_replace(state: &State<AppState>, session_id: SessionId) {
    REVOKE_LEASE_BEFORE_REPLACE_ONCE.with(|flag| {
        if flag.replace(false) {
            state
                .lossless_registry
                .with_lifecycle_transition(session_id, || Ok::<_, LosslessError>(()))
                .expect("test lifecycle transition");
        }
    });
}

#[cfg(not(test))]
fn test_revoke_lease_before_replace(_state: &State<AppState>, _session_id: SessionId) {}

pub const RECEIPTS_DIR_NAME: &str = "lossless-receipts";

/// `guarded_atomic_write`
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardedWriteRequest {
    pub path: String,
    /// Confirmed Core payload (base64). Its hash must equal the prepared
    /// receipt's payload hash or the write is rejected.
    pub payload_base64: String,
    /// `Some` → replace an existing target only if its identity matches.
    /// `None` → target is expected to be ABSENT (Save As / New File).
    pub expected_file_identity: Option<FileIdentity>,
    pub save_operation_id: String,
}

/// Result of a guarded write.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardedWriteResponse {
    pub save_operation_id: String,
    pub outcome: WriteOutcome,
    /// Identity of the newly written target (path/size/mtime/hash), when the
    /// write landed. Caller binds it via `commit_document_save`.
    pub new_file_identity: Option<FileIdentity>,
    /// Whether the displaced target's identity matched `expectedFileIdentity`.
    pub displaced_identity_matched: bool,
    pub receipt_state: String,
}

/// Terminal / continuable outcomes surfaced to the frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WriteOutcome {
    Written,
    Conflict,
}

/// Result of `reconcile_document_save`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileResponse {
    pub save_operation_id: String,
    /// "not-written" | "written-and-commit-pending" | "committed" | "conflict"
    pub state: String,
    pub new_file_identity: Option<FileIdentity>,
    pub session_id: u64,
    pub document_id: u64,
    pub revision: u64,
}

/// One unresolved durable save operation surfaced to the product on startup.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupRecoveryItem {
    pub save_operation_id: String,
    pub path: String,
    pub state: String,
    pub session_id: u64,
    pub document_id: u64,
    pub revision: u64,
    pub payload_sha256: String,
    /// The displaced recovery copy (bytes preserved at exchange time), when the
    /// host retained one (P1B corrective P1-1).
    pub recovery_path: Option<String>,
    /// The durable receipt cannot be decoded by this version (including an
    /// older schema). It must be explicitly quarantined before the global
    /// lossless safety gate can be lifted; accepting/discarding bytes would be
    /// dishonest because their target and outcome are unknown.
    pub requires_quarantine: bool,
}

/// `resolve_startup_recovery` request.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveStartupRecoveryRequest {
    pub save_operation_id: String,
    /// "accept-written" | "discard-recovery" | "quarantine-invalid-receipt"
    pub action: String,
}

/// `list_startup_recovery`
#[tauri::command]
pub fn list_startup_recovery(_state: State<AppState>) -> Vec<StartupRecoveryItem> {
    let mut items = Vec::new();
    for receipt in scan_unfinished_receipts().into_values() {
        // Re-classify against current disk so the listed state is truthful
        // (a crash may have moved the target since the receipt was written).
        let state = classify_startup_receipt(&receipt).unwrap_or_else(|e| e.code);
        items.push(StartupRecoveryItem {
            save_operation_id: receipt.save_operation_id,
            path: receipt.canonical_target_path,
            state,
            session_id: receipt.session_id,
            document_id: receipt.document_id,
            revision: receipt.revision,
            payload_sha256: receipt.payload_sha256,
            recovery_path: receipt.recovery_path,
            requires_quarantine: false,
        });
    }
    // A parse/schema failure must never silently disappear from the recovery
    // UI: it is a global Host write gate. Expose a constrained, explicit
    // quarantine action that preserves the opaque receipt under the app data
    // directory instead of guessing a target or allowing legacy writes.
    items.extend(
        invalid_receipt_entries()
            .into_iter()
            .map(|entry| StartupRecoveryItem {
                save_operation_id: entry.recovery_id,
                path: format!("不可读 durable receipt：{}", entry.file_name),
                state: "unreadable-receipt".to_owned(),
                session_id: 0,
                document_id: 0,
                revision: 0,
                payload_sha256: String::new(),
                recovery_path: None,
                requires_quarantine: true,
            }),
    );
    items
}

/// `resolve_startup_recovery` — record a terminal recovery decision durably.
///
/// The startup Host gate stays active until a terminal decision is durably
/// persisted: only a receipt advanced to `Committed` is skipped by
/// `ensure_target_reconciled` / `scan_unfinished_receipts` (P1B corrective
/// P2-1). Actions:
///
/// - `accept-written`: the user confirmed the disk holds the payload this
///   operation wrote (written-and-commit-pending on disk) — commit the receipt.
/// - `discard-recovery`: the user chose to discard the displaced recovery copy
///   and keep the current disk state — commit the receipt and delete the
///   recovery file.
#[tauri::command]
pub fn resolve_startup_recovery(
    req: ResolveStartupRecoveryRequest,
    _state: State<AppState>,
) -> Result<(), LosslessError> {
    // Invalid or old-schema receipts deliberately use an opaque recovery ID
    // rather than a filesystem path supplied by the WebView. The only allowed
    // action preserves the original receipt beneath our controlled receipts
    // directory, then removes it from the active gate scan.
    if req.action == "quarantine-invalid-receipt" {
        return quarantine_invalid_receipt(&req.save_operation_id);
    }
    validate_operation_id(&req.save_operation_id)?;
    let receipt_path = receipt_path_for(&req.save_operation_id);
    let Some(receipt) = read_receipt(&receipt_path)? else {
        return Err(LosslessError::new(
            "operation-not-prepared",
            "找不到该 saveOperationId 的 durable receipt",
        ));
    };
    if receipt.state == ReceiptState::Committed {
        return Ok(()); // already terminal
    }
    match req.action.as_str() {
        "accept-written" => {
            // Only safe when the disk actually holds the written payload.
            let target = PathBuf::from(&receipt.canonical_target_path);
            let ok = match std::fs::read(&target) {
                Ok(bytes) => {
                    ContentHash::of(&bytes).hex() == receipt.payload_sha256
                        && receipt.new_file_identity.as_ref().is_some_and(|identity| {
                            target_identity_matches(
                                identity,
                                &current_file_identity(&target, &bytes),
                            )
                        })
                }
                Err(_) => false,
            };
            if !ok {
                return Err(LosslessError::new(
                    "save-outcome-unknown",
                    "磁盘内容与该操作写入的 payload 不一致，不能接受为已写入",
                ));
            }
            finalize_receipt(&req.save_operation_id, &receipt)?;
            Ok(())
        }
        "discard-recovery" => {
            finalize_receipt(&req.save_operation_id, &receipt)?;
            Ok(())
        }
        other => Err(LosslessError::new(
            "invalid-action",
            format!("未知 recovery 决策: {other}"),
        )),
    }
}

#[derive(Debug, Clone)]
struct InvalidReceiptEntry {
    recovery_id: String,
    receipt_path: PathBuf,
    file_name: String,
}

/// Enumerate active receipt files that this Host cannot safely decode. This
/// includes historical schemas with missing required fields as well as damaged
/// JSON. They are intentionally not folded into `scan_unfinished_receipts`:
/// callers must not mistake unknown state for a normal save outcome.
fn invalid_receipt_entries() -> Vec<InvalidReceiptEntry> {
    let Ok(entries) = std::fs::read_dir(receipts_dir()) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !file_name.ends_with(".json") || !entry.path().is_file() {
                return None;
            }
            read_receipt(&entry.path())
                .err()
                .map(|_| InvalidReceiptEntry {
                    recovery_id: invalid_receipt_recovery_id(&entry.path()),
                    receipt_path: entry.path(),
                    file_name,
                })
        })
        .collect()
}

/// An opaque, valid UUID-shaped identifier derived from the controlled receipt
/// path. It lets the frontend nominate exactly one entry without ever exposing
/// a path-join primitive through the command boundary.
fn invalid_receipt_recovery_id(receipt_path: &Path) -> String {
    let digest = path_hash(&receipt_path.to_string_lossy());
    format!(
        "{}-{}-4{}-8{}-{}",
        &digest[0..8],
        &digest[8..12],
        &digest[13..16],
        &digest[17..20],
        &digest[20..32],
    )
}

fn quarantine_invalid_receipt(recovery_id: &str) -> Result<(), LosslessError> {
    validate_operation_id(recovery_id)?;
    let Some(entry) = invalid_receipt_entries()
        .into_iter()
        .find(|entry| entry.recovery_id == recovery_id)
    else {
        return Err(LosslessError::new(
            "operation-not-prepared",
            "找不到不可读 durable receipt，可能已被其他恢复操作处理",
        ));
    };

    let quarantine_dir = receipts_dir().join("quarantined-invalid");
    std::fs::create_dir_all(&quarantine_dir)
        .map_err(|e| LosslessError::io(format!("创建 receipt 隔离目录失败: {e}")))?;
    let target = quarantine_dir.join(format!("{recovery_id}.json"));
    if target.exists() {
        return Err(LosslessError::new(
            "recovery-already-quarantined",
            "该不可读 receipt 已被隔离；请重新打开文件",
        ));
    }
    std::fs::rename(&entry.receipt_path, &target)
        .map_err(|e| LosslessError::io(format!("隔离不可读 receipt 失败: {e}")))?;
    // The original opaque evidence survives the operation; fsync both
    // directories so a power loss cannot resurrect an active corrupt gate or
    // lose the user's recovery artifact.
    fsync_parent_dir(&entry.receipt_path)
        .map_err(|e| LosslessError::io(format!("同步 receipt 原目录失败: {e}")))?;
    fsync_parent_dir(&target)
        .map_err(|e| LosslessError::io(format!("同步 receipt 隔离目录失败: {e}")))?;
    Ok(())
}

/// Advance a receipt to `Committed` (durably, with recovery finalization) after
/// a terminal user decision. The Host gate lifts because committed receipts are
/// skipped by the startup/path gate.
fn finalize_receipt(save_operation_id: &str, receipt: &SaveReceipt) -> Result<(), LosslessError> {
    let recovery = receipt.recovery_path.clone();
    update_receipt(save_operation_id, |r| {
        r.state = ReceiptState::Committed;
        r.recovery_path = None;
    })?;
    if let Some(path) = recovery {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
pub fn guarded_atomic_write(
    req: GuardedWriteRequest,
    state: State<AppState>,
) -> Result<GuardedWriteResponse, LosslessError> {
    let op_id = req.save_operation_id.clone();
    validate_operation_id(&op_id)?;
    let payload = decode_base64(&req.payload_base64)?;
    let payload_hash = ContentHash::of(&payload);

    // A Prepared receipt, not the frontend request, is the capability to
    // write. In particular, a payload hash alone must never authorize a write
    // to another target or at another revision.
    let receipt_path = receipt_path_for(&op_id);
    let receipt = read_receipt(&receipt_path)?.ok_or_else(|| {
        LosslessError::new(
            "operation-not-prepared",
            "saveOperationId 未经过 prepare_document_save，拒绝写入",
        )
    })?;
    validate_write_request_against_receipt(&req, &receipt, &payload_hash)?;
    // P0-3: a reload/close advances the session's binding generation. A save
    // prepared against an older document image must not write bytes the user
    // explicitly discarded by reloading — refuse the write (the receipt stays
    // Prepared, reconcile reports not-written).
    let save_lease = state.lossless_registry.resume_save_lease(
        SessionId(receipt.session_id),
        DocumentId(receipt.document_id),
        receipt.binding_generation,
        receipt.save_epoch,
    )?;
    let path = PathBuf::from(&receipt.canonical_target_path);

    match receipt.state {
        ReceiptState::Committed => {
            return Ok(GuardedWriteResponse {
                save_operation_id: op_id.clone(),
                outcome: WriteOutcome::Written,
                new_file_identity: receipt.new_file_identity,
                displaced_identity_matched: true,
                receipt_state: "committed".into(),
            });
        }
        ReceiptState::Written => {
            // Retry after a lost write response: confirm the disk still holds
            // the written bytes, then return the same result idempotently.
            if let Ok(disk) = std::fs::read(&path) {
                if ContentHash::of(&disk) == payload_hash {
                    return Ok(GuardedWriteResponse {
                        save_operation_id: op_id.clone(),
                        outcome: WriteOutcome::Written,
                        new_file_identity: receipt.new_file_identity,
                        displaced_identity_matched: true,
                        receipt_state: "written".into(),
                    });
                }
            }
            // Disk moved away → external race; classify as conflict.
            update_receipt(&op_id, |r| r.state = ReceiptState::Conflict)?;
            return Ok(GuardedWriteResponse {
                save_operation_id: op_id.clone(),
                outcome: WriteOutcome::Conflict,
                new_file_identity: None,
                displaced_identity_matched: false,
                receipt_state: "conflict".into(),
            });
        }
        ReceiptState::Prepared => { /* fall through to write */ }
        ReceiptState::Conflict => {
            return Err(LosslessError::new(
                "external-conflict",
                "该操作已进入冲突状态，需要人工解决后再保存",
            ));
        }
    }

    // ── Expected-identity re-check at the replace point ──────────────
    let target_exists = path.exists();
    match &receipt.expected_file_identity {
        Some(expected) => {
            if !target_exists {
                update_receipt(&op_id, |r| r.state = ReceiptState::Conflict)?;
                return Ok(conflict_response(&op_id));
            }
            let current = current_file_identity(
                &path,
                &std::fs::read(&path).map_err(|e| LosslessError::io(e.to_string()))?,
            );
            if !identity_matches(expected, &current) {
                update_receipt(&op_id, |r| r.state = ReceiptState::Conflict)?;
                return Ok(conflict_response(&op_id));
            }
        }
        None => {
            if target_exists {
                // Save As / New File: a path created before the replace point is
                // a conflict, never treated as a replaceable old file.
                update_receipt(&op_id, |r| r.state = ReceiptState::Conflict)?;
                return Ok(conflict_response(&op_id));
            }
        }
    }

    // ── Atomic exchange preserving the displaced target ─────────────
    let parent = path
        .parent()
        .ok_or_else(|| LosslessError::new("io", "无法确定父目录"))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| LosslessError::io(format!("创建父目录失败: {e}")))?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "doc.md".into());
    let tmp = parent.join(format!(".{file_name}.{}.mf-tmp", path_hash(&op_id)));

    let mut replacement_completed = false;
    let write_result = (|| -> Result<GuardedWriteResponse, LosslessError> {
        {
            use std::io::Write;
            let mut f = std::fs::File::create(&tmp)
                .map_err(|e| LosslessError::io(format!("创建临时文件失败: {e}")))?;
            f.write_all(&payload)
                .map_err(|e| LosslessError::io(format!("写入临时文件失败: {e}")))?;
            f.sync_all()
                .map_err(|e| LosslessError::io(format!("同步临时文件失败: {e}")))?;
        }

        match &receipt.expected_file_identity {
            Some(_) => {
                // This is the last in-process lifecycle check before the
                // native replacement. Reload/close revoke the lease before
                // replacing their session image, so a user discard that wins
                // while temp bytes are being prepared cannot reach disk.
                test_revoke_lease_before_replace(&state, SessionId(receipt.session_id));
                // Validation and the actual native exchange share one
                // lifecycle mutex with reload/close. There is deliberately no
                // instruction boundary where a discard can arrive after the
                // validation yet before `renameatx_np` executes.
                state
                    .lossless_registry
                    .with_save_lifecycle_lock(&save_lease, || {
                        atomic_exchange(&tmp, &path).map_err(|e| {
                            // A failed exchange leaves `tmp` holding our own
                            // payload (on Windows the replace consumed it, so
                            // this is a no-op). Only a *completed* exchange
                            // turns `tmp` into displaced evidence, and that
                            // copy must never be deleted here.
                            let _ = std::fs::remove_file(&tmp);
                            if e.kind() == std::io::ErrorKind::Unsupported {
                                LosslessError::new(
                                    "unsupported-platform",
                                    format!(
                                        "当前平台/文件系统不支持保留原文件的原子替换，已拒绝覆盖保存（请使用另存副本）: {e}"
                                    ),
                                )
                            } else {
                                LosslessError::io(format!("原子替换失败: {e}"))
                            }
                        })
                    })?;
                replacement_completed = true;
                // Verify displaced identity at the replace point.
                let displaced = std::fs::read(&tmp).map_err(|e| {
                    let _ = std::fs::remove_file(&tmp);
                    LosslessError::io(format!("读取被替换文件失败: {e}"))
                })?;
                let displaced_hash = ContentHash::of(&displaced);
                // The displaced bytes are the pre-replacement target; they must
                // match the identity the caller expected to be there.
                let displaced_ok = receipt
                    .expected_file_identity
                    .as_ref()
                    .map(|expected| expected.content_hash == displaced_hash)
                    .unwrap_or(false);
                if !displaced_ok {
                    // External race won at the swap instant: keep the displaced
                    // bytes as recovery at `tmp`; do NOT delete.
                    update_receipt(&op_id, |r| {
                        r.state = ReceiptState::Conflict;
                        r.recovery_path = Some(tmp.to_string_lossy().to_string());
                    })?;
                    return Ok(conflict_response(&op_id));
                }
                // P1-1: the displaced bytes stay at `tmp` until the Written
                // receipt (with the recovery path + new identity) is durable.
                // The recovery file is NOT deleted here — the commit finalizes
                // it. A crash or receipt-write failure therefore always leaves
                // the displaced original discoverable.
            }
            None => {
                test_revoke_lease_before_replace(&state, SessionId(receipt.session_id));
                // Save As/New follows the same validation+create critical
                // section; a close/reload cannot slip into this final gap.
                let created = state.lossless_registry.with_save_lifecycle_lock(&save_lease, || {
                    create_if_absent(&tmp, &path).map_err(|e| {
                        let _ = std::fs::remove_file(&tmp);
                        if e.kind() == std::io::ErrorKind::Unsupported {
                            LosslessError::new(
                                "unsupported-platform",
                                format!("当前平台不支持无覆盖保存，另存为已拒绝（请使用另存副本）: {e}"),
                            )
                        } else {
                            LosslessError::io(format!("创建新文件失败: {e}"))
                        }
                    })
                })?;
                if !created {
                    update_receipt(&op_id, |r| r.state = ReceiptState::Conflict)?;
                    return Ok(conflict_response(&op_id));
                }
            }
        }

        let new_identity = current_file_identity(&path, &payload);
        update_receipt(&op_id, |r| {
            r.state = ReceiptState::Written;
            r.new_file_identity = Some(new_identity.clone());
            // P1-1: the displaced original is retained as a recoverable copy
            // until the operation commits. For a replace, `tmp` holds it; for
            // a create the path never had a prior version so there is none.
            if receipt.expected_file_identity.is_some() {
                r.recovery_path = Some(tmp.to_string_lossy().to_string());
            }
        })?;
        // P1-1: the target directory entry itself (exchange/create) must be
        // durable — fsync the target's parent directory before acknowledging.
        fsync_parent_dir(&path).map_err(|e| LosslessError::io(format!("同步目标目录失败: {e}")))?;
        Ok(GuardedWriteResponse {
            save_operation_id: op_id.clone(),
            outcome: WriteOutcome::Written,
            new_file_identity: Some(new_identity),
            displaced_identity_matched: true,
            receipt_state: "written".into(),
        })
    })();

    match write_result {
        Ok(response) => Ok(response),
        Err(e) => {
            // The exchange may already have landed even though writing the
            // `Written` receipt failed. Preserve enough durable Conflict
            // metadata for startup recovery to expose the displaced bytes;
            // never leave an unaddressable temp copy behind.
            // Before exchange `tmp` contains the application's payload, not
            // a displaced original. Delete it rather than falsely exposing it
            // as recovery evidence. After exchange it holds the original and
            // must remain discoverable even if receipt persistence failed.
            if !replacement_completed {
                let _ = std::fs::remove_file(&tmp);
            }
            let recovery_path = replacement_completed
                .then(|| tmp.exists().then(|| tmp.to_string_lossy().to_string()))
                .flatten();
            let landed_identity = replacement_completed
                .then(|| {
                    std::fs::read(&path)
                        .ok()
                        .map(|bytes| current_file_identity(&path, &bytes))
                })
                .flatten();
            update_receipt(&op_id, |r| {
                r.state = ReceiptState::Conflict;
                if r.recovery_path.is_none() {
                    r.recovery_path = recovery_path.clone();
                }
                if r.new_file_identity.is_none() {
                    r.new_file_identity = landed_identity.clone();
                }
            })
            .ok();
            Err(e)
        }
    }
}

/// `reconcile_document_save` — classify an outcome-unknown write from the
/// durable receipt and current disk identity (design 04 §10).
#[tauri::command]
pub fn reconcile_document_save(
    save_operation_id: String,
    _state: State<AppState>,
) -> Result<ReconcileResponse, LosslessError> {
    validate_operation_id(&save_operation_id)?;
    let receipt_path = receipt_path_for(&save_operation_id);
    let Some(receipt) = read_receipt(&receipt_path)? else {
        return Err(LosslessError::new(
            "save-outcome-unknown",
            "找不到该 saveOperationId 的 durable receipt",
        ));
    };
    let path = PathBuf::from(&receipt.canonical_target_path);
    let response = |state: &str, new_file_identity: Option<FileIdentity>| ReconcileResponse {
        save_operation_id: save_operation_id.clone(),
        state: state.into(),
        new_file_identity,
        session_id: receipt.session_id,
        document_id: receipt.document_id,
        revision: receipt.revision,
    };

    match receipt.state {
        ReceiptState::Prepared => {
            // No write observed; if disk still matches the expected identity the
            // operation may be retried with the same id (NotWritten).
            match std::fs::read(&path) {
                Ok(disk) => {
                    let disk_identity = current_file_identity(&path, &disk);
                    if expected_identity_still_matches(&receipt, &disk_identity) {
                        Ok(response("not-written", None))
                    } else {
                        update_receipt(&save_operation_id, |r| r.state = ReceiptState::Conflict)?;
                        Ok(response("conflict", None))
                    }
                }
                Err(_) if receipt.expected_file_identity.is_none() => {
                    Ok(response("not-written", None))
                }
                Err(_) => {
                    update_receipt(&save_operation_id, |r| r.state = ReceiptState::Conflict)?;
                    Ok(response("conflict", None))
                }
            }
        }
        ReceiptState::Written => match std::fs::read(&path) {
            Ok(disk) => {
                if ContentHash::of(&disk).hex() == receipt.payload_sha256 {
                    // Disk holds the prepared payload → commit is safe.
                    let identity = current_file_identity(&path, &disk);
                    if receipt
                        .new_file_identity
                        .as_ref()
                        .is_some_and(|stored| target_identity_matches(stored, &identity))
                    {
                        Ok(response("written-and-commit-pending", Some(identity)))
                    } else {
                        update_receipt(&save_operation_id, |r| r.state = ReceiptState::Conflict)?;
                        Ok(response("conflict", None))
                    }
                } else {
                    update_receipt(&save_operation_id, |r| r.state = ReceiptState::Conflict)?;
                    Ok(response("conflict", None))
                }
            }
            Err(_) => {
                update_receipt(&save_operation_id, |r| r.state = ReceiptState::Conflict)?;
                Ok(response("conflict", None))
            }
        },
        ReceiptState::Committed => Ok(response("committed", receipt.new_file_identity)),
        ReceiptState::Conflict => Ok(response("conflict", None)),
    }
}

// ── Receipt persistence ────────────────────────────────────────────────

// The parameter list mirrors the durable receipt record verbatim; grouping it
// into a struct would only move the same fields around at every call site.
#[allow(clippy::too_many_arguments)]
pub fn record_prepared(
    save_operation_id: &str,
    path: &str,
    expected_file_identity: &Option<FileIdentity>,
    payload_sha256: &ContentHash,
    session_id: u64,
    document_id: u64,
    binding_generation: u64,
    revision: u64,
    save_epoch: u64,
) -> Result<(), LosslessError> {
    validate_operation_id(save_operation_id)?;
    let canonical_target_path = canonical_target_path(path)?;
    let receipt_path = receipt_path_for(save_operation_id);
    if let Some(existing) = read_receipt(&receipt_path)? {
        if existing.payload_sha256 != payload_sha256.hex()
            || existing.canonical_target_path != canonical_target_path
            || existing.expected_file_identity != *expected_file_identity
            || existing.session_id != session_id
            || existing.document_id != document_id
            || existing.binding_generation != binding_generation
            || existing.revision != revision
            || existing.save_epoch != save_epoch
        {
            return Err(LosslessError::new(
                "duplicate-mismatch",
                "同一 saveOperationId 已绑定不同保存身份，已拒绝",
            ));
        }
        return Ok(()); // idempotent prepare
    }
    let receipt = SaveReceipt {
        save_operation_id: save_operation_id.to_string(),
        session_id,
        document_id,
        binding_generation,
        save_epoch,
        revision,
        path: path.to_string(),
        path_hash: path_hash(&canonical_target_path),
        canonical_target_path,
        expected_file_identity: expected_file_identity.clone(),
        payload_sha256: payload_sha256.hex(),
        new_file_identity: None,
        recovery_path: None,
        state: ReceiptState::Prepared,
    };
    write_receipt_atomically(&receipt_path, &receipt)
}

fn update_receipt(
    save_operation_id: &str,
    f: impl FnOnce(&mut SaveReceipt),
) -> Result<(), LosslessError> {
    let receipt_path = receipt_path_for(save_operation_id);
    let mut receipt = read_receipt(&receipt_path)?
        .ok_or_else(|| LosslessError::new("operation-not-prepared", "receipt 缺失"))?;
    f(&mut receipt);
    write_receipt_atomically(&receipt_path, &receipt)
}

/// Advance a receipt to `Committed` after a successful commit. A missing
/// receipt, a mismatched identity, a Prepared (not-yet-written) receipt, or a
/// receipt from an older binding generation is an error (P1B corrective P0-1 /
/// P0-3).
pub fn mark_committed(
    save_operation_id: &str,
    session_id: u64,
    document_id: u64,
    binding_generation: u64,
    revision: u64,
    save_epoch: u64,
    new_file_identity: &FileIdentity,
) -> Result<(), LosslessError> {
    validate_operation_id(save_operation_id)?;
    let receipt_path = receipt_path_for(save_operation_id);
    let receipt = read_receipt(&receipt_path)?.ok_or_else(|| {
        LosslessError::new("operation-not-prepared", "commit 对应的 receipt 缺失")
    })?;
    if receipt.session_id != session_id
        || receipt.document_id != document_id
        || receipt.binding_generation != binding_generation
        || receipt.revision != revision
        || receipt.save_epoch != save_epoch
    {
        return Err(LosslessError::new(
            "wrong-identity",
            "commit 身份与 durable receipt 不匹配",
        ));
    }
    match receipt.state {
        ReceiptState::Written | ReceiptState::Committed => {
            if !receipt
                .new_file_identity
                .as_ref()
                .is_some_and(|stored| target_identity_matches(stored, new_file_identity))
            {
                return Err(LosslessError::new(
                    "wrong-identity",
                    "commit 身份与 durable receipt 不匹配",
                ));
            }
            let recovery = receipt.recovery_path.clone();
            update_receipt(save_operation_id, |r| {
                r.state = ReceiptState::Committed;
                r.recovery_path = None;
            })?;
            // P1-1: the displaced recovery copy is only finalized AFTER the
            // Committed receipt is durable. A crash before this point always
            // leaves the recovery discoverable from the Written receipt.
            if let Some(path) = recovery {
                let _ = std::fs::remove_file(path);
            }
            Ok(())
        }
        ReceiptState::Prepared => Err(LosslessError::new(
            "save-outcome-unknown",
            "尚未确认写盘，不能 commit persisted revision",
        )),
        ReceiptState::Conflict => Err(LosslessError::new(
            "external-conflict",
            "冲突 receipt 不能 commit persisted revision",
        )),
    }
}

/// Refuse a new open/prepare/write for a target that has an unresolved durable
/// outcome. `Prepared` is reconciled synchronously: if it can be proven not to
/// have written, it is safe to proceed; `Written` needs the original session's
/// commit and `Conflict` needs an explicit user decision, so both remain gated.
pub fn ensure_target_reconciled(
    path: &str,
    allowed_operation_id: Option<&str>,
) -> Result<(), LosslessError> {
    // A receipt written by an older/incomplete schema cannot prove its target
    // or revision binding. Never silently ignore it and resume autosave.
    if receipt_store_has_corruption() {
        return Err(LosslessError::new(
            "save-outcome-unknown",
            "发现无法验证的 durable receipt，已阻止自动保存直到人工恢复",
        ));
    }
    let canonical = canonical_target_path(path)?;
    for receipt in scan_unfinished_receipts().into_values() {
        if receipt.canonical_target_path != canonical
            || allowed_operation_id.is_some_and(|id| id == receipt.save_operation_id)
        {
            continue;
        }
        let target = PathBuf::from(&receipt.canonical_target_path);
        match receipt.state {
            ReceiptState::Prepared => {
                let safe_not_written = match std::fs::read(&target) {
                    Ok(bytes) => expected_identity_still_matches(
                        &receipt,
                        &current_file_identity(&target, &bytes),
                    ),
                    Err(_) => receipt.expected_file_identity.is_none(),
                };
                if safe_not_written {
                    continue;
                }
                update_receipt(&receipt.save_operation_id, |r| {
                    r.state = ReceiptState::Conflict
                })?;
                return Err(LosslessError::new(
                    "external-conflict",
                    "启动时发现无法证明未写入的保存操作，已阻止该文件写入",
                ));
            }
            ReceiptState::Written => {
                return Err(LosslessError::new(
                    "save-outcome-unknown",
                    "启动时发现已写入但未提交的保存操作，完成 reconcile 前已阻止该文件写入",
                ));
            }
            ReceiptState::Conflict => {
                return Err(LosslessError::new(
                    "external-conflict",
                    "该文件存在未解决的保存冲突，已阻止自动保存",
                ));
            }
            ReceiptState::Committed => {}
        }
    }
    Ok(())
}

/// Load the epoch that the durable receipt froze at prepare time. Commit must
/// resume this exact capability rather than sampling the registry epoch after
/// a reload has already begun.
pub fn receipt_save_epoch(
    save_operation_id: &str,
    session_id: u64,
    document_id: u64,
    binding_generation: u64,
    revision: u64,
) -> Result<u64, LosslessError> {
    validate_operation_id(save_operation_id)?;
    let receipt = read_receipt(&receipt_path_for(save_operation_id))?.ok_or_else(|| {
        LosslessError::new("operation-not-prepared", "commit 对应的 receipt 缺失")
    })?;
    if receipt.session_id != session_id
        || receipt.document_id != document_id
        || receipt.binding_generation != binding_generation
        || receipt.revision != revision
    {
        return Err(LosslessError::wrong_identity(
            "commit 身份与 durable receipt 不匹配",
        ));
    }
    Ok(receipt.save_epoch)
}

/// Startup classification is intentionally side-effect-light: it proves and
/// reports Prepared receipts, while Written/Conflict receipts remain durable
/// path gates until their owning session is reconciled or the user resolves the
/// conflict. The same check is repeated at open/prepare/write, so a process
/// restart cannot bypass it.
pub fn reconcile_startup_receipts() -> HashMap<String, String> {
    let mut results = HashMap::new();
    for receipt in scan_unfinished_receipts().into_values() {
        let result = classify_startup_receipt(&receipt).unwrap_or_else(|error| error.code);
        results.insert(receipt.save_operation_id, result);
    }
    results
}

pub fn receipt_store_has_corruption() -> bool {
    !invalid_receipt_entries().is_empty()
}

fn classify_startup_receipt(receipt: &SaveReceipt) -> Result<String, LosslessError> {
    let target = PathBuf::from(&receipt.canonical_target_path);
    match receipt.state {
        ReceiptState::Prepared => {
            let not_written = match std::fs::read(&target) {
                Ok(bytes) => expected_identity_still_matches(
                    receipt,
                    &current_file_identity(&target, &bytes),
                ),
                Err(_) => receipt.expected_file_identity.is_none(),
            };
            if not_written {
                Ok("not-written".to_owned())
            } else {
                update_receipt(&receipt.save_operation_id, |r| {
                    r.state = ReceiptState::Conflict
                })?;
                Ok("conflict".to_owned())
            }
        }
        ReceiptState::Written => match std::fs::read(&target) {
            Ok(bytes)
                if ContentHash::of(&bytes).hex() == receipt.payload_sha256
                    && receipt.new_file_identity.as_ref().is_some_and(|identity| {
                        target_identity_matches(identity, &current_file_identity(&target, &bytes))
                    }) =>
            {
                Ok("written-and-commit-pending".to_owned())
            }
            _ => {
                update_receipt(&receipt.save_operation_id, |r| {
                    r.state = ReceiptState::Conflict
                })?;
                Ok("conflict".to_owned())
            }
        },
        ReceiptState::Conflict => Ok("conflict".to_owned()),
        ReceiptState::Committed => Ok("committed".to_owned()),
    }
}

fn validate_write_request_against_receipt(
    req: &GuardedWriteRequest,
    receipt: &SaveReceipt,
    payload_hash: &ContentHash,
) -> Result<(), LosslessError> {
    let canonical = canonical_target_path(&req.path)?;
    if receipt.payload_sha256 != payload_hash.hex() {
        return Err(LosslessError::new(
            "duplicate-mismatch",
            "同一 saveOperationId 携带不同 payload，已拒绝",
        ));
    }
    if receipt.save_operation_id != req.save_operation_id
        || receipt.canonical_target_path != canonical
        || receipt.path_hash != path_hash(&canonical)
        || receipt.expected_file_identity != req.expected_file_identity
        || receipt.session_id == 0
        || receipt.document_id == 0
    {
        return Err(LosslessError::new(
            "wrong-identity",
            "guarded write 请求与 prepared receipt 不匹配",
        ));
    }
    Ok(())
}

/// P1B corrective P0-3: a write is only valid for the exact document image that
/// prepared it. If the owning session was reloaded (binding generation
/// advanced) or closed since prepare, the write is refused so a discarded
/// generation's payload can never reach disk. A missing session means the
/// document was closed — also refuse.
fn expected_identity_still_matches(receipt: &SaveReceipt, actual: &FileIdentity) -> bool {
    receipt
        .expected_file_identity
        .as_ref()
        .is_some_and(|expected| target_identity_matches(expected, actual))
}

fn target_identity_matches(expected: &FileIdentity, actual: &FileIdentity) -> bool {
    expected.canonical_path == actual.canonical_path && identity_matches(expected, actual)
}

fn validate_operation_id(operation_id: &str) -> Result<(), LosslessError> {
    let bytes = operation_id.as_bytes();
    let is_uuid = bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, byte)| match i {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        });
    if is_uuid {
        Ok(())
    } else {
        Err(LosslessError::new(
            "invalid-operation-id",
            "saveOperationId 必须是 UUID，拒绝不安全的路径片段",
        ))
    }
}

fn canonical_target_path(path: &str) -> Result<String, LosslessError> {
    let target = PathBuf::from(path);
    let absolute = if target.is_absolute() {
        target
    } else {
        std::env::current_dir()
            .map_err(|e| LosslessError::io(format!("读取当前目录失败: {e}")))?
            .join(target)
    };
    if let Ok(canonical) = absolute.canonicalize() {
        return Ok(canonical.to_string_lossy().to_string());
    }
    let parent = absolute
        .parent()
        .ok_or_else(|| LosslessError::new("io", "无法确定父目录"))?;
    let file_name = absolute
        .file_name()
        .ok_or_else(|| LosslessError::new("io", "保存路径缺少文件名"))?;
    if let Ok(canonical_parent) = parent.canonicalize() {
        return Ok(canonical_parent
            .join(file_name)
            .to_string_lossy()
            .to_string());
    }
    Ok(absolute.to_string_lossy().to_string())
}

pub fn receipts_dir() -> PathBuf {
    // Thread-local test override: each `cargo test` thread isolates its own
    // receipts dir, so parallel tests never race a shared override (and never
    // write to the developer's real app config dir).
    if let Some(dir) = RECEIPTS_DIR_OVERRIDE.with(|c| c.borrow().clone()) {
        return dir;
    }
    app_config_dir().join(RECEIPTS_DIR_NAME)
}

/// Test-only override (thread-local) so `cargo test` never writes receipts to
/// the developer's real app config directory (a P1A reviewer P2 finding).
#[cfg(test)]
pub fn set_receipts_dir_override(dir: Option<PathBuf>) {
    RECEIPTS_DIR_OVERRIDE.with(|c| *c.borrow_mut() = dir);
}

thread_local! {
    static RECEIPTS_DIR_OVERRIDE: std::cell::RefCell<Option<PathBuf>> =
        const { std::cell::RefCell::new(None) };
    /// Test-only: fail the NEXT durable receipt write (P1B corrective P1-1
    /// crash/durability injection).
    static INJECT_RECEIPT_WRITE_FAILURE: std::cell::RefCell<bool> =
        const { std::cell::RefCell::new(false) };
}

/// Test-only hook: the next `write_receipt_atomically` call fails, simulating
/// a receipt persistence failure or crash right after the atomic target swap.
#[cfg(test)]
pub fn inject_receipt_write_failure_once() {
    INJECT_RECEIPT_WRITE_FAILURE.with(|c| *c.borrow_mut() = true);
}

fn receipt_write_failure_injected() -> bool {
    INJECT_RECEIPT_WRITE_FAILURE.with(|c| {
        let mut flag = c.borrow_mut();
        let fired = *flag;
        *flag = false;
        fired
    })
}

pub(crate) fn receipt_path_for(save_operation_id: &str) -> PathBuf {
    // Even if a caller somehow bypasses validation, the filesystem name is a
    // fixed SHA-256 hex digest and can never escape the receipts directory.
    receipts_dir().join(format!("{}.json", path_hash(save_operation_id)))
}

fn read_receipt(path: &Path) -> Result<Option<SaveReceipt>, LosslessError> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|e| LosslessError::io(e.to_string()))?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| LosslessError::new("io", format!("receipt 损坏: {e}")))
}

/// Atomically write a receipt (temp + fsync + rename + parent-dir fsync).
///
/// The parent-directory fsync makes the rename durable: without it a power
/// loss could reorder the directory entry and lose the receipt name even
/// though the file bytes were fsynced (P1B corrective P1-1).
fn write_receipt_atomically(path: &Path, receipt: &SaveReceipt) -> Result<(), LosslessError> {
    // P1B corrective P1-1: test-only crash/durability injection.
    if receipt_write_failure_injected() {
        return Err(LosslessError::io(
            "injected receipt write failure (crash after target swap)",
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| LosslessError::new("io", "无法确定 receipt 目录"))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| LosslessError::io(format!("创建 receipt 目录失败: {e}")))?;
    let tmp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        std::process::id()
    ));
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)
            .map_err(|e| LosslessError::io(format!("创建 receipt 临时文件失败: {e}")))?;
        let json = serde_json::to_vec(receipt).map_err(|e| {
            LosslessError::new("internal-invariant", format!("序列化 receipt 失败: {e}"))
        })?;
        f.write_all(&json)
            .map_err(|e| LosslessError::io(format!("写入 receipt 失败: {e}")))?;
        f.sync_all()
            .map_err(|e| LosslessError::io(format!("同步 receipt 失败: {e}")))?;
    }
    std::fs::rename(&tmp, path)
        .map_err(|e| LosslessError::io(format!("提交 receipt 失败: {e}")))?;
    fsync_parent_dir(path).map_err(|e| LosslessError::io(format!("同步 receipt 目录失败: {e}")))?;
    Ok(())
}

/// Fsync a file's parent directory so the directory entry (a rename or create)
/// is durable. On Unix this opens the directory and calls fsync; on Windows the
/// NTFS journal provides directory-entry durability for MoveFileEx without an
/// explicit directory fsync, so the operation is a no-op there.
fn fsync_parent_dir(path: &Path) -> std::io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "路径缺少父目录"))?;
    #[cfg(unix)]
    {
        std::fs::File::open(parent)?.sync_all()
    }
    #[cfg(not(unix))]
    {
        let _ = parent;
        Ok(())
    }
}

/// Scan unfinished receipts on startup. Returns the set of paths that have a
/// `Prepared`/`Written`/`Conflict` receipt; callers must reconcile these before
/// autosaving the related path.
pub fn scan_unfinished_receipts() -> HashMap<String, SaveReceipt> {
    let dir = receipts_dir();
    let mut unfinished = HashMap::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return unfinished;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") {
            continue;
        }
        if let Ok(Some(receipt)) = read_receipt(&entry.path()) {
            match receipt.state {
                ReceiptState::Committed => {}
                _ => {
                    unfinished.insert(receipt.save_operation_id.clone(), receipt);
                }
            }
        }
    }
    unfinished
}

// ── Helpers ────────────────────────────────────────────────────────────

fn decode_base64(s: &str) -> Result<Vec<u8>, LosslessError> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| LosslessError::new("invalid-encoding", format!("payload base64 无效: {e}")))
}

pub fn current_file_identity(path: &Path, bytes: &[u8]) -> FileIdentity {
    let metadata = std::fs::metadata(path).ok();
    let mtime = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    let size = metadata.map(|m| m.len()).unwrap_or(bytes.len() as u64);
    FileIdentity {
        canonical_path: path.canonicalize().ok(),
        size,
        mtime,
        content_hash: ContentHash::of(bytes),
    }
}

fn path_hash(path: &str) -> String {
    ContentHash::of(path.as_bytes()).hex()
}

/// Compare two identities for "same file at the expected revision". Size/mtime
/// fast-path first; content hash decides when size or mtime are missing or
/// differ (design 04 §4). mtime may change across a write, so the content hash
/// is authoritative for displaced-identity verification.
fn identity_matches(expected: &FileIdentity, actual: &FileIdentity) -> bool {
    if expected.size == actual.size
        && expected.mtime == actual.mtime
        && expected.content_hash == actual.content_hash
    {
        return true;
    }
    // Content hash is authoritative; size must agree.
    expected.size == actual.size && expected.content_hash == actual.content_hash
}

fn conflict_response(save_operation_id: &str) -> GuardedWriteResponse {
    GuardedWriteResponse {
        save_operation_id: save_operation_id.to_string(),
        outcome: WriteOutcome::Conflict,
        new_file_identity: None,
        displaced_identity_matched: false,
        receipt_state: "conflict".into(),
    }
}

#[cfg(target_os = "macos")]
fn atomic_exchange(tmp: &Path, target: &Path) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let tmp_c = CString::new(tmp.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "tmp path"))?;
    let target_c = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "target path"))?;
    // AT_FDCWD for the current directory.
    let rc = unsafe {
        libc::renameatx_np(
            libc::AT_FDCWD,
            tmp_c.as_ptr(),
            libc::AT_FDCWD,
            target_c.as_ptr(),
            libc::RENAME_SWAP,
        )
    };
    if rc == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn create_if_absent(tmp: &Path, target: &Path) -> std::io::Result<bool> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let tmp_c = CString::new(tmp.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "tmp path"))?;
    let target_c = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "target path"))?;
    let rc = unsafe {
        libc::renameatx_np(
            libc::AT_FDCWD,
            tmp_c.as_ptr(),
            libc::AT_FDCWD,
            target_c.as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    if rc == 0 {
        Ok(true)
    } else {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() == Some(libc::EEXIST) {
            Ok(false) // target appeared → conflict
        } else {
            Err(err)
        }
    }
}

/// Linux: `renameat2(RENAME_EXCHANGE)` swaps the two paths atomically, leaving
/// the displaced target readable at `tmp` — the same post-condition as macOS
/// `RENAME_SWAP`. A filesystem without exchange support (overlayfs, some
/// FUSE/network filesystems) reports `ENOSYS`/`EINVAL`/`EOPNOTSUPP`; that is
/// reported as `Unsupported` so the caller refuses the replace. Plain
/// `rename(2)` is never used as a fallback: it would silently overwrite a
/// target replaced at the swap instant.
#[cfg(target_os = "linux")]
fn atomic_exchange(tmp: &Path, target: &Path) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let tmp_c = CString::new(tmp.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "tmp path"))?;
    let target_c = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "target path"))?;
    let rc = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            tmp_c.as_ptr(),
            libc::AT_FDCWD,
            target_c.as_ptr(),
            libc::RENAME_EXCHANGE as libc::c_uint,
        )
    };
    if rc == 0 {
        Ok(())
    } else {
        let err = std::io::Error::last_os_error();
        match err.raw_os_error() {
            Some(libc::ENOSYS) | Some(libc::EINVAL) | Some(libc::EOPNOTSUPP) => {
                Err(std::io::Error::new(
                    std::io::ErrorKind::Unsupported,
                    "filesystem does not support RENAME_EXCHANGE; guarded replace refused",
                ))
            }
            _ => Err(err),
        }
    }
}

/// Windows: `ReplaceFileW` moves the replacement (`tmp`) onto the replaced file
/// (`target`) and stages the displaced original at a backup path. Unlike the
/// two exchange syscalls it *consumes* `tmp`, so the backup is renamed back
/// onto `tmp` to restore the shared post-condition ("the displaced bytes are
/// readable at `tmp`"). Both the replace and that same-directory rename are
/// single metadata operations: there is no instant where the target is
/// truncated or partially overwritten. A crash between them leaves the
/// displaced original at the `.mf-bak` sibling rather than losing it.
#[cfg(target_os = "windows")]
fn atomic_exchange(tmp: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn ReplaceFileW(
            lp_replaced_file_name: *const u16,
            lp_replacement_file_name: *const u16,
            lp_backup_file_name: *const u16,
            dw_replace_flags: u32,
            lp_exclude: *const std::ffi::c_void,
            lp_reserved: *const std::ffi::c_void,
        ) -> i32;
    }

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    // No flags: `REPLACEFILE_WRITE_THROUGH` is documented as unsupported and
    // the merge-error flags would hide ACL/attribute failures we want surfaced.
    const REPLACEFILE_NONE: u32 = 0x0000_0000;
    // ERROR_INVALID_FUNCTION (1) / ERROR_NOT_SUPPORTED (50): no
    // backup-preserving replace on this volume.
    const ERROR_INVALID_FUNCTION: i32 = 1;
    const ERROR_NOT_SUPPORTED: i32 = 50;

    let mut backup_os = tmp.as_os_str().to_owned();
    backup_os.push(".mf-bak");
    let backup = PathBuf::from(backup_os);

    let replaced = wide(target);
    let replacement = wide(tmp);
    let backup_w = wide(&backup);
    let rc = unsafe {
        ReplaceFileW(
            replaced.as_ptr(),
            replacement.as_ptr(),
            backup_w.as_ptr(),
            REPLACEFILE_NONE,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    if rc == 0 {
        let err = std::io::Error::last_os_error();
        return Err(match err.raw_os_error() {
            Some(ERROR_INVALID_FUNCTION) | Some(ERROR_NOT_SUPPORTED) => std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                "ReplaceFileW unsupported on this volume; guarded replace refused",
            ),
            _ => err,
        });
    }
    // `tmp` was consumed by the replace; restore the displaced original onto it
    // so the caller's `read(tmp)` — and the receipt's recovery path — see the
    // same bytes macOS/Linux leave there.
    std::fs::rename(&backup, tmp)?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn atomic_exchange(_tmp: &Path, _target: &Path) -> std::io::Result<()> {
    // No atomic-exchange primitive proven on this platform: refuse rather than
    // degrade to plain rename(2), which would silently overwrite a target
    // replaced at the swap instant.
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "no atomic-exchange primitive on this platform; default replace refused",
    ))
}

#[cfg(target_os = "linux")]
fn create_if_absent(tmp: &Path, target: &Path) -> std::io::Result<bool> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let tmp_c = CString::new(tmp.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "tmp path"))?;
    let target_c = CString::new(target.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "target path"))?;
    // renameat2(RENAME_NOREPLACE) fails with EEXIST when the destination
    // exists at the replace instant. Plain rename(2) would silently REPLACE an
    // externally-created target (P1B corrective P0-2), so it is never used.
    let rc = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            tmp_c.as_ptr(),
            libc::AT_FDCWD,
            target_c.as_ptr(),
            libc::RENAME_NOREPLACE as libc::c_uint,
        )
    };
    if rc == 0 {
        Ok(true)
    } else {
        let err = std::io::Error::last_os_error();
        match err.raw_os_error() {
            Some(libc::EEXIST) => Ok(false), // target appeared → conflict
            // Kernel/filesystem without RENAME_NOREPLACE support: refuse rather
            // than silently degrade to overwrite-rename. The caller reports the
            // unsupported platform and Save As falls back to Save Copy.
            Some(libc::ENOSYS) | Some(libc::EINVAL) => Err(std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                "filesystem does not support RENAME_NOREPLACE; no-replace save refused",
            )),
            _ => Err(err),
        }
    }
}

#[cfg(target_os = "windows")]
fn create_if_absent(tmp: &Path, target: &Path) -> std::io::Result<bool> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(
            lp_existing_file_name: *const u16,
            lp_new_file_name: *const u16,
            dw_flags: u32,
        ) -> i32;
    }
    // MOVEFILE_WRITE_THROUGH alone: WITHOUT MOVEFILE_REPLACE_EXISTING the move
    // fails when the destination exists (ERROR_ALREADY_EXISTS / ERROR_FILE_EXISTS),
    // which is the no-replace semantic required for Save As.
    const MOVEFILE_WRITE_THROUGH: u32 = 0x0000_0008;
    let from: Vec<u16> = tmp
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let to: Vec<u16> = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let rc = unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) };
    if rc != 0 {
        Ok(true)
    } else {
        let err = std::io::Error::last_os_error();
        match err.raw_os_error() {
            // ERROR_FILE_EXISTS (80) / ERROR_ALREADY_EXISTS (183): target appeared.
            Some(80) | Some(183) => Ok(false),
            _ => Err(err),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn create_if_absent(_tmp: &Path, _target: &Path) -> std::io::Result<bool> {
    // No create-if-absent/no-replace primitive proven on this platform: refuse
    // rather than use plain rename(2), which would silently overwrite a target
    // created at the replace instant. Save As degrades to Save Copy.
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "no no-replace rename primitive on this platform; Save As refused",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use markflow_core::ContentHash;

    fn temp_receipts_dir() -> PathBuf {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static C: AtomicUsize = AtomicUsize::new(0);
        let n = C.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("markflow_rec_{}_{}", std::process::id(), n))
    }

    fn isolate_receipts() -> PathBuf {
        let dir = temp_receipts_dir();
        set_receipts_dir_override(Some(dir.clone()));
        dir
    }

    fn operation_id(n: u8) -> String {
        format!("00000000-0000-4000-8000-{:012x}", n)
    }

    #[test]
    fn record_prepared_is_idempotent_and_rejects_different_payload() {
        let _dir = isolate_receipts();
        let path = "/tmp/doc.md";
        let identity = FileIdentity::from_bytes(b"original");
        let hash = ContentHash::of(b"payload");
        // Direct receipt write under the real config dir is isolated per run id.
        let op = operation_id(1);
        record_prepared(&op, path, &Some(identity.clone()), &hash, 1, 2, 0, 3, 0).unwrap();
        // Same op + same payload → idempotent.
        record_prepared(&op, path, &Some(identity.clone()), &hash, 1, 2, 0, 3, 0).unwrap();
        // Same op + different payload → rejected.
        let err = record_prepared(
            &op,
            path,
            &Some(identity),
            &ContentHash::of(b"other"),
            1,
            2,
            0,
            3,
            0,
        )
        .unwrap_err();
        assert_eq!(err.code, "duplicate-mismatch");
        // Cleanup: the receipt lives under the real config receipts dir.
        let _ = std::fs::remove_file(receipt_path_for(&op));
    }

    #[test]
    fn scan_unfinished_receipts_finds_non_committed() {
        let _dir = isolate_receipts();
        let op_prepared = operation_id(2);
        let op_committed = operation_id(3);
        let identity = FileIdentity::from_bytes(b"x");
        record_prepared(
            &op_prepared,
            "/tmp/a.md",
            &Some(identity.clone()),
            &ContentHash::of(b"a"),
            1,
            2,
            0,
            3,
            0,
        )
        .unwrap();
        record_prepared(
            &op_committed,
            "/tmp/b.md",
            &Some(identity.clone()),
            &ContentHash::of(b"b"),
            4,
            5,
            0,
            6,
            0,
        )
        .unwrap();
        // Mark one committed so scan excludes it.
        update_receipt(&op_committed, |r| r.state = ReceiptState::Committed).unwrap();

        let unfinished = scan_unfinished_receipts();
        assert!(unfinished.contains_key(&op_prepared));
        assert!(!unfinished.contains_key(&op_committed));

        let _ = std::fs::remove_file(receipt_path_for(&op_prepared));
        let _ = std::fs::remove_file(receipt_path_for(&op_committed));
    }

    #[test]
    fn startup_reconcile_classifies_prepared_written_and_conflict_receipts() {
        let receipts = isolate_receipts();
        let target_dir = receipts.join("targets");
        std::fs::create_dir_all(&target_dir).unwrap();

        let prepared_target = target_dir.join("prepared.md");
        std::fs::write(&prepared_target, b"original").unwrap();
        let prepared_identity = current_file_identity(&prepared_target, b"original");
        let prepared_op = operation_id(21);
        record_prepared(
            &prepared_op,
            &prepared_target.to_string_lossy(),
            &Some(prepared_identity),
            &ContentHash::of(b"next"),
            1,
            2,
            0,
            3,
            0,
        )
        .unwrap();

        let written_target = target_dir.join("written.md");
        std::fs::write(&written_target, b"written").unwrap();
        let written_identity = current_file_identity(&written_target, b"written");
        let written_op = operation_id(22);
        record_prepared(
            &written_op,
            &written_target.to_string_lossy(),
            &None,
            &ContentHash::of(b"written"),
            4,
            5,
            0,
            6,
            0,
        )
        .unwrap();
        update_receipt(&written_op, |receipt| {
            receipt.state = ReceiptState::Written;
            receipt.new_file_identity = Some(written_identity);
        })
        .unwrap();

        let conflict_target = target_dir.join("conflict.md");
        std::fs::write(&conflict_target, b"external").unwrap();
        let conflict_op = operation_id(23);
        record_prepared(
            &conflict_op,
            &conflict_target.to_string_lossy(),
            &None,
            &ContentHash::of(b"payload"),
            7,
            8,
            0,
            9,
            0,
        )
        .unwrap();
        update_receipt(&conflict_op, |receipt| {
            receipt.state = ReceiptState::Conflict
        })
        .unwrap();

        let results = reconcile_startup_receipts();
        assert_eq!(
            results.get(&prepared_op).map(String::as_str),
            Some("not-written")
        );
        assert_eq!(
            results.get(&written_op).map(String::as_str),
            Some("written-and-commit-pending")
        );
        assert_eq!(
            results.get(&conflict_op).map(String::as_str),
            Some("conflict")
        );
    }

    #[test]
    fn unreadable_receipt_blocks_save_instead_of_being_silently_ignored() {
        let receipts = isolate_receipts();
        std::fs::create_dir_all(&receipts).unwrap();
        std::fs::write(receipts.join("legacy-or-corrupt.json"), b"not a receipt").unwrap();
        assert!(receipt_store_has_corruption());
        let error = ensure_target_reconciled("/tmp/any.md", None).unwrap_err();
        assert_eq!(error.code, "save-outcome-unknown");
    }

    #[test]
    fn create_if_absent_refuses_an_existing_target_on_this_platform() {
        // P0-2: the platform no-replace primitive must NEVER overwrite a target
        // that exists at the replace instant. This runs on the host OS and
        // exercises the cfg-gated primitive (macOS RENAME_EXCL here; Linux
        // renameat2(RENAME_NOREPLACE) / Windows MoveFileExW on those hosts).
        let dir = isolate_receipts();
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("existing.md");
        let tmp = dir.join("tmp-new.md");
        std::fs::write(&target, b"external bytes that must survive").unwrap();
        std::fs::write(&tmp, b"app payload").unwrap();

        let result = create_if_absent(&tmp, &target).expect("no-replace primitive must run");
        assert!(
            !result,
            "create-if-absent must report the target exists (conflict), never replace it"
        );
        // The external target is byte-identical; the app payload stays in tmp.
        assert_eq!(
            std::fs::read(&target).unwrap(),
            b"external bytes that must survive"
        );
        assert_eq!(std::fs::read(&tmp).unwrap(), b"app payload");
        std::fs::remove_file(&target).ok();
        std::fs::remove_file(&tmp).ok();
    }

    /// The replace branch reads the displaced bytes back from `tmp` after the
    /// exchange, so every platform primitive must leave them there. This runs
    /// the host's primitive: macOS `renameatx_np(RENAME_SWAP)`, Linux
    /// `renameat2(RENAME_EXCHANGE)`, Windows `ReplaceFileW`. Only one branch can
    /// compile on a given host, so the other two are covered when their CI runs
    /// this same test.
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn atomic_exchange_leaves_displaced_bytes_at_tmp_on_this_platform() {
        let dir = isolate_receipts();
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("exchange.md");
        let tmp = dir.join("exchange-tmp.md");
        std::fs::write(&target, b"displaced original").unwrap();
        std::fs::write(&tmp, b"new payload").unwrap();

        atomic_exchange(&tmp, &target).expect("atomic exchange must run on this platform");

        assert_eq!(
            std::fs::read(&target).unwrap(),
            b"new payload",
            "the target must hold the new payload"
        );
        assert_eq!(
            std::fs::read(&tmp).unwrap(),
            b"displaced original",
            "the displaced target must be readable at the tmp path"
        );
        std::fs::remove_file(&target).ok();
        std::fs::remove_file(&tmp).ok();
    }

    /// The exchange must never create a missing target: a target that vanished
    /// between the precheck and the replace point is an external race, not
    /// something to write into.
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn atomic_exchange_refuses_an_absent_target_on_this_platform() {
        let dir = isolate_receipts();
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("vanished.md");
        let tmp = dir.join("vanished-tmp.md");
        std::fs::write(&tmp, b"new payload").unwrap();

        let error = atomic_exchange(&tmp, &target)
            .expect_err("exchanging onto a missing target must fail, not create it");
        assert_ne!(
            error.kind(),
            std::io::ErrorKind::Unsupported,
            "a missing target is an external race, not an unsupported platform"
        );
        assert!(!target.exists(), "the exchange must not create the target");
        assert_eq!(
            std::fs::read(&tmp).unwrap(),
            b"new payload",
            "the payload must stay at tmp"
        );
        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn create_if_absent_moves_an_absent_target_on_this_platform() {
        let dir = isolate_receipts();
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("absent.md");
        let tmp = dir.join("tmp-absent.md");
        std::fs::write(&tmp, b"app payload").unwrap();

        let result = create_if_absent(&tmp, &target).expect("no-replace primitive must run");
        assert!(result, "absent target must be creatable");
        assert_eq!(std::fs::read(&target).unwrap(), b"app payload");
        std::fs::remove_file(&target).ok();
    }
}
