//! Independent reviewer verification (NOT part of the AI-authored suite).
//! These are throwaway assertions derived from the spec, not from the
//! implementation's own tests.

mod common;

use markflow_core::{
    CoreError, DocumentId, LineEndingKind, LogicalByteOffset, LosslessDocumentSession,
    NewlineEnding, SessionId, SourceByteOffset, SourceRange, TextChange, TextPatch, TransactionId,
};

fn session(bytes: &[u8]) -> LosslessDocumentSession {
    LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
        .unwrap()
}

fn one_change(
    s: &LosslessDocumentSession,
    txn: u64,
    from: usize,
    to: usize,
    inserted: &str,
    eols: &[NewlineEnding],
) -> TextPatch {
    TextPatch {
        binding_generation: s.binding_generation(),
        session_id: s.session_id,
        document_id: s.document_id,
        transaction_id: TransactionId(txn),
        base_revision: s.revision(),
        changes: vec![TextChange {
            range: SourceRange::new(LogicalByteOffset(from), LogicalByteOffset(to)),
            inserted_logical_text: inserted.to_string(),
            inserted_line_endings: eols.to_vec(),
        }],
        selection_after: None,
    }
}

fn replay(s: &mut LosslessDocumentSession, p: TextPatch) -> Vec<u8> {
    s.apply_patch(p).unwrap();
    s.prepare_save(s.revision(), &s.original().file_identity)
        .unwrap()
        .into_bytes()
}

// Case A: no replaced boundary, no right neighbor -> left neighbor is used.
// source "a\nb" (one LF boundary at index 0). Replace "b" (logical [2..3))
// with "X\nY" (one inherit). right neighbor = boundary 1 (none), left = boundary 0 (LF).
#[test]
fn reviewer_left_neighbor_used() {
    let mut s = session(b"a\nb");
    let p = one_change(&s, 1, 2, 3, "X\nY", &[NewlineEnding::Inherit]);
    let out = replay(&mut s, p);
    assert_eq!(out, b"a\nX\nY");
}

// Case B: multi-overflow inherit in a CRLF doc with LF first boundary.
// source "a\nb\r\nc": logical "a\nb\nc", boundaries [Lf, Crlf].
// Replace "a\nb" (logical [0..3)) removes only boundary 0 (Lf); boundary 1
// (Crlf) survives and maps to the newline after "Z". The 3 inserted inherit
// newlines resolve: #1 same-ordinal -> Lf, #2 overflow -> right neighbor Crlf,
// #3 overflow (right/left exhausted) -> dominant Lf.
// Expected source: W LF X CRLF Y LF Z CRLF c = "W\nX\r\nY\nZ\r\nc".
#[test]
fn reviewer_multi_overflow_order() {
    let mut s = session(b"a\nb\r\nc");
    let p = one_change(
        &s,
        1,
        0,
        3,
        "W\nX\nY\nZ",
        &[
            NewlineEnding::Inherit,
            NewlineEnding::Inherit,
            NewlineEnding::Inherit,
        ],
    );
    let out = replay(&mut s, p);
    assert_eq!(out, b"W\nX\r\nY\nZ\r\nc");
}

// Case C: CRLF middle byte (the LF of a CRLF pair) must be a stable error even
// on an empty line ("\r\n\r\n"). The CR byte maps to the logical '\n'.
#[test]
fn reviewer_crlf_middle_and_cr_byte_on_empty_lines() {
    let s = session(b"\r\n\r\n");
    // source bytes: 0='\r', 1='\n', 2='\r', 3='\n'
    // CR byte of first CRLF (offset 0) -> logical 0 (the first '\n').
    assert_eq!(
        s.byte_for_source_byte(SourceByteOffset(0))
            .unwrap()
            .as_usize(),
        0
    );
    // LF byte (middle) of first CRLF (offset 1) -> InsideCrlf stable error.
    assert!(matches!(
        s.byte_for_source_byte(SourceByteOffset(1)),
        Err(CoreError::InvalidSourceOffset {
            reason: markflow_core::SourceOffsetError::InsideCrlf,
            ..
        })
    ));
    // CR byte of second CRLF (offset 2) -> logical 1 (the second '\n').
    assert_eq!(
        s.byte_for_source_byte(SourceByteOffset(2))
            .unwrap()
            .as_usize(),
        1
    );
    // LF byte of second CRLF (offset 3) -> InsideCrlf.
    assert!(matches!(
        s.byte_for_source_byte(SourceByteOffset(3)),
        Err(CoreError::InvalidSourceOffset {
            reason: markflow_core::SourceOffsetError::InsideCrlf,
            ..
        })
    ));
}

// Case D: BOM middle bytes are stable errors; byte 3 is the first char.
#[test]
fn reviewer_bom_middle() {
    let s = session(b"\xef\xbb\xbf# T\n");
    for off in [0usize, 1, 2] {
        assert!(matches!(
            s.byte_for_source_byte(SourceByteOffset(off)),
            Err(CoreError::InvalidSourceOffset {
                reason: markflow_core::SourceOffsetError::InsideBom,
                ..
            })
        ));
    }
    assert_eq!(
        s.byte_for_source_byte(SourceByteOffset(3))
            .unwrap()
            .as_usize(),
        0
    );
}

// Case E: surrogate-pair interior UTF-16 offset is a stable error; a
// continuation-byte logical offset is a stable error.
#[test]
fn reviewer_surrogate_and_continuation() {
    let s = session("A😀B".as_bytes());
    assert!(matches!(
        s.byte_for_utf16(markflow_core::Utf16Offset(2)),
        Err(CoreError::InvalidUtf16Boundary)
    ));
    assert!(matches!(
        s.utf16_for_byte(LogicalByteOffset(2)),
        Err(CoreError::InvalidUtf8Boundary)
    ));
}

// Case F: whole-patch atomicity when the *later* change's EOL provenance is bad.
#[test]
fn reviewer_multi_change_atomic_eol() {
    let mut s = session(b"hello\nworld");
    let bad = TextPatch {
        binding_generation: s.binding_generation(),
        session_id: s.session_id,
        document_id: s.document_id,
        transaction_id: TransactionId(1),
        base_revision: s.revision(),
        changes: vec![
            TextChange {
                range: SourceRange::new(LogicalByteOffset(0), LogicalByteOffset(5)),
                inserted_logical_text: "HELLO".to_string(),
                inserted_line_endings: vec![],
            },
            TextChange {
                range: SourceRange::new(LogicalByteOffset(5), LogicalByteOffset(6)),
                inserted_logical_text: "X\nY\nZ".to_string(),
                inserted_line_endings: vec![NewlineEnding::Inherit], // count 1 != 2
            },
        ],
        selection_after: None,
    };
    assert_eq!(
        s.apply_patch(bad),
        Err(CoreError::InvalidEolProvenance {
            expected: 2,
            actual: 1
        })
    );
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "hello\nworld");
    assert_eq!(s.retained_transaction_count(), 0);
}
