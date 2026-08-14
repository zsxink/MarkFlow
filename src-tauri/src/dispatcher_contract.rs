//! Real Tauri dispatcher contract harness — P0 skeleton (tasks 1.6).
//!
//! Exercises the CURRENT `read_file` / `write_file` commands through a real
//! `tauri::test::mock_builder` App, a real `tauri::State<AppState>` obtained
//! from that App, and a real filesystem. This is NOT a mock of the frontend
//! `invoke` — the command functions and Tauri's state manager are real; only
//! the window/WebView layer is the mock runtime.
//!
//! Contract being pinned (umbrella design.md Bridge 最小 API):
//!   read_file(path: String, State<AppState>) -> Result<String, String>
//!   write_file(path: String, content: String, State<AppState>) -> Result<(), String>
//!
//! Future Core commands (`open_lossless_document`, `apply_document_patch`,
//! `prepare_document_save`, `guarded_atomic_write`, ...) must be appended here
//! with the same real-dispatcher pattern before any Slice 1B work is accepted.
//!
//! Evidence: run `cargo test --manifest-path src-tauri/Cargo.toml
//! dispatcher_contract -- --nocapture` and capture stdout for the run record.

#![cfg(test)]

use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::commands::files::{read_file, write_file};
use crate::state::AppState;

fn temp_dir(tag: &str) -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("markflow_dispatch_{}_{}_{}", std::process::id(), n, tag));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn sha256_hex(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for b in digest { let _ = std::fmt::Write::write_fmt(&mut hex, format_args!("{:02x}", b)); }
    hex
}

fn build_app() -> tauri::App<tauri::test::MockRuntime> {
    let state = AppState::new().expect("AppState::new must construct in test env");
    tauri::test::mock_builder()
        .manage(state)
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("mock Tauri app build")
}

#[test]
fn read_write_roundtrip_preserves_bytes() {
    let app = build_app();
    let dir = temp_dir("roundtrip");
    let path = dir.join("doc.md");
    let content = "# 标题\r\n\r\nBody paragraph 中文。\r\nAnother line.\r\n\r\n";
    let path_s = path.to_str().expect("utf8 path").to_string();

    let st = app.state::<AppState>();
    write_file(path_s.clone(), content.to_string(), st).expect("write_file must succeed");
    let st = app.state::<AppState>();
    let out = read_file(path_s, st).expect("read_file must succeed");

    assert_eq!(out, content, "round-trip must preserve CRLF + CJK bytes");
    eprintln!("[dispatcher] read_write_roundtrip_preserves_bytes ok");
    eprintln!("[dispatcher]   command=write_file arg=path,content payload_sha256={}", sha256_hex(content));
    eprintln!("[dispatcher]   command=read_file  arg=path           payload_sha256={}", sha256_hex(&out));
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn read_write_roundtrip_preserves_bom() {
    let app = build_app();
    let dir = temp_dir("bom");
    let path = dir.join("bom.md");
    let content = "\u{feff}# Title\n\nbody\n\n";
    let path_s = path.to_str().expect("utf8 path").to_string();

    let st = app.state::<AppState>();
    write_file(path_s.clone(), content.to_string(), st).expect("write_file");
    let st = app.state::<AppState>();
    let out = read_file(path_s, st).expect("read_file");
    assert_eq!(out, content, "UTF-8 BOM must round-trip byte-identically");
    eprintln!("[dispatcher] read_write_roundtrip_preserves_bom ok (bom_preserved=true)");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn read_missing_file_returns_error() {
    let app = build_app();
    let missing = std::env::temp_dir()
        .join(format!("markflow_dispatch_missing_{}.md", std::process::id()))
        .to_str().expect("utf8").to_string();
    let st = app.state::<AppState>();
    let res = read_file(missing, st);
    assert!(res.is_err(), "read_file on a missing path must return Err");
    eprintln!("[dispatcher] read_missing_file_returns_error ok (error mapped, no panic)");
}

#[test]
fn read_oversized_file_returns_error() {
    let app = build_app();
    let dir = temp_dir("oversize");
    let path = dir.join("huge.md");
    // Sparse file: logical length 100MB+1 without allocating disk blocks.
    let f = fs::File::create(&path).expect("create sparse file");
    f.set_len(100 * 1024 * 1024 + 1).expect("set sparse length");
    drop(f);

    let st = app.state::<AppState>();
    let res = read_file(path.to_str().expect("utf8").to_string(), st);
    assert!(res.is_err(), "read_file must reject >100MB files");
    eprintln!("[dispatcher] read_oversized_file_returns_error ok (100MB guard enforced)");
    fs::remove_dir_all(&dir).ok();
}

// ── P1B bridge contract (task 3.1) ─────────────────────────────────────
// Real command functions + real Tauri State + real filesystem. The window/WebView
// layer is the only mocked part. No frontend `invoke` is mocked.

use crate::lossless::dto::{
    CommitSaveRequest, OpenDocumentRequest, PatchRequest, PrepareSaveRequest, ReloadDocumentRequest,
    SessionRequest,
};
use crate::lossless::guarded_write::{guarded_atomic_write, reconcile_document_save, GuardedWriteRequest};
use crate::lossless::{
    apply_document_patch, close_lossless_document, commit_document_save, flush_document_session,
    get_document_snapshot, open_lossless_document, prepare_document_save, reload_lossless_document,
};
use markflow_core::{LogicalByteOffset, NewlineEnding, SourceRange, TextChange, TextPatch, TransactionId};

fn lf_change(start: usize, end: usize, inserted: &str) -> TextChange {
    TextChange {
        range: SourceRange::new(LogicalByteOffset(start), LogicalByteOffset(end)),
        inserted_logical_text: inserted.to_owned(),
        inserted_line_endings: vec![NewlineEnding::Inherit; inserted.matches('\n').count()],
    }
}

fn bridge_patch(
    session_id: u64,
    document_id: u64,
    binding_generation: u64,
    transaction_id: u64,
    base_revision: u64,
    changes: Vec<TextChange>,
) -> TextPatch {
    TextPatch {
        binding_generation: markflow_core::BindingGeneration(binding_generation),
        session_id: markflow_core::SessionId(session_id),
        document_id: markflow_core::DocumentId(document_id),
        transaction_id: TransactionId(transaction_id),
        base_revision: markflow_core::Revision(base_revision),
        changes,
        selection_after: None,
    }
}

fn open_req(path: &str) -> OpenDocumentRequest {
    OpenDocumentRequest {
        path: path.to_string(),
        default_eol: "lf".to_string(),
    }
}

/// Real-fs-backed identity of a staged fixture file.
fn bridge_identity_of(path: &std::path::Path) -> markflow_core::FileIdentity {
    let bytes = fs::read(path).expect("read staged fixture");
    crate::lossless::guarded_write::current_file_identity(path, &bytes)
}

#[test]
fn bridge_open_returns_clean_session_with_original_logical_text() {
    let app = build_app();
    let dir = temp_dir("lossless-open");
    let path = dir.join("doc.md");
    fs::write(&path, "# 标题\n\n正文\r\n保留 CRLF\r\n").unwrap();
    let path_s = path.to_str().unwrap().to_string();

    let st = app.state::<AppState>();
    let response = open_lossless_document(open_req(&path_s), st).expect("open must succeed");
    assert_eq!(response.revision, 0);
    assert_eq!(response.persisted_revision, 0);
    assert_eq!(response.logical_text, "# 标题\n\n正文\n保留 CRLF\n");
    assert_eq!(response.confirmed_hash, bridge_identity_of(&path).content_hash.hex());
    eprintln!(
        "[dispatcher] bridge_open_returns_clean_session ok session={} logical_len={}",
        response.session_id,
        response.logical_text.len()
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_apply_patch_and_snapshot_round_trip() {
    let app = build_app();
    let dir = temp_dir("lossless-patch");
    let path = dir.join("doc.md");
    fs::write(&path, "hello world").unwrap();
    let path_s = path.to_str().unwrap().to_string();

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let session_id = opened.session_id;
    let document_id = opened.document_id;

    // Apply a real user edit: replace "hello" with "HELLO".
    let st = app.state::<AppState>();
    let outcome = apply_document_patch(
        PatchRequest {
            patch: bridge_patch(session_id, document_id, 0, 1, 0, vec![lf_change(0, 5, "HELLO")]),
        },
        st,
    )
    .expect("apply patch");
    assert_eq!(outcome.revision.0, 1);
    assert_ne!(outcome.confirmed_hash.hex(), opened.confirmed_hash);

    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(SessionRequest { session_id: markflow_core::SessionId(session_id) }, st).expect("snapshot");
    assert_eq!(snapshot.revision.0, 1);
    assert_eq!(snapshot.logical_text, "HELLO world");
    assert_eq!(snapshot.persisted_revision, Some(markflow_core::Revision(0)));

    // Flush reports the confirmed revision.
    let st = app.state::<AppState>();
    let flushed = flush_document_session(SessionRequest { session_id: markflow_core::SessionId(session_id) }, st).expect("flush");
    assert_eq!(flushed.revision, 1);
    assert_eq!(flushed.persisted_revision, Some(0));

    eprintln!("[dispatcher] bridge_apply_patch_and_snapshot_round_trip ok");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_stale_patch_rejected_and_old_generation_rejected_after_reload() {
    let app = build_app();
    let dir = temp_dir("lossless-reload");
    let path = dir.join("doc.md");
    fs::write(&path, "AAA").unwrap();
    let path_s = path.to_str().unwrap().to_string();

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let session_id = opened.session_id;
    let document_id = opened.document_id;

    // Stale base revision → stale-revision error.
    let st = app.state::<AppState>();
    let stale = apply_document_patch(
        PatchRequest {
            patch: bridge_patch(session_id, document_id, 0, 1, 5, vec![lf_change(0, 0, "X")]),
        },
        st,
    );
    assert_eq!(stale.map_err(|e| e.code).unwrap_err(), "stale-revision".to_string());

    // A delayed patch from the OLD binding generation must be rejected after reload.
    let st = app.state::<AppState>();
    let delayed = bridge_patch(session_id, document_id, 0, 99, 0, vec![lf_change(0, 0, "Z")]);
    reload_lossless_document(
        ReloadDocumentRequest {
            session_id: markflow_core::SessionId(session_id),
            path: path_s.clone(),
            default_eol: "lf".to_string(),
        },
        st,
    )
    .expect("reload");
    let st = app.state::<AppState>();
    let rejected = apply_document_patch(PatchRequest { patch: delayed }, st);
    assert_eq!(rejected.map_err(|e| e.code).unwrap_err(), "wrong-identity".to_string());

    eprintln!("[dispatcher] bridge_stale_patch_rejected_and_old_generation_rejected_after_reload ok");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_prepare_save_zero_patch_returns_original_bytes_and_guarded_write_preserves_l0() {
    let app = build_app();
    let dir = temp_dir("lossless-save");
    let path = dir.join("doc.md");
    let original = "# 标题\r\n\r\n正文\r\n尾部\r\n";
    fs::write(&path, original).unwrap();
    let path_s = path.to_str().unwrap().to_string();
    let op_id = format!("op-{}", std::process::id());

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);

    // L0: zero-patch prepare returns the EXACT original bytes.
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            expected_revision: opened.revision,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let payload = base64_decode(&prepared.payload_base64);
    assert_eq!(payload, original.as_bytes(), "L0 clean save must preserve bytes");

    // Guarded write replaces the target preserving the displaced identity.
    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64.clone(),
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("guarded write");
    assert_eq!(written.outcome, crate::lossless::guarded_write::WriteOutcome::Written);
    assert!(written.displaced_identity_matched, "displaced identity must match expected");
    assert_eq!(fs::read(&path).unwrap(), original.as_bytes(), "L0 bytes unchanged");

    // Idempotent retry with the same operation + payload returns the same result.
    let st = app.state::<AppState>();
    let retried = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64.clone(),
            expected_file_identity: None,
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("idempotent retry");
    assert_eq!(retried.receipt_state, "written");

    // Same operation with a DIFFERENT payload is rejected.
    let st = app.state::<AppState>();
    let different = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: base64_encode_str("TAMPERED"),
            expected_file_identity: None,
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(different.map_err(|e| e.code).unwrap_err(), "duplicate-mismatch".to_string());

    // Reconcile reports written-and-commit-pending (commit not yet called).
    let st = app.state::<AppState>();
    let reconciled = reconcile_document_save(op_id, st).expect("reconcile");
    assert_eq!(reconciled.state, "written-and-commit-pending");

    eprintln!("[dispatcher] bridge_prepare_save_zero_patch_and_guarded_write ok");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_guarded_write_conflicts_on_mismatched_expected_identity() {
    let app = build_app();
    let dir = temp_dir("lossless-conflict");
    let path = dir.join("doc.md");
    fs::write(&path, "original").unwrap();
    let path_s = path.to_str().unwrap().to_string();
    let op_id = format!("op-conflict-{}", std::process::id());

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let original_identity = bridge_identity_of(&path);

    // External change after open: rewrite the file behind the session's back.
    fs::write(&path, "externally modified").unwrap();

    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            expected_revision: opened.revision,
            expected_file_identity: Some(original_identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");

    // The replace-point identity check must refuse to overwrite.
    let st = app.state::<AppState>();
    let conflict = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(original_identity),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("guarded write returns outcome");
    assert_eq!(conflict.outcome, crate::lossless::guarded_write::WriteOutcome::Conflict);
    assert_eq!(fs::read_to_string(&path).unwrap(), "externally modified");
    assert!(receipt_was_written(&op_id, "conflict"), "receipt must record conflict");

    eprintln!("[dispatcher] bridge_guarded_write_conflicts_on_mismatched_expected_identity ok");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_commit_marks_persisted_revision_and_close_removes_session() {
    let app = build_app();
    let dir = temp_dir("lossless-commit");
    let path = dir.join("doc.md");
    fs::write(&path, "body").unwrap();
    let path_s = path.to_str().unwrap().to_string();

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let session_id = opened.session_id;
    let document_id = opened.document_id;

    // Edit → revision 1.
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(session_id, document_id, 0, 1, 0, vec![lf_change(0, 4, "BODY")]),
        },
        st,
    )
    .expect("apply");

    let new_identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: new_identity,
        },
        st,
    )
    .expect("commit");

    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(SessionRequest { session_id: markflow_core::SessionId(session_id) }, st).expect("snapshot");
    assert_eq!(snapshot.persisted_revision, Some(markflow_core::Revision(1)));

    // Close removes the session; snapshot then reports session-missing.
    let st = app.state::<AppState>();
    close_lossless_document(SessionRequest { session_id: markflow_core::SessionId(session_id) }, st).expect("close");
    let st = app.state::<AppState>();
    let after_close = get_document_snapshot(SessionRequest { session_id: markflow_core::SessionId(session_id) }, st);
    assert_eq!(after_close.map_err(|e| e.code).unwrap_err(), "session-missing".to_string());

    eprintln!("[dispatcher] bridge_commit_marks_persisted_revision_and_close_removes_session ok");
    fs::remove_dir_all(&dir).ok();
}

fn base64_decode(s: &str) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(s).expect("base64")
}

fn base64_encode_str(s: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
}

fn receipt_was_written(op_id: &str, expected_state: &str) -> bool {
    let path = crate::lossless::guarded_write::receipts_dir().join(format!("{op_id}.json"));
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(r) = serde_json::from_slice::<crate::lossless::dto::SaveReceipt>(&bytes) {
            return format!("{:?}", r.state).to_lowercase() == expected_state;
        }
    }
    false
}
