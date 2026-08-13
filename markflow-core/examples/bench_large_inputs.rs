//! Large-input benchmark for P1A (design 01 §6, P1A §4).
//!
//! Generates 1/10/50 MiB synthetic documents and measures:
//! - `OriginalSnapshot::from_bytes` (open)
//! - `TextBuffer::to_source_bytes` round-trip (zero-patch prepare-save)
//! - one mid-file patch + a second `to_source_bytes` (replay after edit)
//!
//! Run with: `cargo run --example bench_large_inputs --release`

use std::time::Instant;

use markflow_core::{
    LineEndingKind, LogicalByteOffset, LosslessDocumentSession, SourceRange, TextChange, TextPatch,
    TransactionId,
};

fn main() {
    for mib in [1usize, 10, 50] {
        let bytes = make_document(mib);
        let len = bytes.len();
        let t0 = Instant::now();
        let mut session = LosslessDocumentSession::open_bytes(
            markflow_core::SessionId(1),
            markflow_core::DocumentId(1),
            &bytes,
            LineEndingKind::Lf,
        )
        .expect("open");
        let open = t0.elapsed();

        let t1 = Instant::now();
        let payload = session
            .prepare_save(session.revision(), &session.original().file_identity)
            .expect("prepare");
        let prepare = t1.elapsed();
        debug_assert_eq!(payload.len(), len);

        let t2 = Instant::now();
        let mid = len / 2;
        let p = TextPatch {
            transaction_id: TransactionId(1),
            base_revision: session.revision(),
            changes: vec![TextChange {
                range: SourceRange::new(LogicalByteOffset(mid), LogicalByteOffset(mid)),
                inserted_logical_text: "edited".to_string(),
                inserted_line_endings: vec![],
            }],
            selection_after: None,
        };
        session.apply_patch(p).expect("patch");
        let patch = t2.elapsed();

        let t3 = Instant::now();
        let payload2 = session
            .prepare_save(session.revision(), &session.original().file_identity)
            .expect("prepare2");
        let prepare2 = t3.elapsed();
        debug_assert_eq!(payload2.len(), len + "edited".len());

        println!(
            "{mib:>3} MiB | open {open:>8.2?} | prepare-save {prepare:>8.2?} | patch {patch:>8.2?} | prepare-after-edit {prepare2:>8.2?} | hash {}",
            session.confirmed_hash().hex(),
        );
    }
}

fn make_document(mib: usize) -> Vec<u8> {
    let target = mib * 1024 * 1024;
    let mut out = Vec::with_capacity(target);
    let line = "# 标题 Title\n\n正文段落 paragraph with 中文 and emoji 😀\n\n";
    while out.len() < target {
        out.extend_from_slice(line.as_bytes());
    }
    out
}
