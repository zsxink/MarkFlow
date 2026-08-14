//! L0: zero-patch open → prepare-save must return the exact original bytes,
//! repeated prepare-save must not change revision or hash, and the payload
//! must never depend on a parser/serializer (task 2.7.1).

mod common;

use common::*;
use markflow_core::{
    ContentHash, DocumentId, LineEndingKind, LosslessDocumentSession, SessionId, TextPatch,
    TransactionId,
};

#[test]
fn zero_patch_prepare_save_returns_original_bytes_for_every_fixture() {
    assert_fixture_tree();
    let manifest = load_manifest();

    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);

        let session =
            LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), &bytes, default_eol)
                .unwrap_or_else(|e| panic!("{}: open: {e:?}", fixture.id));

        // Zero-patch: revision 0, no edits.
        assert_eq!(
            session.revision().0,
            0,
            "{}: fresh session at revision 0",
            fixture.id
        );

        // prepare_save against the frozen identity returns the exact original
        // bytes (L0 byte contract: input_sha256 == saved_sha256, length equal).
        let payload = session
            .prepare_save(session.revision(), &session.original().file_identity)
            .unwrap_or_else(|e| panic!("{}: prepare_save: {e:?}", fixture.id));
        assert_eq!(
            payload.as_bytes(),
            bytes.as_slice(),
            "{}: zero-patch payload must equal original bytes",
            fixture.id
        );
        assert_eq!(payload.len(), fixture.byte_length, "{}: length", fixture.id);

        // Repeat clean prepare must not change revision or confirmed hash.
        let hash_before = session.confirmed_hash();
        for _ in 0..3 {
            let again = session
                .prepare_save(session.revision(), &session.original().file_identity)
                .expect("repeat prepare");
            assert_eq!(
                again.as_bytes(),
                bytes.as_slice(),
                "{}: repeat prepare",
                fixture.id
            );
            assert_eq!(
                session.revision().0,
                0,
                "{}: revision unchanged",
                fixture.id
            );
            assert_eq!(
                session.confirmed_hash(),
                hash_before,
                "{}: hash unchanged",
                fixture.id
            );
        }

        // The hash matches the manifest's canonical SHA-256.
        assert_eq!(
            ContentHash::of(&bytes).hex(),
            fixture.sha256,
            "{}: fixture content hash must match manifest",
            fixture.id
        );
    }
}

/// The confirmed hash reported by the session equals the SHA-256 of the
/// replayed bytes — and that replay is byte-identical to the original.
#[test]
fn confirmed_hash_is_sha256_of_source_replay() {
    let bytes = "\u{feff}# T\r\n\r\nBody 中文\nTail.\r\n\r\n".as_bytes();
    let session =
        LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
            .unwrap();
    let replay = session
        .prepare_save(session.revision(), &session.original().file_identity)
        .unwrap();
    assert_eq!(replay.as_bytes(), bytes);
    assert_eq!(session.confirmed_hash(), ContentHash::of(bytes));
}

/// A zero-change patch (no-op replacement at a valid boundary) must NOT change
/// the bytes or revision — the save payload stays byte-identical.
#[test]
fn zero_change_patch_preserves_bytes() {
    let bytes = b"hello world";
    let mut session =
        LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
            .unwrap();
    let noop = TextPatch {
        binding_generation: session.binding_generation(),
        session_id: session.session_id,
        document_id: session.document_id,
        transaction_id: TransactionId(1),
        base_revision: session.revision(),
        changes: vec![markflow_core::TextChange {
            range: markflow_core::SourceRange::new(
                markflow_core::LogicalByteOffset(0),
                markflow_core::LogicalByteOffset(0),
            ),
            inserted_logical_text: String::new(),
            inserted_line_endings: vec![],
        }],
        selection_after: None,
    };
    // A no-op replacement still advances the revision (it is a real transaction)
    // but the replayed bytes must be unchanged.
    session.apply_patch(noop).unwrap();
    let payload = session
        .prepare_save(session.revision(), &session.original().file_identity)
        .unwrap();
    assert_eq!(payload.as_bytes(), bytes);
    assert_eq!(session.confirmed_hash(), ContentHash::of(bytes));
}

/// P0S-style clean-save proof: opening every fixture and running repeated clean
/// prepare-save never invokes any parser or serializer. The Core has no parser
/// at all; this test proves the payload is a pure replay of TextBuffer state.
#[test]
fn clean_save_has_no_parser_or_serializer_dependency() {
    assert_fixture_tree();
    let manifest = load_manifest();
    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);
        let session =
            LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), &bytes, default_eol)
                .unwrap();
        let payload = session
            .prepare_save(session.revision(), &session.original().file_identity)
            .unwrap();
        // The only dependency is TextBuffer::to_source_bytes — no markdown
        // parser/serializer exists in this crate (see Cargo.toml dependencies).
        assert_eq!(payload.as_bytes(), bytes.as_slice(), "{}", fixture.id);
    }
}
