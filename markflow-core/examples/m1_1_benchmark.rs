use std::hint::black_box;
use std::time::{Duration, Instant};

use markflow_core::{
    DocumentId, DocumentSession, SessionId, SourceRange, TextChange, TextPatch, TransactionId,
};

const MIB: usize = 1024 * 1024;
const SIZES_MIB: [usize; 3] = [1, 10, 50];

fn main() {
    println!("size_mib,source_bytes,open_ms,patch_ms,save_ms");
    for size_mib in SIZES_MIB {
        let source = generated_markdown(size_mib * MIB);

        let open_started = Instant::now();
        let mut session =
            DocumentSession::open_bytes(SessionId(1), DocumentId(1), &source).unwrap();
        let open_elapsed = open_started.elapsed();

        let center = session.text().len_bytes() / 2;
        let patch_started = Instant::now();
        let revision = session.revision();
        session
            .apply_patch(TextPatch {
                transaction_id: TransactionId(1),
                base_revision: revision,
                changes: vec![TextChange {
                    range: SourceRange::new(revision, center, center + 8),
                    replacement: "MARKFLOW".to_string(),
                }],
                selection_after: None,
            })
            .unwrap();
        let patch_elapsed = patch_started.elapsed();

        let save_started = Instant::now();
        let payload = session.save_payload();
        black_box(payload.as_bytes());
        let save_elapsed = save_started.elapsed();

        println!(
            "{size_mib},{},{:.3},{:.3},{:.3}",
            source.len(),
            millis(open_elapsed),
            millis(patch_elapsed),
            millis(save_elapsed)
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
