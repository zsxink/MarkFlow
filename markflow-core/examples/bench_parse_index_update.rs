use std::hint::black_box;
use std::time::{Duration, Instant};

use markflow_core::{
    DocumentId, DocumentSession, SessionId, SourceRange, TextChange, TextPatch, TransactionId,
};

const MIB: usize = 1024 * 1024;
const SIZES_MIB: [usize; 3] = [1, 10, 50];

fn main() {
    println!(
        "size_mib,source_bytes,initial_parse_ms,patch_affected_ranges_ms,post_patch_full_parse_ms"
    );
    for size_mib in SIZES_MIB {
        let source = generated_markdown(size_mib * MIB);
        let mut session =
            DocumentSession::open_bytes(SessionId(1), DocumentId(1), &source).unwrap();

        let initial_started = Instant::now();
        let mut parse_index = session.parse_index().parse_index;
        black_box(parse_index.blocks.len());
        let initial_elapsed = initial_started.elapsed();

        let center = session.text().len_bytes() / 2;
        let patch = TextPatch {
            transaction_id: TransactionId(size_mib as u64),
            base_revision: session.revision(),
            changes: vec![TextChange {
                range: SourceRange::new(session.revision(), center, center + 8),
                replacement: "MARKFLOW".to_string(),
            }],
            selection_after: None,
        };

        let affected_started = Instant::now();
        let affected = parse_index.update_after_patch(&patch);
        black_box(affected);
        let affected_elapsed = affected_started.elapsed();

        session.apply_patch(patch).unwrap();
        let post_patch_started = Instant::now();
        let outcome = session.parse_index();
        black_box(outcome.parse_index.blocks.len());
        let post_patch_elapsed = post_patch_started.elapsed();

        println!(
            "{size_mib},{},{:.3},{:.3},{:.3}",
            source.len(),
            millis(initial_elapsed),
            millis(affected_elapsed),
            millis(post_patch_elapsed)
        );
    }
}

fn generated_markdown(target_bytes: usize) -> Vec<u8> {
    let mut line = String::from("## Generated benchmark paragraph ");
    line.push_str(&"x".repeat(992));
    line.push('\n');

    let mut source = Vec::with_capacity(target_bytes + line.len());
    while source.len() + line.len() <= target_bytes {
        source.extend_from_slice(line.as_bytes());
    }
    source.resize(target_bytes, b'x');
    source
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}
