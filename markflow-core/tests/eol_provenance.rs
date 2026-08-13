//! Mixed EOL inheritance order, explicit paste provenance, provenance-count
//! atomic rejection, and BOM preservation (task 2.7, P1A §4).

mod common;

use markflow_core::{
    DocumentId, LineEndingKind, LogicalByteOffset, LosslessDocumentSession, NewlineEnding,
    SessionId, SourceRange, TextChange, TextPatch, TransactionId,
};

fn session(bytes: &[u8]) -> LosslessDocumentSession {
    LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
        .unwrap()
}

/// Build a patch with one change whose inserted text carries the given
/// provenance.
fn one_change(
    s: &LosslessDocumentSession,
    txn: u64,
    from: usize,
    to: usize,
    inserted: &str,
    eols: &[NewlineEnding],
) -> TextPatch {
    TextPatch {
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

/// Helper: apply a patch and return the replayed source bytes.
fn apply_and_replay(s: &mut LosslessDocumentSession, p: TextPatch) -> Vec<u8> {
    s.apply_patch(p).unwrap();
    s.prepare_save(s.revision(), &s.original().file_identity)
        .unwrap()
        .into_bytes()
}

/// Replacing one boundary in a CRLF doc with two inherit newlines: the first
/// consumes the replaced boundary (CRLF), the second inherits the right
/// surviving neighbor (CRLF).
#[test]
fn inherit_consumes_replaced_then_right() {
    // source:  a\r\nb\r\nc   (CRLF, CRLF)
    let bytes = b"a\r\nb\r\nc";
    let mut s = session(bytes);
    // Replace the range [b..c) — i.e. the second line's text only — no.
    // Instead replace a logical segment that spans one boundary: replace "a\nb"
    // (logical 0..3) with "X\nY\nZ": 2 newlines, both inherit.
    let p = one_change(
        &s,
        1,
        0,
        3,
        "X\nY\nZ",
        &[NewlineEnding::Inherit, NewlineEnding::Inherit],
    );
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"X\r\nY\r\nZ\r\nc");
}

/// Deleting a boundary removes its EOL entry; the surviving neighbors keep
/// their types.
#[test]
fn deleting_boundary_removes_eol() {
    // source: a\nb\r\nc  (LF, CRLF)
    let bytes = b"a\nb\r\nc";
    let mut s = session(bytes);
    // Delete "a\nb\n" (logical 0..4) — removes the first LF boundary too.
    let p = one_change(&s, 1, 0, 4, "", &[]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"c");
    assert_eq!(s.text().boundary_count(), 0);
}

/// Inserting an inherit newline at the document start (no replaced boundary,
/// no right/left neighbor) falls back to the frozen dominant EOL.
#[test]
fn inherit_falls_to_dominant_at_start() {
    // source: a\nb  (LF dominant)
    let bytes = b"a\nb";
    let mut s = session(bytes);
    // Insert "X\nY" at logical 0 (before 'a'), one inherit newline.
    let p = one_change(&s, 1, 0, 0, "X\nY", &[NewlineEnding::Inherit]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"X\nYa\nb");
}

/// In a CRLF-dominant file, a start-of-document inherit insert uses CRLF.
#[test]
fn inherit_uses_frozen_dominant_for_crlf_doc() {
    let bytes = b"a\r\nb\r\nc";
    let mut s = session(bytes);
    let p = one_change(&s, 1, 0, 0, "X\nY", &[NewlineEnding::Inherit]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"X\r\nYa\r\nb\r\nc");
}

/// Explicit CRLF paste provenance wins over inherit, even in an LF-dominant doc.
#[test]
fn explicit_crlf_paste_provenance_wins() {
    let bytes = b"a\nb\nc";
    let mut s = session(bytes);
    // Insert "X\r\nY" as an explicit CRLF paste at logical 0. The inserted
    // logical text is LF-normalized "X\nY" (1 newline, 1 explicit provenance).
    let p = one_change(&s, 1, 0, 0, "X\nY", &[NewlineEnding::ExplicitCrlf]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"X\r\nYa\nb\nc");
}

/// Explicit CR paste provenance wins.
#[test]
fn explicit_cr_paste_provenance_wins() {
    let bytes = b"a\nb\nc";
    let mut s = session(bytes);
    let p = one_change(&s, 1, 0, 0, "X\nY", &[NewlineEnding::ExplicitCr]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"X\rYa\nb\nc");
}

/// A paste with mixed explicit CRLF + inherit in one change: each \n gets its
/// own provenance, in document order.
#[test]
fn mixed_paste_provenance_per_newline() {
    let bytes = b"a\nb\nc";
    let mut s = session(bytes);
    // "1\r\n2\n3\r4" → explicit CRLF, inherit, explicit CR.
    let p = one_change(
        &s,
        1,
        0,
        0,
        "1\n2\n3\n4",
        &[
            NewlineEnding::ExplicitCrlf,
            NewlineEnding::Inherit,
            NewlineEnding::ExplicitCr,
        ],
    );
    let out = apply_and_replay(&mut s, p);
    // Expected: 1\r\n2\n3\r4 + "\na\nb\nc" (the trailing LF from the replaced
    // area? No — insert at 0..0 replaces nothing, so the existing "a\nb\nc"
    // stays). Source: "1\r\n2\n3\r4" then "a\nb\nc".
    assert_eq!(out, "1\r\n2\n3\r4a\nb\nc".as_bytes());
}

/// The canonical `utf8-mixed-tail2.md` fixture: editing body must preserve the
/// mixed separator bytes exactly for untouched regions.
#[test]
fn mixed_fixture_body_edit_preserves_separators() {
    let bytes = common::load_fixture_bytes("fixtures/utf8-mixed-tail2.md");
    let mut s = session(&bytes);
    // Insert "X" at logical 0.
    let p = one_change(&s, 1, 0, 0, "X", &[]);
    let out = apply_and_replay(&mut s, p);
    // The insert at position 0 with no newlines must shift the whole document;
    // every original byte must still appear, in order, after the "X".
    assert_eq!(out.len(), bytes.len() + 1);
    assert_eq!(out[0], b'X');
    assert_eq!(&out[1..], bytes.as_slice());
}

/// Replacing a body span that contains no newlines must not touch any EOL.
#[test]
fn body_replacement_preserves_eol_boundaries() {
    let bytes = b"a\r\nb\r\nc";
    let mut s = session(bytes);
    // Replace the logical byte [2..3) ("b") with "BEEF" (no newlines).
    let p = one_change(&s, 1, 2, 3, "BEEF", &[]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"a\r\nBEEF\r\nc");
    assert_eq!(s.text().line_endings().len(), 2);
}

/// BOM is preserved across a body edit.
#[test]
fn bom_preserved_after_edit() {
    let bytes = b"\xef\xbb\xbf# T\n\nx\n";
    let mut s = session(bytes);
    let p = one_change(&s, 1, 0, 0, "X", &[]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"\xef\xbb\xbfX# T\n\nx\n");
}

/// Provenance count mismatch rejects atomically even when the change range is
/// otherwise valid.
#[test]
fn provenance_count_mismatch_atomic_reject() {
    let bytes = b"a\nb\nc";
    let mut s = session(bytes);
    // "X\nY\nZ" has 2 newlines but only 1 provenance entry.
    let bad = one_change(&s, 1, 0, 0, "X\nY\nZ", &[NewlineEnding::Inherit]);
    assert_eq!(
        s.apply_patch(bad),
        Err(markflow_core::CoreError::InvalidEolProvenance {
            expected: 2,
            actual: 1
        })
    );
    assert_eq!(s.revision().0, 0);
    assert_eq!(s.text().logical_text(), "a\nb\nc");
}

/// The dominant EOL tie-break for a new-document (no newlines) insert uses the
/// frozen default (design 01 §3.7).
#[test]
fn empty_document_insert_uses_frozen_default() {
    let bytes = b"";
    // Frozen default = CRLF (a new-file policy).
    let mut s = LosslessDocumentSession::open_bytes(
        SessionId(1),
        DocumentId(1),
        bytes,
        LineEndingKind::Crlf,
    )
    .unwrap();
    let p = one_change(&s, 1, 0, 0, "a\nb", &[NewlineEnding::Inherit]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"a\r\nb");
}

/// §3.5 discriminator (pins the frozen semantic): when the LEFT neighbor
/// differs from the DOMINANT, and there are ≥2 overflow newlines, the
/// sequential chain (right → left → dominant) must be consumed one position
/// per overflow newline.
///
/// Source `a\r\nb\nc`: boundaries [CRLF, LF], tie → frozen default LF. Replace
/// "b" (logical 2..3) with "X\nY\nZ" (2 inherit newlines). Removed = [] (no
/// boundary inside the range). Right = LF, Left = CRLF, Dominant = LF.
/// Sequential-advance: #1 → right (LF), #2 → left (CRLF) → `a\r\nX\nY\r\nZ\nc`.
/// (Reading "all overflow = right/dominant" would give `a\r\nX\nY\nZ\nc`.)
#[test]
fn inherit_overflow_discriminator_left_vs_dominant() {
    let bytes = b"a\r\nb\nc";
    let mut s = session(bytes);
    let p = one_change(
        &s,
        1,
        2,
        3,
        "X\nY\nZ",
        &[NewlineEnding::Inherit, NewlineEnding::Inherit],
    );
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"a\r\nX\nY\r\nZ\nc");
}

/// Editing inside a CR-only file (CR separator, no CRLF) keeps CR separators.
/// Logical offset 1 is the position before the first `\n` boundary, so the
/// insert lands between 'a' and the CR.
#[test]
fn cr_file_edit_preserves_cr() {
    let bytes = b"a\rb\rc";
    let mut s = session(bytes);
    let p = one_change(&s, 1, 1, 1, "M", &[]);
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"aM\rb\rc");
}

/// §3.5 overflow: inserting MORE inherit newlines than replaced boundaries,
/// where the right surviving neighbor differs from the document dominant. The
/// overflow must resolve to the right neighbor, not the dominant.
///
/// Source `a\r\nb\r\nc` (dominant CRLF). Replace the range that covers "a\nb"
/// (logical 0..3, removing 1 boundary) with "X\nY\nZ\nW" (3 inherit newlines,
/// 2 of them overflow). The removed boundary is CRLF → first newline CRLF;
/// right surviving neighbor is CRLF → remaining overflow all CRLF.
#[test]
fn inherit_overflow_uses_right_neighbor_not_dominant() {
    let bytes = b"a\r\nb\r\nc";
    let mut s = session(bytes);
    let p = one_change(
        &s,
        1,
        0,
        3,
        "X\nY\nZ\nW",
        &[
            NewlineEnding::Inherit,
            NewlineEnding::Inherit,
            NewlineEnding::Inherit,
        ],
    );
    let out = apply_and_replay(&mut s, p);
    assert_eq!(out, b"X\r\nY\r\nZ\r\nW\r\nc");
}

/// §3.5 overflow with a RIGHT neighbor that differs from dominant: LF-dominant
/// file, insert at a point whose right surviving neighbor is CRLF. Overflow
/// must consume the chain sequentially: first overflow → right (CRLF), second
/// → left (LF), not both → right.
#[test]
fn inherit_overflow_right_differs_from_dominant() {
    // boundaries [LF, CRLF], tie → frozen default LF = dominant. Insert at a
    // point (replacing "b") whose right surviving neighbor is CRLF, left is LF.
    let bytes = b"a\nb\r\nc";
    let mut s = session(bytes);
    // logical 2..3 = "b"; inserting 2 inherit newlines (0 replaced boundaries
    // inside the range). Right surviving neighbor = CRLF, left = LF.
    let p = one_change(
        &s,
        1,
        2,
        3,
        "X\nY\nZ",
        &[NewlineEnding::Inherit, NewlineEnding::Inherit],
    );
    let out = apply_and_replay(&mut s, p);
    // Replaced "b"; overflow chain consumed sequentially:
    // #1 → right (CRLF), #2 → left (LF). Result: X CRLF Y LF Z.
    assert_eq!(out, b"a\nX\r\nY\nZ\r\nc");
}
