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
    BridgeSelectionAfter, BridgeTextChange, BridgeTextPatch, CommitSaveRequest,
    OpenDocumentRequest, PatchRequest, PrepareSaveRequest, ReloadDocumentRequest, SessionRequest,
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

fn bridge_patch_with_post_selection(
    session_id: u64,
    document_id: u64,
    transaction_id: u64,
    changes: Vec<BridgeTextChange>,
    anchor_utf16: usize,
    head_utf16: usize,
) -> BridgeTextPatch {
    let mut patch = bridge_patch(session_id, document_id, 0, transaction_id, 0, changes);
    patch.selection_after = Some(BridgeSelectionAfter {
        anchor_utf16: anchor_utf16 as u64,
        head_utf16: head_utf16 as u64,
    });
    patch
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
fn bridge_post_transaction_selection_uses_next_text_utf16_geometry() {
    // The frontend's selectionAfter belongs to CodeMirror's post-transaction
    // document. These cases would either be shifted or rejected if converted
    // through the base session map.
    let cases = [
        // The P4B heading EOF Enter regression: post caret 8 is outside the
        // base `# title` map (length 7) but valid in `# title\n`.
        (
            "heading-eof-enter",
            "# title",
            vec![lf_change(7, 7, "\n")],
            8usize,
            8usize,
            "# title\n",
            8usize,
            8usize,
        ),
        // Inserting before the caret can make a valid post position exceed the
        // old document end.
        (
            "insert",
            "ab",
            vec![lf_change(0, 0, "X")],
            3usize,
            3usize,
            "Xab",
            3usize,
            3usize,
        ),
        // Deleting before the caret changes its logical-byte location.
        (
            "delete",
            "abc",
            vec![lf_change(0, 2, "")],
            1usize,
            1usize,
            "c",
            1usize,
            1usize,
        ),
        // Two base-coordinate changes plus a reversed selection, with emoji
        // (two UTF-16 units/four bytes) and CJK (one UTF-16 unit/three bytes).
        (
            "unicode-multi",
            "ab中😀z",
            vec![lf_change(0, 0, "X"), lf_change(2, 3, "Q")],
            7usize,
            4usize,
            "XabQ😀z",
            9usize,
            4usize,
        ),
    ];

    for (
        index,
        (
            name,
            source,
            changes,
            anchor_utf16,
            head_utf16,
            expected_text,
            expected_anchor,
            expected_head,
        ),
    ) in cases.into_iter().enumerate()
    {
        let app = build_app();
        let dir = temp_dir(&format!("post-selection-{name}"));
        let path = dir.join("doc.md");
        fs::write(&path, source).expect("stage source");
        let path_s = path.to_str().expect("utf8 path").to_string();
        let st = app.state::<AppState>();
        let opened = open_lossless_document(open_req(&path_s), st).expect("open");
        let st = app.state::<AppState>();
        let outcome = apply_document_patch(
            PatchRequest {
                patch: bridge_patch_with_post_selection(
                    opened.session_id,
                    opened.document_id,
                    index as u64 + 1,
                    changes,
                    anchor_utf16,
                    head_utf16,
                ),
            },
            st,
        )
        .expect("post selection patch");
        let selection = outcome.selection_after.expect("selection returned");
        assert_eq!(selection.anchor.0, expected_anchor, "{name}: anchor byte");
        assert_eq!(selection.head.0, expected_head, "{name}: head byte");
        assert_eq!(selection.revision.0, 1, "{name}: next revision");
        let st = app.state::<AppState>();
        assert_eq!(
            get_document_snapshot(
                SessionRequest {
                    session_id: markflow_core::SessionId(opened.session_id)
                },
                st
            )
            .expect("snapshot")
            .logical_text,
            expected_text,
            "{name}: committed text",
        );
        fs::remove_dir_all(&dir).ok();
    }
}

#[test]
fn bridge_invalid_post_selection_is_atomic_and_does_not_mutate_session() {
    let app = build_app();
    let dir = temp_dir("post-selection-invalid");
    let path = dir.join("doc.md");
    fs::write(&path, "ab").expect("stage source");
    let path_s = path.to_str().expect("utf8 path").to_string();
    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let st = app.state::<AppState>();
    let err = apply_document_patch(
        PatchRequest {
            patch: bridge_patch_with_post_selection(
                opened.session_id,
                opened.document_id,
                1,
                vec![lf_change(0, 0, "X")],
                4, // next text is only three UTF-16 code units
                4,
            ),
        },
        st,
    )
    .expect_err("invalid post coordinate must reject");
    assert_eq!(err.code, "invalid-boundary");
    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("unchanged snapshot");
    assert_eq!(snapshot.revision.0, 0);
    assert_eq!(snapshot.logical_text, "ab");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_post_selection_retry_is_idempotent_but_any_transport_difference_conflicts() {
    let app = build_app();
    let dir = temp_dir("post-selection-retry");
    let path = dir.join("doc.md");
    fs::write(&path, "ab").expect("stage source");
    let path_s = path.to_str().expect("utf8 path").to_string();
    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let exact = bridge_patch_with_post_selection(
        opened.session_id,
        opened.document_id,
        1,
        vec![lf_change(0, 0, "X")],
        3,
        3,
    );
    let st = app.state::<AppState>();
    let first = apply_document_patch(
        PatchRequest {
            patch: exact.clone(),
        },
        st,
    )
    .expect("first apply");
    let st = app.state::<AppState>();
    let retry =
        apply_document_patch(PatchRequest { patch: exact }, st).expect("lost-response retry");
    assert_eq!(
        retry, first,
        "exact raw transport retry returns original outcome"
    );

    let mut changed_selection = bridge_patch_with_post_selection(
        opened.session_id,
        opened.document_id,
        1,
        vec![lf_change(0, 0, "X")],
        2,
        2,
    );
    // Deliberately preserve every identity/base/transaction field but alter
    // post-selection: it must conflict rather than reuse outcome blindly.
    changed_selection.base_revision = 0;
    let st = app.state::<AppState>();
    assert_eq!(
        apply_document_patch(
            PatchRequest {
                patch: changed_selection
            },
            st
        )
        .unwrap_err()
        .code,
        "duplicate-mismatch",
    );
    let st = app.state::<AppState>();
    assert_eq!(
        apply_document_patch(
            PatchRequest {
                patch: bridge_patch_with_post_selection(
                    opened.session_id,
                    opened.document_id,
                    1,
                    vec![lf_change(0, 0, "Y")],
                    3,
                    3,
                ),
            },
            st,
        )
        .unwrap_err()
        .code,
        "duplicate-mismatch",
    );
    let mut changed_eol = bridge_patch_with_post_selection(
        opened.session_id,
        opened.document_id,
        1,
        vec![lf_change(0, 0, "X")],
        3,
        3,
    );
    changed_eol.changes[0].inserted_line_endings = vec!["lf".to_string()];
    let st = app.state::<AppState>();
    assert_eq!(
        apply_document_patch(PatchRequest { patch: changed_eol }, st)
            .unwrap_err()
            .code,
        "duplicate-mismatch",
        "same transaction id with changed EOL transport cannot reuse outcome",
    );
    // A different transaction id that merely carries an old base remains a
    // normal stale request, not a ledger hit.
    let st = app.state::<AppState>();
    assert_eq!(
        apply_document_patch(
            PatchRequest {
                patch: bridge_patch_with_post_selection(
                    opened.session_id,
                    opened.document_id,
                    2,
                    vec![lf_change(0, 0, "X")],
                    3,
                    3,
                ),
            },
            st,
        )
        .unwrap_err()
        .code,
        "stale-revision",
    );
    let st = app.state::<AppState>();
    let snapshot = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("snapshot");
    assert_eq!(snapshot.revision.0, 1);
    assert_eq!(snapshot.logical_text, "Xab");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_evicted_post_selection_retry_conflicts_without_mutating_session() {
    let app = build_app();
    let dir = temp_dir("post-selection-evicted-retry");
    let path = dir.join("doc.md");
    fs::write(&path, "ab").expect("stage source");
    let path_s = path.to_str().expect("utf8 path").to_string();
    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let original = bridge_patch_with_post_selection(
        opened.session_id,
        opened.document_id,
        1,
        vec![lf_change(0, 0, "X")],
        3,
        3,
    );
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: original.clone(),
        },
        st,
    )
    .expect("first patch");
    // The Core retry window holds 256 entries. Add 256 later transactions to
    // evict transaction 1; all have their current base revision.
    for transaction_id in 2..=(markflow_core::TRANSACTION_RETRY_WINDOW_CAPACITY as u64 + 1) {
        let st = app.state::<AppState>();
        apply_document_patch(
            PatchRequest {
                patch: bridge_patch(
                    opened.session_id,
                    opened.document_id,
                    0,
                    transaction_id,
                    transaction_id - 1,
                    vec![lf_change(0, 0, "z")],
                ),
            },
            st,
        )
        .expect("fill retry window");
    }
    let st = app.state::<AppState>();
    let before = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("before");
    let st = app.state::<AppState>();
    assert_eq!(
        apply_document_patch(PatchRequest { patch: original }, st)
            .unwrap_err()
            .code,
        "duplicate-mismatch",
    );
    let st = app.state::<AppState>();
    let after = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("after");
    assert_eq!(after.revision, before.revision);
    assert_eq!(after.logical_text, before.logical_text);
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_reload_rejects_old_binding_post_selection_retry_without_mutation() {
    let app = build_app();
    let dir = temp_dir("post-selection-reload-retry");
    let path = dir.join("doc.md");
    fs::write(&path, "ab").expect("stage source");
    let path_s = path.to_str().expect("utf8 path").to_string();
    let st = app.state::<AppState>();
    let opened = open_lossless_document(open_req(&path_s), st).expect("open");
    let old_payload = bridge_patch_with_post_selection(
        opened.session_id,
        opened.document_id,
        1,
        vec![lf_change(0, 0, "X")],
        3,
        3,
    );
    let st = app.state::<AppState>();
    apply_document_patch(
        PatchRequest {
            patch: old_payload.clone(),
        },
        st,
    )
    .expect("first patch");
    let st = app.state::<AppState>();
    reload_lossless_document(
        ReloadDocumentRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            path: path_s,
            default_eol: "lf".to_string(),
        },
        st,
    )
    .expect("reload");
    let st = app.state::<AppState>();
    let before = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("before");
    let st = app.state::<AppState>();
    assert_eq!(
        apply_document_patch(PatchRequest { patch: old_payload }, st)
            .unwrap_err()
            .code,
        "wrong-identity",
    );
    let st = app.state::<AppState>();
    let after = get_document_snapshot(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("after");
    assert_eq!(after.revision, before.revision);
    assert_eq!(after.logical_text, before.logical_text);
    fs::remove_dir_all(&dir).ok();
}

/// P4B task 7.2a: the source command harness emits one local range deletion
/// for heading Backspace at contentStart (`# ` -> empty).  Exercise that exact
/// bridge patch through the real dispatcher and Core, rather than treating the
/// CodeMirror-only command test as byte-contract evidence.  The suffix starts
/// immediately after the removed marker, so CRLF/CR/mixed EOL bytes are all
/// surviving spans and must replay unchanged in the prepared payload.
#[test]
fn bridge_structural_heading_patch_preserves_untouched_eol_bytes() {
    let cases = [
        ("crlf", "# title\r\nunchanged\r\n", "title\r\nunchanged\r\n"),
        ("cr", "# title\runchanged\r", "title\runchanged\r"),
        (
            "mixed",
            "# title\r\nunchanged\runtouched\n",
            "title\r\nunchanged\runtouched\n",
        ),
    ];

    for (index, (name, original, expected)) in cases.into_iter().enumerate() {
        let app = build_app();
        let dir = temp_dir(&format!("structural-heading-{name}"));
        let path = dir.join("doc.md");
        fs::write(&path, original).expect("stage source fixture");
        let path_s = path.to_str().expect("utf8 path").to_string();

        let st = app.state::<AppState>();
        let opened = open_lossless_document(open_req(&path_s), st).expect("open");
        let st = app.state::<AppState>();
        let outcome = apply_document_patch(
            PatchRequest {
                patch: bridge_patch(
                    opened.session_id,
                    opened.document_id,
                    0,
                    1,
                    0,
                    vec![lf_change(0, 2, "")],
                ),
            },
            st,
        )
        .expect("one heading marker patch");
        assert_eq!(
            outcome.revision.0, 1,
            "{name}: one patch advances one revision"
        );

        let st = app.state::<AppState>();
        let prepared = prepare_document_save(
            PrepareSaveRequest {
                session_id: markflow_core::SessionId(opened.session_id),
                document_id: markflow_core::DocumentId(opened.document_id),
                binding_generation: 0,
                expected_revision: 1,
                expected_file_identity: Some(bridge_identity_of(&path)),
                save_operation_id: operation_id(220 + index as u8),
                path: path_s,
            },
            st,
        )
        .expect("prepare real Core payload");
        assert_eq!(
            base64_decode(&prepared.payload_base64),
            expected.as_bytes(),
            "{name}: only the heading marker changes; all EOL bytes survive",
        );
        fs::remove_dir_all(&dir).ok();
    }
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
            patch: bridge_patch(
                session_id,
                document_id,
                1,
                2,
                0,
                vec![lf_change(0, 5, "fresh+")],
            ),
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
            save_operation_id: op_id.clone(),
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
fn bridge_failed_reload_still_revokes_prepared_epoch_before_write_or_commit() {
    // A reload may fail after it has won the lifecycle transition lock (for
    // example the file vanished). Its binding generation remains 0, so this
    // specifically proves the durable receipt epoch—not just generation—is
    // required to keep the old payload from being re-authorized.
    let app = build_app();
    let dir = temp_dir("lossless-failed-reload-epoch");
    let path = dir.join("doc.md");
    fs::write(&path, "old").unwrap();
    let path_s = path.to_string_lossy().to_string();
    let op_id = operation_id(63);

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
                vec![lf_change(0, 3, "stale")],
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

    let missing = dir.join("was-deleted.md");
    let st = app.state::<AppState>();
    assert_eq!(
        reload_lossless_document(
            ReloadDocumentRequest {
                session_id: markflow_core::SessionId(opened.session_id),
                path: missing.to_string_lossy().to_string(),
                default_eol: "lf".into(),
            },
            st,
        )
        .map_err(|error| error.code)
        .unwrap_err(),
        "io"
    );

    // Session is still generation 0 after the failed read, but the exact
    // prepare epoch is irrevocably invalidated.
    let st = app.state::<AppState>();
    let stale_write = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s.clone(),
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity.clone()),
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(
        stale_write.map_err(|error| error.code).unwrap_err(),
        "wrong-identity"
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "old");

    // A forged/lost-response commit is likewise refused before the receipt or
    // Core persisted revision can be changed.
    let st = app.state::<AppState>();
    let stale_commit = commit_document_save(
        CommitSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            persisted_revision: 1,
            new_file_identity: identity,
            save_operation_id: op_id,
        },
        st,
    );
    assert_eq!(
        stale_commit.map_err(|error| error.code).unwrap_err(),
        "wrong-identity"
    );
    let st = app.state::<AppState>();
    assert_eq!(
        get_document_snapshot(
            SessionRequest {
                session_id: markflow_core::SessionId(opened.session_id),
            },
            st,
        )
        .unwrap()
        .persisted_revision,
        Some(markflow_core::Revision(0))
    );

    // A newly prepared epoch can be captured after the failed reload, but an
    // actual close transition revokes it and removes the session before its
    // native write point.
    let close_op = operation_id(64);
    let st = app.state::<AppState>();
    let close_prepared = prepare_document_save(
        PrepareSaveRequest {
            session_id: markflow_core::SessionId(opened.session_id),
            document_id: markflow_core::DocumentId(opened.document_id),
            binding_generation: 0,
            expected_revision: 1,
            expected_file_identity: Some(bridge_identity_of(&path)),
            save_operation_id: close_op.clone(),
            path: path_s.clone(),
        },
        st,
    )
    .expect("prepare current epoch before close");
    let st = app.state::<AppState>();
    close_lossless_document(
        SessionRequest {
            session_id: markflow_core::SessionId(opened.session_id),
        },
        st,
    )
    .expect("close");
    let st = app.state::<AppState>();
    let closed_write = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s,
            payload_base64: close_prepared.payload_base64,
            expected_file_identity: Some(bridge_identity_of(&path)),
            save_operation_id: close_op,
        },
        st,
    );
    assert!(matches!(
        closed_write,
        Err(error) if error.code == "wrong-identity" || error.code == "session-missing"
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "old");
    eprintln!(
        "[dispatcher] bridge_failed_reload_still_revokes_prepared_epoch_before_write_or_commit ok"
    );
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn bridge_replacement_point_lifecycle_revocation_never_writes_discarded_payload() {
    // The deterministic hook fires after guarded_write has passed its first
    // generation check and fsynced the temp file, but before native exchange.
    // It uses the same registry revocation that reload/close call at their
    // entrance, closing the former check-to-replace window.
    let app = build_app();
    let dir = temp_dir("lossless-replace-point-revoke");
    let path = dir.join("doc.md");
    fs::write(&path, "old").unwrap();
    let path_s = path.to_string_lossy().to_string();
    let op_id = operation_id(61);
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
                vec![lf_change(0, 3, "discarded")],
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
    crate::lossless::guarded_write::inject_lifecycle_revocation_before_replace_once();
    let st = app.state::<AppState>();
    let rejected = guarded_atomic_write(
        GuardedWriteRequest {
            path: path_s,
            payload_base64: prepared.payload_base64,
            expected_file_identity: Some(identity),
            save_operation_id: op_id.clone(),
        },
        st,
    );
    assert_eq!(
        rejected.map_err(|error| error.code).unwrap_err(),
        "wrong-identity"
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "old");
    assert_eq!(
        receipt_recovery_path(&op_id),
        None,
        "a lease rejection before exchange must not mislabel app payload as displaced recovery"
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

    // The legacy command is intentionally guarded too. An unresolved receipt
    // must not be bypassed by falling back from a failed lossless open to the
    // old writable WYSIWYG path.
    let st = app.state::<AppState>();
    let legacy_bypass = write_file(path_s.clone(), "unsafe legacy overwrite".into(), st);
    assert!(legacy_bypass
        .expect_err("legacy write must respect unresolved lossless receipt")
        .starts_with("save-outcome-unknown:"),);
    assert_ne!(
        fs::read_to_string(&path).unwrap(),
        "unsafe legacy overwrite"
    );

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

    // The fallback Conflict receipt remains a structured startup-recovery
    // item. Losing the Written receipt must not orphan the displaced bytes.
    let st = app.state::<AppState>();
    let recovery = list_startup_recovery(st)
        .into_iter()
        .find(|item| item.save_operation_id == op_id)
        .expect("post-exchange receipt failure must be surfaced on startup");
    assert_eq!(recovery.state, "conflict");
    let canonical_tmp = tmp.canonicalize().expect("canonical recovery temp path");
    assert_eq!(recovery.recovery_path.as_deref(), canonical_tmp.to_str());

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
    assert!(
        !tmp.exists(),
        "commit must finalize the displaced recovery copy"
    );
    assert_eq!(
        receipt_recovery_path(&op_id).as_deref(),
        None,
        "the Committed receipt no longer references a recovery copy"
    );

    eprintln!("[dispatcher] bridge_recovery_copy_survives_until_commit_then_is_finalized ok");
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
    assert!(
        item.recovery_path.is_some(),
        "Written receipt retains recovery path"
    );

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

#[test]
fn bridge_old_schema_receipt_is_actionable_in_recovery_ui_and_quarantined_durably() {
    // P1B final-review P0: an older/unreadable receipt remains a global Host
    // gate, but it must expose a safe, executable recovery action rather than
    // silently falling into WYSIWYG/legacy write_file. The action only moves
    // opaque evidence inside the controlled receipt store; it never guesses
    // the historical target or outcome.
    let app = build_app();
    let dir = temp_dir("startup-recovery-old-schema");
    let path = dir.join("doc.md");
    fs::write(&path, "body").unwrap();
    let path_s = path.to_string_lossy().to_string();

    let receipt_dir = crate::lossless::guarded_write::receipts_dir();
    fs::create_dir_all(&receipt_dir).unwrap();
    let legacy_receipt = receipt_dir.join("legacy-v0.json");
    let legacy_bytes = br#"{\"schemaVersion\":0,\"legacy\":true}"#;
    fs::write(&legacy_receipt, legacy_bytes).unwrap();
    assert!(crate::lossless::guarded_write::receipt_store_has_corruption());

    // The global safety gate blocks normal lossless open rather than allowing
    // an undecodable receipt to be ignored.
    let st = app.state::<AppState>();
    assert_eq!(
        open_lossless_document(open_req(&path_s), st)
            .map_err(|error| error.code)
            .unwrap_err(),
        "save-outcome-unknown"
    );

    let st = app.state::<AppState>();
    let items: Vec<StartupRecoveryItem> = list_startup_recovery(st);
    let item = items
        .iter()
        .find(|item| item.state == "unreadable-receipt")
        .expect("old-schema receipt must have a structured recovery row");
    assert!(item.requires_quarantine);
    assert!(item.save_operation_id.len() == 36);

    let st = app.state::<AppState>();
    resolve_startup_recovery(
        ResolveStartupRecoveryRequest {
            save_operation_id: item.save_operation_id.clone(),
            action: "quarantine-invalid-receipt".into(),
        },
        st,
    )
    .expect("explicit quarantine action must be executable");

    assert!(
        !crate::lossless::guarded_write::receipt_store_has_corruption(),
        "quarantined receipt is no longer an active global gate"
    );
    let quarantined = receipt_dir
        .join("quarantined-invalid")
        .join(format!("{}.json", item.save_operation_id));
    assert_eq!(fs::read(&quarantined).unwrap(), legacy_bytes);
    assert!(
        !legacy_receipt.exists(),
        "the active receipt root no longer contains the unreadable file"
    );

    let st = app.state::<AppState>();
    assert!(
        open_lossless_document(open_req(&path_s), st).is_ok(),
        "after explicit recovery, the normal lossless open gate is lifted"
    );
    eprintln!("[dispatcher] bridge_old_schema_receipt_is_actionable_in_recovery_ui_and_quarantined_durably ok");
    fs::remove_dir_all(&dir).ok();
    fs::remove_dir_all(&receipt_dir).ok();
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
