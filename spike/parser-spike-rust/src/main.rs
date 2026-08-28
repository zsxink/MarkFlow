// P4A task 6.1 — Rust parser-candidate comparison harness.
//
// Usage (run from the REPOSITORY ROOT — the fixture/expectation paths are
// resolved relative to it; running from the spike crate directory with these
// relative paths will NOT work):
//   cargo run --release --manifest-path spike/parser-spike-rust/Cargo.toml -- \
//     --fixtures-dir tests/fixtures/byte-contract \
//     --extra-fixture spike/parser-spike/extra-fixtures/spike-extra-task-inline.md \
//     --expectations spike/parser-spike/expectations.json \
//     --out <evidence-dir> \
//     [--perf-dir "$(node -p 'require("os").tmpdir()')/markflow-p4a-spike"]
//
// For every canonical fixture (logical LF text: BOM stripped, CRLF/CR -> LF)
// each candidate is parsed (catch_unwind — a panic is recorded, never fatal),
// converted to UTF-16 ranges, and validated against the SAME frozen
// expectations.json the TypeScript (Lezer) candidate uses.
//
// Exit code: 0 = no INVALID ranges (round-trip failures) in any candidate;
// 1 = at least one INVALID (wrong/out-of-bounds range) — that is a hard
// finding, mismatches/coverage gaps are recorded data instead.
use parser_spike_rust::{adapters, common, property, validate};
use common::{CoordMap, SpikeConstruct};
use serde::Serialize;
use std::collections::BTreeMap;
use std::time::Instant;
use validate::{FixtureValidation, Summary};

#[derive(Serialize)]
struct FixtureReport {
    fixtureId: String,
    origin: String,
    byteLength: usize,
    logicalLength: usize,
    parseThrew: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    parseError: Option<String>,
    panicked: bool,
    fallbackBehavior: String,
    validation: FixtureValidation,
}

#[derive(Serialize)]
struct CandidateReport {
    id: String,
    language: String,
    package: String,
    version: String,
    nativeCoordinateSystem: String,
    reportedCoordinateSystem: String,
    coordinateProbe: serde_json::Value,
    parseErrorPolicy: String,
    markerSource: String,
    fixtures: Vec<FixtureReport>,
    summary: Summary,
}

#[derive(Serialize)]
struct PerfResult {
    fixture: String,
    candidate: String,
    byteLength: usize,
    fullParseMs: Sample,
}

#[derive(Serialize)]
struct Sample {
    samples: Vec<f64>,
    median: f64,
}

fn median(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs[xs.len() / 2]
}

struct Args {
    fixtures_dir: String,
    extra_fixture: String,
    expectations: String,
    out: String,
    perf_dir: Option<String>,
    /// task 6.2 mode: run the range→source property suite instead of the
    /// fixture comparison; writes <out>/property-rust.json
    property: bool,
    /// with --property: skip the heavy deep-nesting/huge-token class
    skip_heavy: bool,
}

fn parse_args() -> Args {
    let mut a = Args {
        fixtures_dir: String::new(),
        extra_fixture: String::new(),
        expectations: String::new(),
        out: String::new(),
        perf_dir: None,
        property: false,
        skip_heavy: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        // boolean flags take no value
        match k.as_str() {
            "--property" => {
                a.property = true;
                continue;
            }
            "--skip-heavy" => {
                a.skip_heavy = true;
                continue;
            }
            _ => {}
        }
        let v = it.next().unwrap_or_default();
        match k.as_str() {
            "--fixtures-dir" => a.fixtures_dir = v,
            "--extra-fixture" => a.extra_fixture = v,
            "--expectations" => a.expectations = v,
            "--out" => a.out = v,
            "--perf-dir" => a.perf_dir = Some(v),
            _ => {}
        }
    }
    if a.property {
        if a.out.is_empty() {
            eprintln!("usage: parser-spike-rust --property --out <dir> [--skip-heavy]");
            std::process::exit(2);
        }
        return a;
    }
    if a.fixtures_dir.is_empty() || a.expectations.is_empty() || a.out.is_empty() {
        eprintln!("usage: parser-spike-rust --fixtures-dir <dir> --extra-fixture <file> --expectations <file> --out <dir> [--perf-dir <dir>]");
        eprintln!("       parser-spike-rust --property --out <dir> [--skip-heavy]");
        std::process::exit(2);
    }
    a
}

/// FNV-1a64 content canary (NOT a cryptographic hash — the cryptographic
/// SHA-256 for each fixture is recorded in the TS report and the run manifest).
fn fnv1a64(bytes: &[u8]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{h:016x}")
}

struct LoadedFixture {
    id: String,
    origin: String,
    byte_length: usize,
    logical: String,
    #[allow(dead_code)]
    digest: String,
}

fn load_fixtures(args: &Args) -> Result<Vec<LoadedFixture>, String> {
    let manifest_path = format!("{}/manifest.json", args.fixtures_dir);
    let manifest: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Some(fixtures) = manifest["fixtures"].as_array() {
        for fx in fixtures {
            let id = fx["id"].as_str().unwrap_or_default().to_string();
            let file = fx["file"].as_str().unwrap_or_default();
            let bom = fx["bom"].as_str().unwrap_or("none").to_string();
            let bytes = std::fs::read(format!("{}/{file}", args.fixtures_dir)).map_err(|e| e.to_string())?;
            let logical = common::to_logical_text(&bytes, &bom);
            out.push(LoadedFixture {
                byte_length: bytes.len(),
                digest: fnv1a64(&bytes),
                origin: "canonical".into(),
                id,
                logical,
            });
        }
    }
    // spike-local extra fixture (same bytes the TS harness reads)
    let bytes = std::fs::read(&args.extra_fixture).map_err(|e| e.to_string())?;
    let logical = common::to_logical_text(&bytes, "none");
    out.push(LoadedFixture {
        byte_length: bytes.len(),
        digest: fnv1a64(&bytes),
        origin: "spike-synthetic".into(),
        id: "spike-extra-task-inline".into(),
        logical,
    });
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
fn run_candidate(
    id: &str,
    package: &str,
    version: &str,
    native: &str,
    probe: serde_json::Value,
    marker_source: &str,
    fixtures: &[LoadedFixture],
    expects: &BTreeMap<String, validate::FixtureExpect>,
) -> CandidateReport {
    let mut reports: Vec<FixtureReport> = Vec::new();
    let mut total = Summary::default();
    for fx in fixtures {
        let spec = expects.get(&fx.id);
        let require_all = spec.map(|s| s.require_all).unwrap_or(false);
        let empty: Vec<validate::ExpectEntry> = Vec::new();
        let entries: &[validate::ExpectEntry] = spec.map(|s| s.expect.as_slice()).unwrap_or(&empty);

        // catch_unwind: a parser panic on malformed input is a recorded finding.
        let result = std::panic::catch_unwind(|| match id {
            "markdown-rs" => adapters::parse_mdast(&fx.logical),
            "pulldown-cmark" => adapters::parse_pulldown(&fx.logical),
            "comrak" => adapters::parse_comrak(&fx.logical),
            _ => Err(format!("unknown candidate {id}")),
        });
        let (parse_threw, parse_error, panicked, constructs): (bool, Option<String>, bool, Vec<SpikeConstruct>) =
            match result {
                Ok(Ok(cs)) => (false, None, false, cs),
                Ok(Err(e)) => (true, Some(e), false, vec![]),
                Err(_) => (true, Some("PANIC (catch_unwind caught)".into()), true, vec![]),
            };

        let map = CoordMap::build(&fx.logical);
        let validation = validate::validate_fixture(&map, &fx.logical, &constructs, entries, require_all);
        let kinds: Vec<String> = {
            let mut ks: Vec<String> = validation.constructs.iter().map(|c| c.kind.clone()).collect();
            ks.sort();
            ks.dedup();
            ks
        };
        let fallback = if parse_threw {
            format!(
                "PARSE FAILED (panicked={panicked}): {}",
                parse_error.clone().unwrap_or_default()
            )
        } else {
            format!(
                "no throw; returned {} constructs (kinds: {})",
                validation.constructs.len(),
                if kinds.is_empty() { "none".into() } else { kinds.join(",") }
            )
        };
        total.r#match += validation.summary.r#match;
        total.convention += validation.summary.convention;
        total.spurious += validation.summary.spurious;
        total.invalid += validation.summary.invalid;
        total.miss += validation.summary.miss;
        total.contentMismatches += validation.summary.contentMismatches;
        total.markerGaps += validation.summary.markerGaps;
        total.markerMismatches += validation.summary.markerMismatches;

        reports.push(FixtureReport {
            fixtureId: fx.id.clone(),
            origin: fx.origin.clone(),
            byteLength: fx.byte_length,
            logicalLength: fx.logical.len(),
            parseThrew: parse_threw,
            parseError: parse_error,
            panicked,
            fallbackBehavior: fallback,
            validation,
        });
    }
    CandidateReport {
        id: id.to_string(),
        language: "Rust".into(),
        package: package.to_string(),
        version: version.to_string(),
        nativeCoordinateSystem: native.to_string(),
        reportedCoordinateSystem:
            "utf16-code-units (converted from native via CoordMap; verified by round-trip)".into(),
        coordinateProbe: probe,
        parseErrorPolicy: "Result-based API + std::panic::catch_unwind; a throw/panic is recorded per fixture".into(),
        markerSource: marker_source.to_string(),
        fixtures: reports,
        summary: total,
    }
}

fn run_perf(dir: &str, out_dir: &str) -> Result<(), String> {
    let mut results = Vec::new();
    for name in ["perf-1m.md", "perf-10m.md", "perf-varied-1m.md", "perf-varied-10m.md"] {
        let bytes = std::fs::read(format!("{dir}/{name}")).map_err(|e| format!("{name}: {e}"))?;
        let text = common::to_logical_text(&bytes, "none");
        for (id, run) in [
            ("markdown-rs", adapters::parse_mdast as fn(&str) -> Result<Vec<SpikeConstruct>, String>),
            ("pulldown-cmark", adapters::parse_pulldown as fn(&str) -> Result<Vec<SpikeConstruct>, String>),
            ("comrak", adapters::parse_comrak as fn(&str) -> Result<Vec<SpikeConstruct>, String>),
        ] {
            let mut samples = Vec::new();
            for _ in 0..3 {
                let t0 = Instant::now();
                let r = std::panic::catch_unwind(|| run(&text));
                let dt = t0.elapsed().as_secs_f64() * 1000.0;
                if r.is_err() || matches!(&r, Ok(Err(_))) {
                    return Err(format!("perf parse failed for {id} on {name}"));
                }
                samples.push(dt);
            }
            results.push(PerfResult {
                fixture: name.to_string(),
                candidate: id.to_string(),
                byteLength: bytes.len(),
                fullParseMs: Sample { median: median(samples.clone()), samples },
            });
        }
    }
    let report = serde_json::json!({
        "spike": "parser-candidate-performance",
        "task": "P4A 6.1 (Rust candidates performance probe)",
        "generatedAt": chrono_now(),
        "note": "spike-grade wall-clock probe on one machine; 3 iterations; not the frozen SLO benchmark (design/05 §6)",
        "results": results,
    });
    let file = format!("{out_dir}/perf-rust.json");
    std::fs::write(&file, serde_json::to_string_pretty(&report).map_err(|e| e.to_string())? + "\n")
        .map_err(|e| e.to_string())?;
    println!("[spike] wrote {file}");
    Ok(())
}

fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("unix-secs:{}", now.as_secs())
}

fn main() {
    let args = parse_args();

    if args.property {
        if let Err(e) = property::run_property_suite(&args.out, args.skip_heavy) {
            eprintln!("[spike] property suite failed: {e}");
            std::process::exit(1);
        }
        return;
    }

    let expectations_raw = std::fs::read_to_string(&args.expectations).expect("read expectations.json");
    let expectations: validate::ExpectationsFile =
        serde_json::from_str(&expectations_raw).expect("parse expectations.json");
    let fixtures = load_fixtures(&args).expect("load fixtures");

    // coordinate probes: '# 😀' — distinguishes UTF-8 byte offsets (end=6)
    // from UTF-16 code units (end=5) and unicode code points (end=4).
    let probe_text = "# \u{1F600}";
    let mdast_probe = adapters::probe_mdast(probe_text);
    let pulldown_probe = adapters::probe_pulldown(probe_text);
    let comrak_probe = adapters::probe_comrak(probe_text);
    let probe_note =
        "probe '# \u{1F600}': utf8-byte end=6, utf16 end=4, codepoint end=3; text UTF-8 len=6, UTF-16 len=4".to_string();

    let candidates = vec![
        run_candidate(
            "markdown-rs",
            "markdown (wooorm/markdown-rs, mdast)",
            "1.0.0",
            "utf8-byte offsets into the parsed string (mdast position.offset)",
            serde_json::json!({
                "input": probe_text,
                "headingStartEndOffset": mdast_probe,
                "note": probe_note,
                "verdict": if mdast_probe.map(|(_, e)| e) == Some(6) { "utf8-bytes (CONFIRMED)" } else { "unexpected — inspect" }
            }),
            "NONE — mdast nodes carry position only; no delimiter nodes (markerGaps expected)",
            &fixtures,
            &expectations.fixtures,
        ),
        run_candidate(
            "pulldown-cmark",
            "pulldown-cmark",
            "0.13.4",
            "utf8-byte offsets into the parsed string (event Range<usize>)",
            serde_json::json!({
                "input": probe_text,
                "headingStartEventRange": pulldown_probe,
                "note": probe_note,
                "verdict": if pulldown_probe.map(|r| r.1) == Some(6) { "utf8-bytes (CONFIRMED)" } else { "unexpected — inspect" }
            }),
            "Start/End event ranges carry opening/closing delimiter spans; TaskListMarker event carries the checkbox span",
            &fixtures,
            &expectations.fixtures,
        ),
        run_candidate(
            "comrak",
            "comrak",
            "0.54.0",
            "1-based line/column sourcepos (byte columns), converted via line table",
            serde_json::json!({
                "input": probe_text,
                "headingSourcepos": comrak_probe,
                "note": probe_note + "; heading sourcepos end column reveals byte-vs-char column semantics",
                "verdict": if comrak_probe.map(|(_, _, _, sc)| sc) == Some(6) { "byte columns CONFIRMED (end col 6 = last byte of the 4-byte emoji, NOT one-past-end)" } else { "unexpected — inspect" }
            }),
            "NO delimiter nodes; TaskItem.symbol_sourcepos carries the checkbox span; no other marker spans",
            &fixtures,
            &expectations.fixtures,
        ),
    ];

    let total_invalid: usize = candidates.iter().map(|c| c.summary.invalid).sum();
    let report = serde_json::json!({
        "spike": "parser-candidate-range-comparison",
        "change": "refactor-lossless-live-preview",
        "task": "P4A 6.1 (Rust candidates)",
        "generatedAt": chrono_now(),
        "fixtureBasis": {
            "manifest": "tests/fixtures/byte-contract/manifest.json",
            "logicalTextRule": "source bytes decoded UTF-8, BOM stripped, CRLF/CR normalized to LF (Core LineEndingMap owns EOL restoration; out of scope here)",
            "reportedCoordinateSystem": "utf16-code-units (half-open [start,end) on the logical LF text)",
            "expectations": "spike/parser-spike/expectations.json (frozen reference, same file as the TS candidate)",
            "contentDigestNote": "digest field is FNV-1a64 canary (not cryptographic); SHA-256 recorded in the TS report and run manifest"
        },
        "candidates": candidates,
    });
    std::fs::create_dir_all(&args.out).expect("create out dir");
    let file = format!("{}/report-rust.json", args.out);
    std::fs::write(&file, serde_json::to_string_pretty(&report).unwrap() + "\n").expect("write report-rust.json");
    println!("[spike] wrote {file}");

    if let Some(dir) = &args.perf_dir {
        if let Err(e) = run_perf(dir, &args.out) {
            eprintln!("[spike] perf failed: {e}");
            std::process::exit(1);
        }
    }

    if total_invalid > 0 {
        eprintln!("[spike] FAIL: {total_invalid} INVALID ranges across candidates");
        std::process::exit(1);
    }
    println!("[spike] OK: 0 INVALID ranges across all Rust candidates");
}
