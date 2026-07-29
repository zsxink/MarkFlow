use std::fs;
use std::path::Path;

use markflow_core::{
    DocumentId, DocumentSession, Revision, SessionId, SourceRange, TextChange, TextPatch,
    TransactionId,
};

pub const FIXTURE_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/lossless");

// Each test binary only uses a subset of these helpers; annotate individually
// to avoid `dead_code` in binaries that don't call a particular helper.

#[allow(dead_code)]
pub fn open(bytes: &[u8]) -> DocumentSession {
    DocumentSession::open_bytes(SessionId(7), DocumentId(11), bytes).unwrap()
}

#[allow(dead_code)]
pub fn fixture(name: &str) -> Vec<u8> {
    fs::read(Path::new(FIXTURE_ROOT).join(name)).unwrap()
}

#[allow(dead_code)]
pub fn patch_at(
    revision: Revision,
    tx: u64,
    start: usize,
    end: usize,
    replacement: &str,
) -> TextPatch {
    TextPatch {
        transaction_id: TransactionId(tx),
        base_revision: revision,
        changes: vec![TextChange {
            range: SourceRange::new(revision, start, end),
            replacement: replacement.to_string(),
        }],
        selection_after: None,
    }
}

#[allow(dead_code)]
pub fn change(revision: Revision, start: usize, end: usize, replacement: &str) -> TextChange {
    TextChange {
        range: SourceRange::new(revision, start, end),
        replacement: replacement.to_string(),
    }
}

#[allow(dead_code)]
pub fn patch(
    revision: Revision,
    transaction_id: u64,
    changes: Vec<TextChange>,
    selection_after: Option<markflow_core::Selection>,
) -> TextPatch {
    TextPatch {
        transaction_id: TransactionId(transaction_id),
        base_revision: revision,
        changes,
        selection_after,
    }
}
