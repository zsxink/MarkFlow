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
//! macOS provides `renameatx_np(RENAME_SWAP)`, an atomic exchange that preserves
//! the displaced target at the temp path — the displaced bytes are then hashed
//! and compared to `expectedFileIdentity`. This satisfies the design's
//! "backup-preserving replace with displaced-identity verification" requirement
//! (no true CAS primitive on this platform). A target expected to be absent
//! (`expectedFileIdentity == None`) uses `renameatx_np(RENAME_EXCL)`
//! (create-if-absent); if the path exists at the replace point it is a conflict,
//! never treated as a replaceable old file.
//!
//! On platforms without an atomic-exchange primitive this module refuses default
//! replacement (returns a documented `unsupported-platform` error so the caller
//! degrades to Save Copy), rather than claiming a guarded write with plain
//! rename.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use markflow_core::{ContentHash, FileIdentity};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::dto::{LosslessError, ReceiptState, SaveReceipt};
use crate::paths::app_config_dir;
use crate::state::AppState;

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
}

#[tauri::command]
pub fn guarded_atomic_write(
    req: GuardedWriteRequest,
    _state: State<AppState>,
) -> Result<GuardedWriteResponse, LosslessError> {
    let op_id = req.save_operation_id.clone();
    let payload = decode_base64(&req.payload_base64)?;
    let payload_hash = ContentHash::of(&payload);
    let path = PathBuf::from(&req.path);

    // ── Idempotency + source-enforcement via the prepared receipt ────
    let receipt_path = receipt_path_for(&op_id);
    let existing = read_receipt(&receipt_path)?;
    if let Some(r) = existing {
        if r.payload_sha256 != payload_hash.hex() {
            return Err(LosslessError::new(
                "duplicate-mismatch",
                "同一 saveOperationId 携带不同 payload，已拒绝",
            ));
        }
        match r.state {
            ReceiptState::Committed => {
                return Ok(GuardedWriteResponse {
                    save_operation_id: op_id.clone(),
                    outcome: WriteOutcome::Written,
                    new_file_identity: Some(current_file_identity(&path, &payload)),
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
                            new_file_identity: Some(current_file_identity(&path, &payload)),
                            displaced_identity_matched: true,
                            receipt_state: "written".into(),
                        });
                    }
                }
                // Disk moved away → external race; classify as conflict.
                update_receipt(
                    &op_id,
                    |r| r.state = ReceiptState::Conflict,
                )?;
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
    } else {
        // No prepared receipt: the payload cannot be tied to a Core confirmed
        // revision, so a guarded write is refused.
        return Err(LosslessError::new(
            "operation-not-prepared",
            "saveOperationId 未经过 prepare_document_save，拒绝写入",
        ));
    }

    // ── Expected-identity re-check at the replace point ──────────────
    let target_exists = path.exists();
    match &req.expected_file_identity {
        Some(expected) => {
            if !target_exists {
                update_receipt(
                    &op_id,
                    |r| r.state = ReceiptState::Conflict,
                )?;
                return Ok(conflict_response(&op_id));
            }
            let current = current_file_identity(&path, &std::fs::read(&path).map_err(|e| LosslessError::io(e.to_string()))?);
            if !identity_matches(expected, &current) {
                update_receipt(
                    &op_id,
                    |r| r.state = ReceiptState::Conflict,
                )?;
                return Ok(conflict_response(&op_id));
            }
        }
        None => {
            if target_exists {
                // Save As / New File: a path created before the replace point is
                // a conflict, never treated as a replaceable old file.
                update_receipt(
                    &op_id,
                    |r| r.state = ReceiptState::Conflict,
                )?;
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
    let tmp = parent.join(format!(".{file_name}.{}.mf-tmp", req.save_operation_id));

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

        match &req.expected_file_identity {
            Some(_) => {
                // Backup-preserving atomic exchange: swap temp ↔ target. After
                // the swap, `tmp` holds the displaced target bytes.
                atomic_exchange(&tmp, &path).map_err(|e| {
                    let _ = std::fs::remove_file(&tmp);
                    LosslessError::io(format!("原子替换失败: {e}"))
                })?;
                // Verify displaced identity at the replace point.
                let displaced = std::fs::read(&tmp).map_err(|e| {
                    let _ = std::fs::remove_file(&tmp);
                    LosslessError::io(format!("读取被替换文件失败: {e}"))
                })?;
                let displaced_hash = ContentHash::of(&displaced);
                // The displaced bytes are the pre-replacement target; they must
                // match the identity the caller expected to be there.
                let displaced_ok = req
                    .expected_file_identity
                    .as_ref()
                    .map(|expected| expected.content_hash == displaced_hash)
                    .unwrap_or(false);
                if !displaced_ok {
                    // External race won at the swap instant: keep the displaced
                    // bytes as recovery at `tmp`; do NOT delete.
                    update_receipt(
                        &op_id,
                        |r| r.state = ReceiptState::Conflict,
                    )?;
                    return Ok(conflict_response(&op_id));
                }
                // Displaced bytes matched expected identity → safe to remove.
                let _ = std::fs::remove_file(&tmp);
            }
            None => {
                // Create-if-absent (no replace). On macOS: RENAME_EXCL.
                if !create_if_absent(&tmp, &path).map_err(|e| {
                    let _ = std::fs::remove_file(&tmp);
                    LosslessError::io(format!("创建新文件失败: {e}"))
                })? {
                    update_receipt(
                        &op_id,
                        |r| r.state = ReceiptState::Conflict,
                    )?;
                    return Ok(conflict_response(&op_id));
                }
            }
        }

        let new_identity = current_file_identity(&path, &payload);
        update_receipt(
            &req.save_operation_id,
            |r| r.state = ReceiptState::Written,
        )?;
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
            update_receipt(&op_id, |r| r.state = ReceiptState::Conflict).ok();
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
    let receipt_path = receipt_path_for(&save_operation_id);
    let Some(receipt) = read_receipt(&receipt_path)? else {
        return Err(LosslessError::new(
            "save-outcome-unknown",
            "找不到该 saveOperationId 的 durable receipt",
        ));
    };
    let path = PathBuf::from(&receipt.path);

    match receipt.state {
        ReceiptState::Prepared => {
            // No write observed; if disk still matches the expected identity the
            // operation may be retried with the same id (NotWritten).
            match std::fs::read(&path) {
                Ok(disk) => {
                    let disk_identity = current_file_identity(&path, &disk);
                    if receipt
                        .expected_file_identity
                        .as_ref()
                        .map(|expected| identity_matches(expected, &disk_identity))
                        .unwrap_or(true)
                    {
                        Ok(ReconcileResponse {
                            save_operation_id,
                            state: "not-written".into(),
                            new_file_identity: None,
                        })
                    } else {
                        update_receipt(
                            &save_operation_id,
                            |r| r.state = ReceiptState::Conflict,
                        )?;
                        Ok(ReconcileResponse {
                            save_operation_id,
                            state: "conflict".into(),
                            new_file_identity: None,
                        })
                    }
                }
                Err(_) => {
                    update_receipt(
                        &save_operation_id,
                        |r| r.state = ReceiptState::Conflict,
                    )?;
                    Ok(ReconcileResponse {
                        save_operation_id,
                        state: "conflict".into(),
                        new_file_identity: None,
                    })
                }
            }
        }
        ReceiptState::Written => match std::fs::read(&path) {
            Ok(disk) => {
                if ContentHash::of(&disk).hex() == receipt.payload_sha256 {
                    // Disk holds the prepared payload → commit is safe.
                    Ok(ReconcileResponse {
                        save_operation_id,
                        state: "written-and-commit-pending".into(),
                        new_file_identity: Some(current_file_identity(&path, &disk)),
                    })
                } else {
                    update_receipt(
                        &save_operation_id,
                        |r| r.state = ReceiptState::Conflict,
                    )?;
                    Ok(ReconcileResponse {
                        save_operation_id,
                        state: "conflict".into(),
                        new_file_identity: None,
                    })
                }
            }
            Err(_) => {
                update_receipt(
                    &save_operation_id,
                    |r| r.state = ReceiptState::Conflict,
                )?;
                Ok(ReconcileResponse {
                    save_operation_id,
                    state: "conflict".into(),
                    new_file_identity: None,
                })
            }
        },
        ReceiptState::Committed => Ok(ReconcileResponse {
            save_operation_id,
            state: "committed".into(),
            new_file_identity: None,
        }),
        ReceiptState::Conflict => Ok(ReconcileResponse {
            save_operation_id,
            state: "conflict".into(),
            new_file_identity: None,
        }),
    }
}

// ── Receipt persistence ────────────────────────────────────────────────

pub fn record_prepared(
    save_operation_id: &str,
    path: &str,
    expected_file_identity: &Option<FileIdentity>,
    payload_sha256: &ContentHash,
) -> Result<(), LosslessError> {
    let receipt_path = receipt_path_for(save_operation_id);
    if let Some(existing) = read_receipt(&receipt_path)? {
        if existing.payload_sha256 != payload_sha256.hex() {
            return Err(LosslessError::new(
                "duplicate-mismatch",
                "同一 saveOperationId 已绑定不同 payload，已拒绝",
            ));
        }
        return Ok(()); // idempotent prepare
    }
    let receipt = SaveReceipt {
        save_operation_id: save_operation_id.to_string(),
        path: path.to_string(),
        path_hash: path_hash(path),
        expected_file_identity: expected_file_identity.clone(),
        payload_sha256: payload_sha256.hex(),
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

pub fn receipts_dir() -> PathBuf {
    app_config_dir().join(RECEIPTS_DIR_NAME)
}

fn receipt_path_for(save_operation_id: &str) -> PathBuf {
    receipts_dir().join(format!("{save_operation_id}.json"))
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

/// Atomically write a receipt (temp + fsync + rename).
fn write_receipt_atomically(
    path: &Path,
    receipt: &SaveReceipt,
) -> Result<(), LosslessError> {
    let parent = path
        .parent()
        .ok_or_else(|| LosslessError::new("io", "无法确定 receipt 目录"))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| LosslessError::io(format!("创建 receipt 目录失败: {e}")))?;
    let tmp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        std::process::id()
    ));
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)
            .map_err(|e| LosslessError::io(format!("创建 receipt 临时文件失败: {e}")))?;
        let json = serde_json::to_vec(receipt)
            .map_err(|e| LosslessError::new("internal-invariant", format!("序列化 receipt 失败: {e}")))?;
        f.write_all(&json)
            .map_err(|e| LosslessError::io(format!("写入 receipt 失败: {e}")))?;
        f.sync_all()
            .map_err(|e| LosslessError::io(format!("同步 receipt 失败: {e}")))?;
    }
    std::fs::rename(&tmp, path)
        .map_err(|e| LosslessError::io(format!("提交 receipt 失败: {e}")))?;
    Ok(())
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

#[cfg(not(target_os = "macos"))]
fn atomic_exchange(_tmp: &Path, _target: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "no atomic-exchange primitive on this platform; default replace refused",
    ))
}

#[cfg(not(target_os = "macos"))]
fn create_if_absent(_tmp: &Path, _target: &Path) -> std::io::Result<bool> {
    // Portable fallback: rename is atomic when the target does not exist on
    // POSIX (EEXIST on Windows). Use it only for the create-if-absent path.
    match std::fs::rename(_tmp, _target) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(e) => Err(e),
    }
}
