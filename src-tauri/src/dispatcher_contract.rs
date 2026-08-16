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
    let dir = std::env::temp_dir().join(format!(
        "markflow_dispatch_{}_{}_{}",
        std::process::id(),
        n,
        tag
    ));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn operation_id(n: u8) -> String {
    format!("00000000-0000-4000-8000-{:012x}", n)
}

fn sha256_hex(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for b in digest {
        let _ = std::fmt::Write::write_fmt(&mut hex, format_args!("{:02x}", b));
    }
    hex
}

fn build_app() -> tauri::App<tauri::test::MockRuntime> {
    // Isolate durable-save receipts from the real app config dir (P1A reviewer
    // P2 finding): each test writes receipts to its own temp dir.
    use std::sync::atomic::{AtomicUsize, Ordering};
    static RECEIPT_COUNTER: AtomicUsize = AtomicUsize::new(0);
    let receipts_dir = std::env::temp_dir().join(format!(
        "markflow_dispatch_receipts_{}_{}",
        std::process::id(),
        RECEIPT_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir_all(&receipts_dir).expect("create temp receipts dir");
    crate::lossless::guarded_write::set_receipts_dir_override(Some(receipts_dir));
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
    eprintln!(
        "[dispatcher]   command=write_file arg=path,content payload_sha256={}",
        sha256_hex(content)
    );
    eprintln!(
        "[dispatcher]   command=read_file  arg=path           payload_sha256={}",
        sha256_hex(&out)
    );
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
        .join(format!(
            "markflow_dispatch_missing_{}.md",
            std::process::id()
        ))
        .to_str()
        .expect("utf8")
        .to_string();
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
    BridgeTextChange, BridgeTextPatch, CommitSaveRequest, OpenDocumentRequest, PatchRequest,
    PrepareSaveRequest, ReloadDocumentRequest, SessionRequest,
};
use crate::lossless::guarded_write::{
    guarded_atomic_write, list_startup_recovery, reconcile_document_save, resolve_startup_recovery,
    GuardedWriteRequest, ResolveStartupRecoveryRequest, StartupRecoveryItem,
};
use crate::lossless::{
    apply_document_patch, close_lossless_document, commit_document_save, flush_document_session,
    get_document_snapshot, open_lossless_document, prepare_document_save, reload_lossless_document,
};

fn lf_change(from_utf16: usize, to_utf16: usize, inserted: &str) -> BridgeTextChange {
    BridgeTextChange {
        from_utf16: from_utf16 as u64,
        to_utf16: to_utf16 as u64,
        inserted_logical_text: inserted.to_owned(),
        inserted_line_endings: vec!["inherit".to_string(); inserted.matches('\n').count()],
    }
}

fn bridge_patch(
    session_id: u64,
    document_id: u64,
    binding_generation: u64,
    transaction_id: u64,
    base_revision: u64,
    changes: Vec<BridgeTextChange>,
) -> BridgeTextPatch {
    BridgeTextPatch {
        binding_generation,
        session_id,
        document_id,
        transaction_id,
        base_revision,
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
    assert_eq!(
        response.confirmed_hash,
        bridge_identity_of(&path).content_hash.hex()
    );
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
            patch: bridge_patch(
                session_id,
                document_id,
                0,
                1,
                0,
                vec![lf_change(0, 5, "HELLO")],
            ),
        },
        st,
    )
    .expect("apply patch");
    assert_eq!(outcome.revision.0, 1);
    assert_ne!(outcome.confirmed_hash.hex(), opened.confirmed_hash);

    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(snapshot.revision.0, 1);
    assert_eq!(snapshot.logical_text, "HELLO world");
    assert_eq!(
        snapshot.persisted_revision,
        Some(markflow_core::Revision(0))
    );

    // Flush reports the confirmed revision.
    let st = app.state::<AppState>();
    let flushed = flush_document_session(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("flush");
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
    assert_eq!(
        stale.map_err(|e| e.code).unwrap_err(),
        "stale-revision".to_string()
    );

    // A delayed patch from the OLD binding generation must be rejected after reload.
    let st = app.state::<AppState>();
    let delayed = bridge_patch(
        session_id,
        document_id,
        0,
        99,
        0,
        vec![lf_change(0, 0, "Z")],
    );
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
    assert_eq!(
        rejected.map_err(|e| e.code).unwrap_err(),
        "wrong-identity".to_string()
    );

    eprintln!(
        "[dispatcher] bridge_stale_patch_rejected_and_old_generation_rejected_after_reload ok"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_prepared_save_cannot_cross_reload_generation_write_or_commit() {
    // P1B corrective P0-3: a save prepared against generation 0 must not write
    // or commit after the binding is reloaded (generation 1) — the user
    // explicitly discarded the old image. Disk and Core must remain untouched.
    let app = build_app();
    let dir = temp_dir("lossless-generation-save");
    let path = dir.join("doc.md");
    fs::write(&path, "old").unwrap();
    let path_s = path.to_str().unwrap().to_string();
    let op_id = operation_id(60);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    assert_eq!(opened.binding_generation, 0);
    let session_id = opened.session_id;
    let document_id = opened.document_id;
    let identity = bridge_identity_of(&path);

    // Edit → revision 1 (generation 0).
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(
                session_id,
                document_id,
                0,
                1,
                0,
                vec![lf_change(0, 3, "NEW")],
            ),
        },
        st,
    )
    .expect("edit generation 0");
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare generation 0");
    let payload_base64 = prepared.payload_base64.clone();

    // Discard-reload advances the binding generation; the old image is gone.
    fs::write(&path, "fresh").unwrap();
    let st = app.state::<AppState>();
    let reloaded = reload_lossless_document(
        ReloadDocumentRequest {
            session_id: markflow_core::SessionId(session_id),
            path: path_s.clone(),
            default_eol: "lf".to_string(),
        },
        st,
    )
    .expect("reload");
    assert_eq!(reloaded.binding_generation, 1);
    assert_eq!(reloaded.logical_text, "fresh");

    // The delayed guarded write for the old generation must be refused.
    let st = app.state::<AppState>();
    let late_write = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(
        late_write.map_err(|e| e.code).unwrap_err(),
        "wrong-identity"
    );
    // Disk holds the reloaded bytes, not the stale generation-0 payload.
    assert_eq!(fs::read_to_string(&path).unwrap(), "fresh");

    // And the late commit for the old generation must be refused too. The
    // reloaded session has revision 0, so committing the old revision 1 is a
    // stale-revision refusal — persisted cannot advance past confirmed.
    let written_identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    let late_commit = commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: written_identity,
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(
        late_commit.map_err(|e| e.code).unwrap_err(),
        "stale-revision"
    );

    // Stronger generation proof: edit the reloaded generation back to the SAME
    // numeric revision 1. The stale-revision guard no longer fires — only the
    // receipt's binding-generation binding (P0-3) can refuse this commit.
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(session_id, document_id, 1, 2, 0, vec![lf_change(0, 5, "fresh+")]),
        },
        st,
    )
    .expect("edit reloaded generation to revision 1");
    let st = app.state::<AppState>();
    let gen_refused = commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: bridge_identity_of(&path),
            save_operation_id: op_id,
        },
        st,
    );
    assert_eq!(
        gen_refused.map_err(|e| e.code).unwrap_err(),
        "wrong-identity"
    );

    // Core persisted revision stays at the reloaded clean state (0).
    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(snapshot.logical_text, "fresh+");
    assert_eq!(
        snapshot.persisted_revision,
        Some(markflow_core::Revision(0))
    );

    eprintln!(
        "[dispatcher] bridge_prepared_save_cannot_cross_reload_generation_write_or_commit ok"
    );
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
    let op_id = operation_id(10);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);

    // L0: zero-patch prepare returns the EXACT original bytes.
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: opened.revision,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let payload = base64_decode(&prepared.payload_base64);
    assert_eq!(
        payload,
        original.as_bytes(),
        "L0 clean save must preserve bytes"
    );

    // Guarded write replaces the target preserving the displaced identity.
    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64.clone(),
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("guarded write");
    assert_eq!(
        written.outcome,
        crate::lossless::guarded_write::WriteOutcome::Written
    );
    assert!(
        written.displaced_identity_matched,
        "displaced identity must match expected"
    );
    assert_eq!(
        fs::read(&path).unwrap(),
        original.as_bytes(),
        "L0 bytes unchanged"
    );

    // Idempotent retry with the same operation + payload returns the same result.
    let st = app.state::<AppState>();
    let retried = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64.clone(),
            expected_file_identity: Some(identity.clone()),
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
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(
        different.map_err(|e| e.code).unwrap_err(),
        "duplicate-mismatch".to_string()
    );

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
    let op_id = operation_id(11);

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
            binding_generation: 0,
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
    assert_eq!(
        conflict.outcome,
        crate::lossless::guarded_write::WriteOutcome::Conflict
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "externally modified");
    assert!(
        receipt_was_written(&op_id, "conflict"),
        "receipt must record conflict"
    );

    eprintln!("[dispatcher] bridge_guarded_write_conflicts_on_mismatched_expected_identity ok");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_commit_without_matching_receipt_is_rejected_and_leaves_state_unchanged() {
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
            patch: bridge_patch(
                session_id,
                document_id,
                0,
                1,
                0,
                vec![lf_change(0, 4, "BODY")],
            ),
        },
        st,
    )
    .expect("apply");

    // P0-1: a commit without ANY durable receipt must be rejected. The identity
    // of the still-old disk file must never be accepted as evidence that the
    // unsaved Core text reached disk.
    let missing_op = operation_id(40);
    let st = app.state::<AppState>();
    let rejected = commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: bridge_identity_of(&path),
            save_operation_id: missing_op,
        },
        st,
    );
    assert_eq!(
        rejected.map_err(|e| e.code).unwrap_err(),
        "operation-not-prepared"
    );

    // disk / core / persisted all unchanged.
    assert_eq!(fs::read_to_string(&path).unwrap(), "body");
    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(snapshot.logical_text, "BODY");
    assert_eq!(
        snapshot.persisted_revision,
        Some(markflow_core::Revision(0))
    );

    // P0-1: a Prepared-but-not-Written receipt must also be rejected (the write
    // never reached disk), leaving persisted untouched.
    let op_id = operation_id(41);
    let original_identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(original_identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let st = app.state::<AppState>();
    let not_written = commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: bridge_identity_of(&path),
            save_operation_id: op_id.clone(),
        },
        st,
    );
    // Prepared receipt cannot authorize a commit (no durable write observed).
    assert_eq!(
        not_written.map_err(|e| e.code).unwrap_err(),
        "save-outcome-unknown"
    );
    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(
        snapshot.persisted_revision,
        Some(markflow_core::Revision(0))
    );

    // A commit whose new identity does NOT match the Written receipt is rejected.
    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64.clone(),
            expected_file_identity: Some(original_identity.clone()),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("write");
    assert_eq!(
        written.outcome,
        crate::lossless::guarded_write::WriteOutcome::Written
    );
    let wrong_identity = markflow_core::FileIdentity {
        canonical_path: Some(path.clone()),
        size: 0,
        mtime: None,
        content_hash: markflow_core::ContentHash::of(b"not the written payload"),
    };
    let st = app.state::<AppState>();
    let mismatched = commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: wrong_identity,
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(
        mismatched.map_err(|e| e.code).unwrap_err(),
        "wrong-identity"
    );
    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(
        snapshot.persisted_revision,
        Some(markflow_core::Revision(0))
    );

    // Full proper flow with the matching Written receipt succeeds.
    let st = app.state::<AppState>();
    commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(session_id),
            document_id: markflow_core::DocumentId(document_id),
            persisted_revision: 1,
            new_file_identity: written.new_file_identity.clone().expect("written identity"),
            save_operation_id: op_id,
        },
        st,
    )
    .expect("commit with matching receipt");

    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(
        snapshot.persisted_revision,
        Some(markflow_core::Revision(1))
    );

    // Close removes the session; snapshot then reports session-missing.
    let st = app.state::<AppState>();
    close_lossless_document(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    )
    .expect("close");
    let st = app.state::<AppState>();
    let after_close = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(session_id),
        },
        st,
    );
    assert_eq!(
        after_close.map_err(|e| e.code).unwrap_err(),
        "session-missing".to_string()
    );

    eprintln!(
        "[dispatcher] bridge_commit_without_matching_receipt_is_rejected_and_leaves_state_unchanged ok"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_save_as_target_created_between_prepare_and_write_is_conflict_not_overwritten() {
    let app = build_app();
    let dir = temp_dir("lossless-saveas-race");
    let path = dir.join("doc.md");
    fs::write(&path, "body").unwrap();
    let save_as_target = dir.join("new.md");
    let path_s = path.to_str().unwrap().to_string();
    let target_s = save_as_target.to_str().unwrap().to_string();
    let op_id = operation_id(50);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");

    // Save As: target expected ABSENT.
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: opened.revision,
            expected_file_identity: None,
            save_operation_id: op_id.clone(),
            path: target_s.clone(),
        },
        st,
    )
    .expect("prepare Save As");

    // An external process creates the target AFTER the precheck and BEFORE the
    // replace point. The no-replace primitive must refuse, never overwrite.
    fs::write(&save_as_target, "external bytes").unwrap();

    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: target_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: None,
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("guarded write returns outcome");
    assert_eq!(
        written.outcome,
        crate::lossless::guarded_write::WriteOutcome::Conflict
    );
    assert_eq!(
        fs::read_to_string(&save_as_target).unwrap(),
        "external bytes",
        "the externally-created target must survive byte-identically"
    );
    assert!(
        receipt_was_written(&op_id, "conflict"),
        "receipt must record the Save As conflict"
    );

    // The original document is untouched as well.
    assert_eq!(fs::read_to_string(&path).unwrap(), "body");
    eprintln!(
        "[dispatcher] bridge_save_as_target_created_between_prepare_and_write_is_conflict_not_overwritten ok"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_receipt_is_a_target_bound_capability_and_rejects_unsafe_operation_ids() {
    let app = build_app();
    let dir = temp_dir("receipt-authority");
    let path_a = dir.join("a.md");
    let path_b = dir.join("b.md");
    fs::write(&path_a, "A").unwrap();
    fs::write(&path_b, "B").unwrap();
    let a = path_a.to_string_lossy().to_string();
    let b = path_b.to_string_lossy().to_string();
    let op_id = operation_id(12);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&a), st).expect("open A");
    let a_identity = bridge_identity_of(&path_a);
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: opened.revision,
            expected_file_identity: Some(a_identity.clone()),
            save_operation_id: op_id.clone(),
            path: a.clone(),
        },
        st,
    )
    .expect("prepare A");

    // Same payload cannot turn an A receipt into authority to write B.
    let st = app.state::<AppState>();
    let redirected = guarded_atomic_write(
        GuardedWriteRequest {
            path: b,
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(bridge_identity_of(&path_b)),
            save_operation_id: op_id,
        },
        st,
    );
    assert_eq!(
        redirected.map_err(|e| e.code).unwrap_err(),
        "wrong-identity"
    );
    assert_eq!(fs::read_to_string(&path_b).unwrap(), "B");

    let st = app.state::<AppState>();
    let invalid = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: opened.revision,
            expected_file_identity: Some(a_identity),
            save_operation_id: "../../receipt-escape".into(),
            path: a,
        },
        st,
    );
    assert_eq!(
        invalid.map_err(|e| e.code).unwrap_err(),
        "invalid-operation-id"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_committed_receipt_reconciles_exact_identity_after_lost_commit_response() {
    let app = build_app();
    let dir = temp_dir("commit-response-loss");
    let path = dir.join("doc.md");
    fs::write(&path, "body").unwrap();
    let path_s = path.to_string_lossy().to_string();
    let op_id = operation_id(13);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(
                opened.session_id,
                opened.document_id,
                0,
                1,
                0,
                vec![lf_change(0, 4, "BODY")],
            ),
        },
        st,
    )
    .expect("edit");
    let original_identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(original_identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s,
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(original_identity),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("write");
    let written_identity = written.new_file_identity.expect("written identity");

    // This command mutates Core and durable state first. Treating the command
    // response as lost must still let the caller obtain the exact receipt-bound
    // identity, session, document and revision on reconcile.
    let st = app.state::<AppState>();
    commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            persisted_revision: 1,
            new_file_identity: written_identity.clone(),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("backend commit before lost response");
    let st = app.state::<AppState>();
    let reconciled = reconcile_document_save(op_id, st).expect("reconcile lost response");
    assert_eq!(reconciled.state, "committed");
    assert_eq!(reconciled.session_id, opened.session_id);
    assert_eq!(reconciled.document_id, opened.document_id);
    assert_eq!(reconciled.revision, 1);
    assert_eq!(reconciled.new_file_identity, Some(written_identity));
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_uncommitted_written_receipt_blocks_new_prepare_until_reconciled() {
    let app = build_app();
    let dir = temp_dir("startup-receipt-gate");
    let path = dir.join("doc.md");
    fs::write(&path, "body").unwrap();
    let path_s = path.to_string_lossy().to_string();
    let op_id = operation_id(14);
    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 0,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let st = app.state::<AppState>();
    guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id,
        },
        st,
    )
    .expect("write without commit");

    let st = app.state::<AppState>();
    let blocked = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 0,
            expected_file_identity: Some(identity),
            save_operation_id: operation_id(15),
            path: path_s,
        },
        st,
    );
    assert_eq!(
        blocked.map_err(|e| e.code).unwrap_err(),
        "save-outcome-unknown"
    );
    fs::remove_dir_all(&dir).ok();
}

fn base64_decode(s: &str) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .expect("base64")
}

fn base64_encode_str(s: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
}

#[test]
fn bridge_receipt_write_failure_after_exchange_retains_displaced_recovery_copy() {
    // P1B corrective P1-1: the displaced original must survive a receipt
    // persistence failure (crash) that occurs AFTER the atomic target swap. The
    // recovery copy is discoverable at the deterministic temp path and the
    // receipt is classified Conflict (never Written without durability).
    let app = build_app();
    let dir = temp_dir("lossless-receipt-crash");
    let path = dir.join("doc.md");
    fs::write(&path, "old content").unwrap();
    let path_s = path.to_str().unwrap().to_string();
    let op_id = operation_id(70);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);

    // Edit → revision 1 so the prepared payload differs from disk.
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(
                opened.session_id,
                opened.document_id,
                0,
                1,
                0,
                vec![lf_change(0, 11, "NEW content")],
            ),
        },
        st,
    )
    .expect("edit");
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");

    // Inject a receipt-write failure at the Written transition (after swap).
    crate::lossless::guarded_write::inject_receipt_write_failure_once();
    let st = app.state::<AppState>();
    let result = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert!(
        result.is_err(),
        "the injected receipt failure must surface as an error"
    );

    // The swap DID land — the target holds the new payload.
    assert_eq!(fs::read_to_string(&path).unwrap(), "NEW content");

    // The displaced original is retained at the deterministic temp path.
    let file_name = path.file_name().unwrap().to_string_lossy().to_string();
    let tmp = dir.join(format!(
        ".{file_name}.{}.mf-tmp",
        markflow_core::ContentHash::of(op_id.as_bytes()).hex()
    ));
    assert!(
        tmp.exists(),
        "the displaced original must be retained as a recovery copy after the receipt failure"
    );
    assert_eq!(
        fs::read_to_string(&tmp).unwrap(),
        "old content",
        "recovery copy must hold the pre-replacement bytes"
    );

    // The receipt never advanced to Written; it is Conflict (the outer handler
    // classifies the failed write), so no one can claim a durable write.
    let receipt_state = receipt_state_string(&op_id);
    assert!(
        receipt_state != "written",
        "a receipt whose Written write failed must never report written"
    );
    assert_eq!(receipt_state, "conflict");

    // A subsequent reconcile classifies it Conflict, and the target stays gated.
    let st = app.state::<AppState>();
    let reconciled = reconcile_document_save(op_id.clone(), st).expect("reconcile");
    assert_eq!(reconciled.state, "conflict");
    let st = app.state::<AppState>();
    let blocked = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(bridge_identity_of(&path)),
            save_operation_id: operation_id(71),
            path: path_s,
        },
        st,
    );
    assert_eq!(
        blocked.map_err(|e| e.code).unwrap_err(),
        "external-conflict"
    );

    eprintln!(
        "[dispatcher] bridge_receipt_write_failure_after_exchange_retains_displaced_recovery_copy ok"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_recovery_copy_survives_until_commit_then_is_finalized() {
    // P1B corrective P1-1: after a normal guarded write the displaced recovery
    // copy stays on disk (recoverable from the Written receipt) until the
    // operation commits; commit then finalizes it.
    let app = build_app();
    let dir = temp_dir("lossless-recovery-lifecycle");
    let path = dir.join("doc.md");
    fs::write(&path, "old content").unwrap();
    let path_s = path.to_str().unwrap().to_string();
    let op_id = operation_id(72);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(
                opened.session_id,
                opened.document_id,
                0,
                1,
                0,
                vec![lf_change(0, 11, "NEW content")],
            ),
        },
        st,
    )
    .expect("edit");
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("write");
    assert_eq!(
        written.outcome,
        crate::lossless::guarded_write::WriteOutcome::Written
    );

    let file_name = path.file_name().unwrap().to_string_lossy().to_string();
    let tmp = dir.join(format!(
        ".{file_name}.{}.mf-tmp",
        markflow_core::ContentHash::of(op_id.as_bytes()).hex()
    ));
    // The recovery copy must STILL exist right after the write (pre-commit).
    assert!(
        tmp.exists(),
        "displaced recovery copy must survive until the operation commits"
    );
    assert_eq!(fs::read_to_string(&tmp).unwrap(), "old content");
    // The Written receipt records it as the recovery path (canonical /private
    // form on macOS where /var is a symlink).
    let canonical_tmp = tmp.canonicalize().unwrap().to_string_lossy().to_string();
    assert_eq!(
        receipt_recovery_path(&op_id).as_deref(),
        Some(canonical_tmp.as_str())
    );

    // Commit → the receipt advances and the recovery copy is finalized.
    let st = app.state::<AppState>();
    commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            persisted_revision: 1,
            new_file_identity: written.new_file_identity.expect("written identity"),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("commit");
    assert!(!tmp.exists(), "commit must finalize the displaced recovery copy");
    assert_eq!(
        receipt_recovery_path(&op_id).as_deref(),
        None,
        "the Committed receipt no longer references a recovery copy"
    );

    eprintln!(
        "[dispatcher] bridge_recovery_copy_survives_until_commit_then_is_finalized ok"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_startup_recovery_list_exposes_structured_items_and_accept_written_lifts_gate() {
    // P2-1: a Written (uncommitted) receipt after restart is surfaced as a
    // structured recovery item, and an explicit `accept-written` decision is
    // durably recorded, lifting the Host path gate.
    let app = build_app();
    let dir = temp_dir("startup-recovery-accept");
    let path = dir.join("doc.md");
    fs::write(&path, "body").unwrap();
    let path_s = path.to_string_lossy().to_string();
    let op_id = operation_id(80);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: bridge_patch(
                opened.session_id,
                opened.document_id,
                0,
                1,
                0,
                vec![lf_change(0, 4, "BODY")],
            ),
        },
        st,
    )
    .expect("edit");
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    let st = app.state::<AppState>();
    guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("write without commit");

    // Structured startup list exposes the unresolved operation.
    let st = app.state::<AppState>();
    let items: Vec<StartupRecoveryItem> = list_startup_recovery(st);
    let item = items
        .iter()
        .find(|i| i.save_operation_id == op_id)
        .expect("Written receipt must be listed as a recovery item");
    assert_eq!(item.state, "written-and-commit-pending");
    assert_eq!(item.session_id, opened.session_id);
    assert_eq!(item.document_id, opened.document_id);
    assert_eq!(item.revision, 1);
    assert_eq!(item.path, path.canonicalize().unwrap().to_string_lossy());
    assert!(item.recovery_path.is_some(), "Written receipt retains recovery path");

    // Host gate is active until the terminal decision is recorded.
    let st = app.state::<AppState>();
    let blocked = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(bridge_identity_of(&path)),
            save_operation_id: operation_id(81),
            path: path_s.clone(),
        },
        st,
    );
    assert_eq!(
        blocked.map_err(|e| e.code).unwrap_err(),
        "save-outcome-unknown"
    );

    // Explicit accept-written decision lifts the gate durably.
    let st = app.state::<AppState>();
    resolve_startup_recovery(
        ResolveStartupRecoveryRequest {
            save_operation_id: op_id.clone(),
            action: "accept-written".into(),
        },
        st,
    )
    .expect("accept-written");
    assert_eq!(receipt_state_string(&op_id), "committed");

    let st = app.state::<AppState>();
    let reopened = open_lossless_document(open_req(&path_s), st);
    assert!(
        reopened.is_ok(),
        "after a terminal recovery decision the Host gate must lift (path reopenable)"
    );

    eprintln!("[dispatcher] bridge_startup_recovery_list_exposes_structured_items_and_accept_written_lifts_gate ok");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_startup_recovery_discard_recovery_lifts_conflict_gate() {
    // P2-1: a Conflict receipt is listed, and `discard-recovery` records the
    // terminal decision (delete recovery + advance receipt), lifting the gate.
    let app = build_app();
    let dir = temp_dir("startup-recovery-discard");
    let path = dir.join("doc.md");
    fs::write(&path, "external").unwrap();
    let path_s = path.to_string_lossy().to_string();
    let op_id = operation_id(83);

    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let identity = bridge_identity_of(&path);
    // A conflict receipt: prepare, then externally replace before write.
    let st = app.state::<AppState>();
    let prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 0,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare");
    fs::write(&path, "external v2").unwrap();
    let st = app.state::<AppState>();
    let written = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    )
    .expect("write outcome");
    assert_eq!(
        written.outcome,
        crate::lossless::guarded_write::WriteOutcome::Conflict
    );

    let st = app.state::<AppState>();
    let items: Vec<StartupRecoveryItem> = list_startup_recovery(st);
    let item = items
        .iter()
        .find(|i| i.save_operation_id == op_id)
        .expect("Conflict receipt must be listed");
    assert_eq!(item.state, "conflict");

    // Gate active until resolved.
    let st = app.state::<AppState>();
    let blocked = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 0,
            expected_file_identity: Some(bridge_identity_of(&path)),
            save_operation_id: operation_id(84),
            path: path_s.clone(),
        },
        st,
    );
    assert_eq!(
        blocked.map_err(|e| e.code).unwrap_err(),
        "external-conflict"
    );

    let st = app.state::<AppState>();
    resolve_startup_recovery(
        ResolveStartupRecoveryRequest {
            save_operation_id: op_id.clone(),
            action: "discard-recovery".into(),
        },
        st,
    )
    .expect("discard-recovery");
    assert_eq!(receipt_state_string(&op_id), "committed");

    let st = app.state::<AppState>();
    let reopened = open_lossless_document(open_req(&path_s), st);
    assert!(
        reopened.is_ok(),
        "after discarding recovery the Host gate must lift (path reopenable)"
    );

    eprintln!("[dispatcher] bridge_startup_recovery_discard_recovery_lifts_conflict_gate ok");
    fs::remove_dir_all(&dir).ok();
}

fn receipt_was_written(op_id: &str, expected_state: &str) -> bool {
    let path = crate::lossless::guarded_write::receipt_path_for(op_id);
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(r) = serde_json::from_slice::<crate::lossless::dto::SaveReceipt>(&bytes) {
            return format!("{:?}", r.state).to_lowercase() == expected_state;
        }
    }
    false
}

fn receipt_state_string(op_id: &str) -> String {
    let path = crate::lossless::guarded_write::receipt_path_for(op_id);
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(r) = serde_json::from_slice::<crate::lossless::dto::SaveReceipt>(&bytes) {
            return format!("{:?}", r.state).to_lowercase();
        }
    }
    "missing".into()
}

fn receipt_recovery_path(op_id: &str) -> Option<String> {
    let path = crate::lossless::guarded_write::receipt_path_for(op_id);
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(r) = serde_json::from_slice::<crate::lossless::dto::SaveReceipt>(&bytes) {
            return r.recovery_path;
        }
    }
    None
}
