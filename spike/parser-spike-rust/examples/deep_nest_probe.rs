// P4A task 6.2 — deep-nesting probe: reproduces the markdown-rs elimination
// findings recorded in spike/parser-spike/PROPERTY-REPORT.md §3.2 on the
// mixed-container chain `("> - " × 10000) + "leaf"` (a 40KB document nesting
// blockquote/list 10k deep).
//
// Usage (from the REPOSITORY ROOT):
//
//   # 1) DEFAULT main-thread stack (~8MB): markdown-rs aborts with a stack
//      overflow in deep AST recursion (exit code 134, uncatchable by
//      catch_unwind). Expected output on rustc 1.96: "fatal runtime error:
//      stack overflow, aborting" and no timing line.
//   cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml \
//     --example deep_nest_probe -- markdown-rs
//
//   # 2) 512MB worker thread: the parse COMPLETES but takes ~11.1s on the
//      reference machine (30001 constructs) — far beyond the 5s per-case
//      budget of the P6-heavy property class (the property harness therefore
//      records TIMEOUT for this case; see property-rust.json).
//   cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml \
//     --example deep_nest_probe -- markdown-rs --big-stack
//
//   # Contrast candidates (both complete quickly; run with --big-stack to
//      survive their own recursion depth):
//   cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml \
//     --example deep_nest_probe -- pulldown-cmark --big-stack   # ~0.8s, 30000
//   cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml \
//     --example deep_nest_probe -- comrak --big-stack           # ~1ms, 149
//
// Reference measurements (run 20260829-055341-p4a-5ac06b5, macOS arm64,
// rustc 1.96.0): markdown-rs 11111ms / 30001 constructs (--big-stack),
// pulldown-cmark 766–771ms / 30000, comrak ~1ms / 149; Lezer (TS side)
// 677ms — see PROPERTY-REPORT.md §3.2 and §4.
use std::time::Instant;

fn parse(cand: &str, doc: &str) -> Result<usize, String> {
    let cs = match cand {
        "markdown-rs" => parser_spike_rust::adapters::parse_mdast(doc)?,
        "pulldown-cmark" => parser_spike_rust::adapters::parse_pulldown(doc)?,
        "comrak" => parser_spike_rust::adapters::parse_comrak(doc)?,
        other => return Err(format!("unknown candidate '{other}' (use markdown-rs | pulldown-cmark | comrak)")),
    };
    Ok(cs.len())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cand = args
        .iter()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .unwrap_or_else(|| "markdown-rs".to_string());
    let big_stack = args.iter().any(|a| a == "--big-stack");
    let doc = format!("{}leaf", "> - ".repeat(10000));
    let doc_utf16: usize = doc.chars().map(|c| c.len_utf16() as usize).sum();

    if !big_stack {
        // Default main-thread stack: markdown-rs aborts inside parse (stack
        // overflow during deep AST recursion/drop) before the timing line.
        let t0 = Instant::now();
        let doc = doc.clone();
        let cand2 = cand.clone();
        let r = std::panic::catch_unwind(move || parse(&cand2, &doc));
        println!(
            "{cand} (default main-thread stack): {:.0}ms -> {:?}",
            t0.elapsed().as_secs_f64() * 1000.0,
            r.map(|r| r.map(|n| n.to_string()).unwrap_or_else(|e| format!("ERR {e}")))
        );
    } else {
        let handle = std::thread::Builder::new()
            .stack_size(512 * 1024 * 1024)
            .spawn(move || {
                let t0 = Instant::now();
                let r = std::panic::catch_unwind(|| parse(&cand, &doc));
                let ms = t0.elapsed().as_secs_f64() * 1000.0;
                let outcome = match r {
                    Ok(Ok(n)) => format!("{n} constructs"),
                    Ok(Err(e)) => format!("ERR {e}"),
                    Err(_) => "PANIC".to_string(),
                };
                println!(
                    "{cand} (512MB stack, doc {doc_utf16} UTF-16 units): {ms:.0}ms -> {outcome}"
                );
            })
            .expect("spawn worker");
        handle.join().expect("worker panicked");
    }
}
