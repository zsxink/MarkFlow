//! Real Tauri dispatcher contract harness — P0 skeleton (tasks 1.6).
//!
//! Exercises the CURRENT `read_file` / `write_file` commands through a real
//! `tauri::test::mock_builder` App, a real `tauri::State<AppState>` obtained
//! from that App, and a real filesystem. This is NOT a mock of the frontend
//! `invoke` — the command functions and Tauri's state manager are real; only
//! the window/WebView layer is the mock runtime.
//!
//! Contract being pinned (umbrella design.md Bridge 最小 API):
//!   read_file(path: String, State<AppState>) -> Result<String, String>
//!   write_file(path: String, content: String, State<AppState>) -> Result<(), String>
//!
//! Future Core commands (`open_lossless_document`, `apply_document_patch`,
//! `prepare_document_save`, `guarded_atomic_write`, ...) must be appended here
//! with the same real-dispatcher pattern before any Slice 1B work is accepted.
//!
//! Evidence: run `cargo test --manifest-path src-tauri/Cargo.toml
//! dispatcher_contract -- --nocapture` and capture stdout for the run record.

#![cfg(test)]

use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::commands::files::{read_file, write_file};
use crate::state::AppState;

fn temp_dir(tag: &str) -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("markflow_dispatch_{}_{}_{}", std::process::id(), n, tag));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn sha256_hex(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for b in digest { let _ = std::fmt::Write::write_fmt(&mut hex, format_args!("{:02x}", b)); }
    hex
}

fn build_app() -> tauri::App<tauri::test::MockRuntime> {
    let state = AppState::new().expect("AppState::new must construct in test env");
    tauri::test::mock_builder()
        .manage(state)
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("mock Tauri app build")
}

#[test]
fn read_write_roundtrip_preserves_bytes() {
    let app = build_app();
    let dir = temp_dir("roundtrip");
    let path = dir.join("doc.md");
    let content = "# 标题\r\n\r\nBody paragraph 中文。\r\nAnother line.\r\n\r\n";
    let path_s = path.to_str().expect("utf8 path").to_string();

    let st = app.state::<AppState>();
    write_file(path_s.clone(), content.to_string(), st).expect("write_file must succeed");
    let st = app.state::<AppState>();
    let out = read_file(path_s, st).expect("read_file must succeed");

    assert_eq!(out, content, "round-trip must preserve CRLF + CJK bytes");
    eprintln!("[dispatcher] read_write_roundtrip_preserves_bytes ok");
    eprintln!("[dispatcher]   command=write_file arg=path,content payload_sha256={}", sha256_hex(content));
    eprintln!("[dispatcher]   command=read_file  arg=path           payload_sha256={}", sha256_hex(&out));
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn read_write_roundtrip_preserves_bom() {
    let app = build_app();
    let dir = temp_dir("bom");
    let path = dir.join("bom.md");
    let content = "\u{feff}# Title\n\nbody\n\n";
    let path_s = path.to_str().expect("utf8 path").to_string();

    let st = app.state::<AppState>();
    write_file(path_s.clone(), content.to_string(), st).expect("write_file");
    let st = app.state::<AppState>();
    let out = read_file(path_s, st).expect("read_file");
    assert_eq!(out, content, "UTF-8 BOM must round-trip byte-identically");
    eprintln!("[dispatcher] read_write_roundtrip_preserves_bom ok (bom_preserved=true)");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn read_missing_file_returns_error() {
    let app = build_app();
    let missing = std::env::temp_dir()
        .join(format!("markflow_dispatch_missing_{}.md", std::process::id()))
        .to_str().expect("utf8").to_string();
    let st = app.state::<AppState>();
    let res = read_file(missing, st);
    assert!(res.is_err(), "read_file on a missing path must return Err");
    eprintln!("[dispatcher] read_missing_file_returns_error ok (error mapped, no panic)");
}

#[test]
fn read_oversized_file_returns_error() {
    let app = build_app();
    let dir = temp_dir("oversize");
    let path = dir.join("huge.md");
    // Sparse file: logical length 100MB+1 without allocating disk blocks.
    let f = fs::File::create(&path).expect("create sparse file");
    f.set_len(100 * 1024 * 1024 + 1).expect("set sparse length");
    drop(f);

    let st = app.state::<AppState>();
    let res = read_file(path.to_str().expect("utf8").to_string(), st);
    assert!(res.is_err(), "read_file must reject >100MB files");
    eprintln!("[dispatcher] read_oversized_file_returns_error ok (100MB guard enforced)");
    fs::remove_dir_all(&dir).ok();
}
