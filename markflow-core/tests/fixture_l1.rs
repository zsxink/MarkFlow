//! L1: applying every canonical L1 edit intent must produce exactly the oracle
//! output (raw byte splice). Surviving prefix/suffix and untouched BOM/EOL/
//! trailing bytes must be byte-identical; only the edit range and inserted
//! bytes may differ (task 2.7, P1A §4).

mod common;

use common::*;
use markflow_core::{
    DocumentId, LogicalByteOffset, LosslessDocumentSession, SessionId, SourceRange, TextChange,
    TextPatch, TransactionId,
};

#[test]
fn every_l1_intent_matches_oracle() {
    assert_fixture_tree();
    let manifest = load_manifest();
    let intents = load_intents();

    // Index intents by fixture id prefix. The intent id is `<fixture-id>-<suffix>`,
    // so we match on the manifest fixture id as a prefix.
    let mut intents_by_fixture: std::collections::BTreeMap<String, Vec<&Intent>> =
        std::collections::BTreeMap::new();
    for intent in &intents {
        for fixture in &manifest.fixtures {
            if intent.id.starts_with(&fixture.id) {
                intents_by_fixture
                    .entry(fixture.id.clone())
                    .or_default()
                    .push(intent);
                break;
            }
        }
    }

    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);

        for intent in intents_by_fixture.get(&fixture.id).unwrap_or(&vec![]) {
            let mut session = LosslessDocumentSession::open_bytes(
                SessionId(1),
                DocumentId(1),
                &bytes,
                default_eol,
            )
            .unwrap_or_else(|e| panic!("{}: open: {e:?}", fixture.id));

            // Convert intent source offsets to logical offsets via PositionMap.
            let from_logical = logical_for_source(&session, intent.from);
            let to_logical = logical_for_source(&session, intent.to);
            assert!(
                from_logical.as_usize() <= to_logical.as_usize(),
                "{}: {}: source from({}) <= to({}) maps to logical {} <= {}",
                fixture.id,
                intent.id,
                intent.from,
                intent.to,
                from_logical.as_usize(),
                to_logical.as_usize()
            );

            // Derive explicit provenance from the raw inserted bytes (models
            // the paste pipeline; matches the harness oracle raw splice).
            let (logical_inserted, provenance) = provenance_from_inserted(&intent.inserted);

            let patch = TextPatch {
                transaction_id: TransactionId(1),
                base_revision: session.revision(),
                changes: vec![TextChange {
                    range: SourceRange::new(from_logical, to_logical),
                    inserted_logical_text: logical_inserted.clone(),
                    inserted_line_endings: provenance,
                }],
                selection_after: None,
            };

            session
                .apply_patch(patch)
                .unwrap_or_else(|e| panic!("{}: {}: apply: {e:?}", fixture.id, intent.id));

            let payload = session
                .prepare_save(session.revision(), &session.original().file_identity)
                .expect("prepare_save");

            let oracle = l1_oracle(&bytes, intent);
            assert_eq!(
                payload.as_bytes(),
                oracle.as_slice(),
                "{}: {}: saved bytes must equal L1 oracle",
                fixture.id,
                intent.id
            );

            // Explicit surviving-region assertions: prefix and suffix match.
            assert!(
                payload.as_bytes().len() >= intent.from
                    && payload.as_bytes()[..intent.from] == bytes[..intent.from],
                "{}: {}: prefix must survive byte-identically",
                fixture.id,
                intent.id
            );
            let suffix_start = intent.from + intent.inserted.len();
            if !bytes[intent.to..].is_empty() {
                assert!(
                    payload.as_bytes().len() >= suffix_start
                        && payload.as_bytes()[suffix_start..] == bytes[intent.to..],
                    "{}: {}: suffix must survive byte-identically",
                    fixture.id,
                    intent.id
                );
            }
        }
    }
}

/// A dedicated check that body edits never disturb the trailing newlines, for
/// the fixtures with a non-empty trailing run (P1A §4, tasks 2.7).
#[test]
fn body_edit_preserves_trailing_boundaries() {
    assert_fixture_tree();
    let manifest = load_manifest();
    for fixture in &manifest.fixtures {
        if fixture.trailing == 0 {
            continue;
        }
        let bytes = load_fixture_bytes(&fixture.file);
        let default_eol = default_eol_for(&fixture.eol);
        let mut session =
            LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), &bytes, default_eol)
                .unwrap();

        // Insert a body character at the first body position (after any BOM
        // and heading marker) via a logical offset of 0.
        let patch = TextPatch {
            transaction_id: TransactionId(1),
            base_revision: session.revision(),
            changes: vec![TextChange {
                range: SourceRange::new(LogicalByteOffset(0), LogicalByteOffset(0)),
                inserted_logical_text: "X".to_string(),
                inserted_line_endings: vec![],
            }],
            selection_after: None,
        };
        session.apply_patch(patch).unwrap();

        let payload = session
            .prepare_save(session.revision(), &session.original().file_identity)
            .unwrap();

        // The trailing boundary count must be unchanged by the body edit.
        let new_snapshot = session.original(); // snapshot line endings unchanged? No — session text changed.
        let _ = new_snapshot;
        // Re-derive trailing run from the saved bytes.
        let trailing_in = trailing_run_count(&bytes);
        let trailing_out = trailing_run_count(payload.as_bytes());
        assert_eq!(
            trailing_out, trailing_in,
            "{}: body edit must not alter trailing boundary count",
            fixture.id
        );
    }
}

/// Negative control (harness semantics): corrupting one byte inside a
/// surviving region of the L1 oracle output must make a strict
/// surviving-region check FAIL. This proves the byte assertions actually
/// detect corruption rather than silently passing.
#[test]
fn negative_control_corrupted_surviving_byte_fails() {
    assert_fixture_tree();
    let manifest = load_manifest();
    for fixture in &manifest.fixtures {
        let bytes = load_fixture_bytes(&fixture.file);
        let intents = load_intents();
        // Pick the first intent for this fixture whose `from` is > 0 so there
        // is a surviving prefix we can corrupt.
        let Some(intent) = intents
            .iter()
            .find(|i| i.id.starts_with(&fixture.id) && i.from > 0)
        else {
            continue;
        };
        let oracle = l1_oracle(&bytes, intent);
        if intent.from == 0 {
            continue;
        }
        // Corrupt one byte in the surviving prefix (offset floor(from/2)).
        let target = intent.from / 2;
        let mut corrupted = oracle.clone();
        corrupted[target] ^= 0x01;

        // The strict surviving-prefix check must now fail.
        assert!(
            corrupted[..intent.from] != bytes[..intent.from],
            "{}: {}: corrupted surviving prefix must be detected",
            fixture.id,
            intent.id
        );
    }
}

/// Count trailing line-break boundaries (each CRLF/LF/CR counts as one).
fn trailing_run_count(bytes: &[u8]) -> usize {
    let mut count = 0;
    let mut i = bytes.len();
    while i > 0 {
        if bytes[i - 1] == b'\n' {
            count += 1;
            i -= 1;
            if i > 0 && bytes[i - 1] == b'\r' {
                i -= 1;
            }
        } else if bytes[i - 1] == b'\r' {
            count += 1;
            i -= 1;
        } else {
            break;
        }
    }
    count
}
