//! Shared helpers for the fixture-driven byte-contract tests.
//!
//! Each integration test binary re-compiles this module and uses a different
//! subset of helpers, so dead-code is expected across binaries.
#![allow(dead_code)]

use std::path::PathBuf;

use markflow_core::{LineEndingKind, LogicalByteOffset, NewlineEnding, OriginalSnapshot};

pub const FIXTURES_ROOT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../tests/fixtures/byte-contract"
);

/// Root of the canonical fixture tree (the dir containing `fixtures/`,
/// `manifest.json`, `l1-intents.json`).
pub fn byte_contract_root() -> PathBuf {
    PathBuf::from(FIXTURES_ROOT)
}

/// Full path to a fixture file referenced by the manifest.
pub fn fixture_path(rel: &str) -> PathBuf {
    byte_contract_root().join(rel)
}

/// The canonical byte fixtures manifest.
#[derive(serde::Deserialize)]
pub struct Manifest {
    pub fixtures: Vec<ManifestFixture>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFixture {
    pub id: String,
    pub file: String,
    pub byte_length: usize,
    pub sha256: String,
    pub bom: String,
    pub eol: String,
    pub trailing: usize,
}

pub fn load_manifest() -> Manifest {
    let path = byte_contract_root().join("manifest.json");
    let text = std::fs::read_to_string(&path).expect("manifest.json readable");
    serde_json::from_str(&text).expect("manifest.json parses")
}

/// The canonical L1 intents.
#[derive(serde::Deserialize, Clone)]
pub struct Intent {
    pub id: String,
    pub description: String,
    pub from: usize,
    pub to: usize,
    pub inserted: String,
}

#[derive(serde::Deserialize)]
pub struct IntentsFile {
    pub intents: Vec<Intent>,
}

pub fn load_intents() -> Vec<Intent> {
    let path = byte_contract_root().join("l1-intents.json");
    let text = std::fs::read_to_string(&path).expect("l1-intents.json readable");
    let parsed: IntentsFile = serde_json::from_str(&text).expect("l1-intents.json parses");
    parsed.intents
}

/// The raw bytes of a fixture file.
pub fn load_fixture_bytes(rel: &str) -> Vec<u8> {
    std::fs::read(fixture_path(rel)).expect("fixture readable")
}

/// The L1 oracle: `input[0..from] + inserted + input[to..]` (raw byte splice).
pub fn l1_oracle(input: &[u8], intent: &Intent) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len() + intent.inserted.len());
    out.extend_from_slice(&input[..intent.from]);
    out.extend_from_slice(intent.inserted.as_bytes());
    out.extend_from_slice(&input[intent.to..]);
    out
}

/// Derive explicit per-newline provenance from raw inserted bytes. This models
/// a paste/drop that read the raw payload before CodeMirror normalization
/// (design 01 §3.8) and matches the harness oracle exactly (raw splice).
///
/// Also returns the LF-normalized logical inserted text.
pub fn provenance_from_inserted(inserted: &str) -> (String, Vec<NewlineEnding>) {
    let bytes = inserted.as_bytes();
    let mut logical = String::with_capacity(inserted.len());
    let mut endings = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                logical.push('\n');
                endings.push(NewlineEnding::ExplicitCrlf);
                i += 2;
            }
            b'\r' => {
                logical.push('\n');
                endings.push(NewlineEnding::ExplicitCr);
                i += 1;
            }
            b'\n' => {
                logical.push('\n');
                endings.push(NewlineEnding::ExplicitLf);
                i += 1;
            }
            _ => {
                let ch = inserted[i..].chars().next().expect("valid UTF-8");
                logical.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    (logical, endings)
}

/// Resolve the manifest `eol` string into a frozen default EOL for the session
/// open (used for the dominant-tie fallback; the fixtures themselves carry
/// concrete EOLs so this only matters for tie-breaks).
pub fn default_eol_for(eol: &str) -> LineEndingKind {
    match eol {
        "crlf" => LineEndingKind::Crlf,
        "cr" => LineEndingKind::Cr,
        _ => LineEndingKind::Lf,
    }
}

/// A convenience assertion helper: logical offset from a source offset.
pub fn logical_for_source(
    session: &markflow_core::LosslessDocumentSession,
    source: usize,
) -> LogicalByteOffset {
    session
        .byte_for_source_byte(markflow_core::SourceByteOffset(source))
        .unwrap_or_else(|e| panic!("source->logical {source}: {e:?}"))
}

/// Check that the given fixture path exists (fail-fast with a clear message).
pub fn assert_fixture_tree() {
    let root = byte_contract_root();
    assert!(
        root.join("manifest.json").is_file(),
        "byte-contract manifest missing at {}",
        root.display()
    );
    assert!(
        root.join("fixtures/utf8-lf-tail1.md").is_file(),
        "byte-contract fixtures missing at {}",
        root.join("fixtures").display()
    );
}

/// Guard: open a snapshot's line-ending map length matches the logical text.
pub fn assert_snapshot_consistent(snapshot: &OriginalSnapshot, logical: &str) {
    let expected_boundaries = logical.bytes().filter(|b| *b == b'\n').count();
    assert_eq!(
        snapshot.line_endings.len(),
        expected_boundaries,
        "EOL map boundary count must match logical newline count"
    );
}
