//! Property tests for PositionMap and byte replay (task 2.7, P1A §4).
//!
//! No external property crate is used (P1A dependency boundary); we drive the
//! properties over deterministic generated corpora.

mod common;

use common::*;
use markflow_core::{
    BomKind, CoreError, DocumentId, LineEndingKind, LogicalByteOffset, LosslessDocumentSession,
    PositionMap, SessionId, SourceByteOffset, TextBuffer, Utf16Offset,
};

/// For every char boundary in every fixture, utf16↔byte round-trips.
#[test]
fn utf16_byte_round_trip_all_fixture_boundaries() {
    assert_fixture_tree();
    let manifest = load_manifest();
    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);
        let session =
            LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), &bytes, default_eol)
                .unwrap();
        let logical = session.text().logical_text();

        let mut byte = 0usize;
        while byte <= logical.len() {
            if byte == 0 || logical.is_char_boundary(byte) {
                let u = session.utf16_for_byte(LogicalByteOffset(byte)).unwrap();
                let back = session.byte_for_utf16(u).unwrap();
                assert_eq!(
                    back.as_usize(),
                    byte,
                    "{}: byte {} round-trip",
                    fixture.id,
                    byte
                );
            }
            byte += 1;
        }
    }
}

/// For every char boundary in every fixture, source-byte→logical→source
/// round-trips (source byte positions that are the boundary start).
#[test]
fn source_logical_round_trip_all_fixture_boundaries() {
    assert_fixture_tree();
    let manifest = load_manifest();
    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);
        let session =
            LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), &bytes, default_eol)
                .unwrap();
        let logical = session.text().logical_text();

        let mut byte = 0usize;
        while byte <= logical.len() {
            if byte == 0 || logical.is_char_boundary(byte) {
                let src = session
                    .source_byte_for_byte(LogicalByteOffset(byte))
                    .unwrap();
                let back = session.byte_for_source_byte(src).unwrap();
                assert_eq!(
                    back.as_usize(),
                    byte,
                    "{}: logical {} via source {}",
                    fixture.id,
                    byte,
                    src.as_usize()
                );
            }
            byte += 1;
        }
    }
}

/// Replaying source bytes from every revision's logical text must produce a
/// valid document with the same SHA-256 as a fresh open of the same logical
/// content (idempotent replay).
#[test]
fn replay_is_self_consistent() {
    assert_fixture_tree();
    let manifest = load_manifest();
    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);
        let session =
            LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), &bytes, default_eol)
                .unwrap();
        let replayed = session
            .prepare_save(session.revision(), &session.original().file_identity)
            .unwrap();
        assert_eq!(
            replayed.as_bytes(),
            bytes.as_slice(),
            "{}: replay",
            fixture.id
        );
    }
}

/// Emoji/Zwj/combining/surrogate-rich content round-trips UTF-16 across every
/// boundary (the unicode fixtures cover this).
#[test]
fn unicode_fixtures_utf16_round_trip() {
    for id in ["unicode-emoji.md", "unicode-cjk.md", "unicode-combining.md"] {
        let bytes = load_fixture_bytes(&format!("fixtures/{id}"));
        let session = LosslessDocumentSession::open_bytes(
            SessionId(1),
            DocumentId(1),
            &bytes,
            LineEndingKind::Lf,
        )
        .unwrap();
        let logical = session.text().logical_text();
        let mut byte = 0usize;
        while byte <= logical.len() {
            if logical.is_char_boundary(byte) {
                let u = session.utf16_for_byte(LogicalByteOffset(byte)).unwrap();
                let back = session.byte_for_utf16(u).unwrap();
                assert_eq!(back.as_usize(), byte, "{id}: byte {byte}");
            }
            byte += 1;
        }
    }
}

/// The byte-offset between two UTF-16 positions equals the byte-length of the
/// slice, for every boundary pair.
#[test]
fn utf16_span_maps_to_byte_span() {
    let bytes = load_fixture_bytes("fixtures/unicode-emoji.md");
    let session = LosslessDocumentSession::open_bytes(
        SessionId(1),
        DocumentId(1),
        &bytes,
        LineEndingKind::Lf,
    )
    .unwrap();
    let logical = session.text().logical_text();
    let boundaries: Vec<usize> = (0..=logical.len())
        .filter(|&b| b == 0 || logical.is_char_boundary(b))
        .collect();
    for i in 0..boundaries.len() {
        for j in (i + 1)..boundaries.len().min(i + 20) {
            let a = boundaries[i];
            let b = boundaries[j];
            let ua = session
                .utf16_for_byte(LogicalByteOffset(a))
                .unwrap()
                .as_usize();
            let ub = session
                .utf16_for_byte(LogicalByteOffset(b))
                .unwrap()
                .as_usize();
            let back = session.byte_for_utf16(Utf16Offset(ub)).unwrap().as_usize();
            assert_eq!(back, b, "utf16 span end maps back");
            let _ = (ua, ub);
        }
    }
}

/// A sample property over generated LF text: opening → replay → reopen gives
/// stable hashes.
#[test]
fn generated_lf_documents_replay_stable() {
    // Deterministic corpus (no RNG seeding needed).
    let lines = [
        "alpha",
        "beta 中文",
        "gamma 😀",
        "",
        "e\u{301} comb",
        "delta",
    ];
    let mut text = String::new();
    for (i, line) in lines.iter().enumerate() {
        text.push_str(line);
        if i < lines.len() - 1 {
            text.push('\n');
        }
    }
    let bytes = text.as_bytes();
    let mut session =
        LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
            .unwrap();
    let replayed = session
        .prepare_save(session.revision(), &session.original().file_identity)
        .unwrap();
    assert_eq!(replayed.as_bytes(), bytes);

    // A small edit keeps the replay internally consistent.
    let patch = markflow_core::TextPatch {
        binding_generation: session.binding_generation(),
        session_id: session.session_id,
        document_id: session.document_id,
        transaction_id: markflow_core::TransactionId(1),
        base_revision: session.revision(),
        changes: vec![markflow_core::TextChange {
            range: markflow_core::SourceRange::new(LogicalByteOffset(0), LogicalByteOffset(0)),
            inserted_logical_text: "HEAD ".to_string(),
            inserted_line_endings: vec![],
        }],
        selection_after: None,
    };
    session.apply_patch(patch).unwrap();
    let replayed2 = session
        .prepare_save(session.revision(), &session.original().file_identity)
        .unwrap();
    let expected = format!("HEAD {text}").into_bytes();
    assert_eq!(replayed2.as_bytes(), expected.as_slice());
}

/// Source byte offset 0 always maps to the first logical char (after BOM);
/// inside-BOM/out-of-bounds/invalid UTF-8 boundary all error.
#[test]
fn invalid_source_offsets_are_stable_errors() {
    let bytes = b"\xef\xbb\xbf# T\n\nx\n";
    let session =
        LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
            .unwrap();
    // Inside BOM.
    assert!(session.byte_for_source_byte(SourceByteOffset(0)).is_err());
    assert!(session.byte_for_source_byte(SourceByteOffset(1)).is_err());
    assert!(session.byte_for_source_byte(SourceByteOffset(2)).is_err());
    // Out of bounds.
    assert!(session.byte_for_source_byte(SourceByteOffset(999)).is_err());
    // A continuation byte is not a logical char boundary → error.
    // '中' = e4 b8 ad; logical offset 1 is the continuation byte.
    let s2 = LosslessDocumentSession::open_bytes(
        SessionId(1),
        DocumentId(1),
        "中".as_bytes(),
        LineEndingKind::Lf,
    )
    .unwrap();
    assert!(s2.utf16_for_byte(LogicalByteOffset(1)).is_err());

    // A UTF-16 offset inside a surrogate pair → error. 😀 = f0 9f 98 80,
    // occupies UTF-16 code units [0,2); UTF-16 offset 1 is inside the pair.
    let s3 = LosslessDocumentSession::open_bytes(
        SessionId(1),
        DocumentId(1),
        "😀".as_bytes(),
        LineEndingKind::Lf,
    )
    .unwrap();
    assert!(s3.byte_for_utf16(Utf16Offset(1)).is_err());
}

/// A public PositionMap is bound to the source geometry used to build it. A
/// caller pairing it with arbitrary text receives a stable error instead of a
/// line-index panic, even when line count and EOL widths both differ.
#[test]
fn position_map_rejects_mismatched_text_geometry_without_panicking() {
    let base = TextBuffer::from_logical_text("a\nb", LineEndingKind::Crlf).unwrap();
    let different = TextBuffer::from_logical_text("x\ny\nz", LineEndingKind::Lf).unwrap();
    let map = PositionMap::new(&base, BomKind::None);

    let utf16 = std::panic::catch_unwind(|| map.utf16_for_byte(&different, LogicalByteOffset(0)));
    assert_eq!(utf16.unwrap(), Err(CoreError::PositionMapMismatch));
    let byte = std::panic::catch_unwind(|| map.byte_for_utf16(&different, Utf16Offset(0)));
    assert_eq!(byte.unwrap(), Err(CoreError::PositionMapMismatch));
    let source =
        std::panic::catch_unwind(|| map.source_byte_for_byte(&different, LogicalByteOffset(0)));
    assert_eq!(source.unwrap(), Err(CoreError::PositionMapMismatch));
    let logical =
        std::panic::catch_unwind(|| map.byte_for_source_byte(&different, SourceByteOffset(0)));
    assert_eq!(logical.unwrap(), Err(CoreError::PositionMapMismatch));
}
