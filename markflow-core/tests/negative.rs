//! Negative tests: stale revision, overlap, invalid boundary, provenance
//! mismatch, duplicate retry/mismatch, invalid UTF-8 (no overwrite), and
//! failure atomicity (task 2.7, P1A §4).

mod common;

use markflow_core::{
    CoreError, DocumentId, LineEndingKind, LogicalByteOffset, LosslessDocumentSession,
    NewlineEnding, SessionId, SourceRange, TextChange, TextPatch, TransactionId,
};

fn session(bytes: &[u8]) -> LosslessDocumentSession {
    LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
        .unwrap()
}

fn change(start: usize, end: usize, inserted: &str, eols: &[NewlineEnding]) -> TextChange {
    TextChange {
        range: SourceRange::new(LogicalByteOffset(start), LogicalByteOffset(end)),
        inserted_logical_text: inserted.to_string(),
        inserted_line_endings: eols.to_vec(),
    }
}

fn patch(s: &LosslessDocumentSession, txn: u64, changes: Vec<TextChange>) -> TextPatch {
    TextPatch {
        binding_generation: s.binding_generation(),
        session_id: s.session_id,
        document_id: s.document_id,
        transaction_id: TransactionId(txn),
        base_revision: s.revision(),
        changes,
        selection_after: None,
    }
}

#[test]
fn stale_revision_rejected() {
    let mut s = session(b"hello");
    let stale = TextPatch {
        binding_generation: s.binding_generation(),
        session_id: s.session_id,
        document_id: s.document_id,
        transaction_id: TransactionId(1),
        base_revision: markflow_core::Revision(5),
        changes: vec![change(0, 0, "X", &[])],
        selection_after: None,
    };
    assert_eq!(
        s.apply_patch(stale),
        Err(CoreError::StaleRevision {
            expected: markflow_core::Revision(0),
            actual: markflow_core::Revision(5)
        })
    );
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello");
}

#[test]
fn patch_with_wrong_session_or_document_identity_is_rejected() {
    let mut s = session(b"hello");
    let mut wrong_session = patch(&s, 1, vec![change(0, 0, "X", &[])]);
    wrong_session.session_id = SessionId(2);
    assert_eq!(s.apply_patch(wrong_session), Err(CoreError::WrongIdentity));

    let mut wrong_document = patch(&s, 2, vec![change(0, 0, "X", &[])]);
    wrong_document.document_id = markflow_core::DocumentId(2);
    assert_eq!(s.apply_patch(wrong_document), Err(CoreError::WrongIdentity));
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello");
}

#[test]
fn overlapping_changes_rejected_atomically() {
    let mut s = session(b"hello world");
    // [0,5) and [4,11) overlap.
    let overlapping = patch(
        &s,
        1,
        vec![change(0, 5, "HELLO", &[]), change(4, 11, "WORLD", &[])],
    );
    assert_eq!(
        s.apply_patch(overlapping),
        Err(CoreError::OverlappingChanges)
    );
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello world");
    assert_eq!(s.retained_transaction_count(), 0);
}

#[test]
fn invalid_utf8_boundary_rejected() {
    // '中' = e4 b8 ad. Logical offset 1 is a continuation byte.
    let mut s = session("中中".as_bytes());
    let bad = patch(
        &s,
        1,
        vec![change(1, 4, "X", &[])], // starts on continuation byte
    );
    assert_eq!(s.apply_patch(bad), Err(CoreError::InvalidUtf8Boundary));
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "中中");
}

#[test]
fn provenance_count_mismatch_rejected() {
    let mut s = session(b"hello");
    // inserted has 2 \n but only 1 provenance entry.
    let bad = patch(
        &s,
        1,
        vec![change(0, 0, "a\nb\nc", &[NewlineEnding::Inherit])],
    );
    assert_eq!(
        s.apply_patch(bad),
        Err(CoreError::InvalidEolProvenance {
            expected: 2,
            actual: 1
        })
    );
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello");
}

#[test]
fn inserted_text_with_cr_rejected() {
    let mut s = session(b"hello");
    let bad = patch(&s, 1, vec![change(0, 0, "a\rb", &[NewlineEnding::Inherit])]);
    assert_eq!(s.apply_patch(bad), Err(CoreError::InvalidLogicalLineEnding));
}

#[test]
fn out_of_bounds_range_rejected() {
    let mut s = session(b"hello");
    let bad = patch(&s, 1, vec![change(3, 8, "X", &[])]);
    assert_eq!(s.apply_patch(bad), Err(CoreError::InvalidRange));
}

#[test]
fn reversed_range_rejected() {
    let mut s = session(b"hello");
    let bad = patch(&s, 1, vec![change(4, 2, "X", &[])]);
    assert_eq!(s.apply_patch(bad), Err(CoreError::InvalidRange));
}

#[test]
fn duplicate_retry_idempotent() {
    let mut s = session(b"hello");
    let p = patch(&s, 7, vec![change(0, 5, "world", &[])]);
    let first = s.apply_patch(p.clone()).unwrap();
    let second = s.apply_patch(p).unwrap();
    assert_eq!(first, second);
    assert_eq!(s.revision().0, 1);
    assert_eq!(s.text().logical_text(), "world");
}

#[test]
fn duplicate_mismatch_rejected() {
    let mut s = session(b"hello");
    let p1 = patch(&s, 7, vec![change(0, 5, "world", &[])]);
    s.apply_patch(p1).unwrap();
    let p2 = patch(&s, 7, vec![change(0, 5, "moon", &[])]);
    assert_eq!(s.apply_patch(p2), Err(CoreError::TransactionConflict));
    assert_eq!(s.revision().0, 1);
    assert_eq!(s.text().logical_text(), "world");
}

#[test]
fn invalid_utf8_open_refused() {
    // 0xFF is invalid UTF-8; must refuse, never replacement-decode and open.
    let result = LosslessDocumentSession::open_bytes(
        SessionId(1),
        DocumentId(1),
        b"# T\n\n\xff\xfe bad\n",
        LineEndingKind::Lf,
    );
    assert!(
        matches!(result, Err(CoreError::UnsupportedEncoding)),
        "0xFF must be refused"
    );
}

#[test]
fn invalid_utf8_with_bom_refused() {
    // BOM + invalid UTF-8 inside.
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(b"# T\n\n\xc3\x28 bad\n"); // \xc3\x28 is invalid UTF-8
    assert!(matches!(
        LosslessDocumentSession::open_bytes(
            SessionId(1),
            DocumentId(1),
            &bytes,
            LineEndingKind::Lf
        ),
        Err(CoreError::UnsupportedEncoding)
    ));
}

#[test]
fn prepare_save_stale_revision_rejected() {
    let s = session(b"hello");
    let result = s.prepare_save(markflow_core::Revision(1), &s.original().file_identity);
    assert_eq!(
        result,
        Err(CoreError::StaleRevision {
            expected: markflow_core::Revision(0),
            actual: markflow_core::Revision(1)
        })
    );
}

#[test]
fn prepare_save_identity_conflict_rejected() {
    let s = session(b"hello");
    let other = markflow_core::FileIdentity::from_bytes(b"different");
    assert_eq!(
        s.prepare_save(markflow_core::Revision(0), &other),
        Err(CoreError::ExternalConflict)
    );
}

/// Failure atomicity: an apply that fails (here, a selection-after at an
/// invalid offset) must leave revision, text and confirmed hash untouched.
#[test]
fn failure_leaves_session_unchanged() {
    let mut s = session(b"hello");
    let before_hash = s.confirmed_hash();
    let bad = TextPatch {
        binding_generation: s.binding_generation(),
        session_id: s.session_id,
        document_id: s.document_id,
        transaction_id: TransactionId(1),
        base_revision: s.revision(),
        changes: vec![change(0, 0, "X", &[])],
        selection_after: Some(markflow_core::Selection {
            anchor: LogicalByteOffset(999),
            head: LogicalByteOffset(999),
            revision: s.revision(),
        }),
    };
    assert!(s.apply_patch(bad).is_err());
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello");
    assert_eq!(s.confirmed_hash(), before_hash);
    assert_eq!(s.retained_transaction_count(), 0);
}

/// A multi-change patch where a later change is invalid must reject the WHOLE
/// patch, not apply the earlier ones.
#[test]
fn multi_change_patch_all_or_nothing() {
    let mut s = session(b"hello world");
    // First change valid, second out-of-bounds → nothing applied.
    let bad = patch(
        &s,
        1,
        vec![change(0, 5, "HELLO", &[]), change(20, 25, "X", &[])],
    );
    assert_eq!(s.apply_patch(bad), Err(CoreError::InvalidRange));
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello world");
    assert_eq!(s.retained_transaction_count(), 0);
}

#[test]
fn closed_session_rejects_patch_and_save() {
    let mut s = session(b"hello");
    s.close();
    assert!(s.is_closed());
    assert_eq!(
        s.apply_patch(patch(&s, 1, vec![change(0, 0, "X", &[])])),
        Err(CoreError::SessionClosed)
    );
    assert!(s
        .prepare_save(markflow_core::Revision(0), &s.original().file_identity)
        .is_err());
}
