use super::*;
use std::sync::{Arc, Mutex};
use tracing_subscriber::fmt::time::FormatTime;

fn test_date(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

/// Create an isolated temp log dir for one test and remove any previous one.
fn temp_log_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "markflow-logger-tests-{}-{}",
        std::process::id(),
        name
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn make_writer(dir: PathBuf, day: Arc<Mutex<NaiveDate>>) -> LocalDateRollingWriter {
    let mut writer = LocalDateRollingWriter::new(dir);
    writer.today = Box::new(move || *day.lock().unwrap());
    writer
}

#[test]
fn rolls_file_on_local_date_change() {
    // 注入日期模拟跨本地午夜：两条记录写入旧日期，跨天后写入新日期。
    let dir = temp_log_dir("roll");
    let day = Arc::new(Mutex::new(test_date(2026, 10, 23)));
    let mut writer = make_writer(dir.clone(), day.clone());

    writer.write_all(b"day one\n").unwrap();
    writer.write_all(b"day one again\n").unwrap();
    *day.lock().unwrap() = test_date(2026, 10, 24);
    writer.write_all(b"day two\n").unwrap();
    writer.flush().unwrap();

    assert!(dir.join("markflow.log.2026-10-23").exists());
    assert!(dir.join("markflow.log.2026-10-24").exists());
    assert_eq!(
        fs::read_to_string(dir.join("markflow.log.2026-10-23")).unwrap(),
        "day one\nday one again\n"
    );
    assert_eq!(
        fs::read_to_string(dir.join("markflow.log.2026-10-24")).unwrap(),
        "day two\n"
    );
}

#[test]
fn same_day_writes_reuse_file() {
    let dir = temp_log_dir("same-day");
    let day = Arc::new(Mutex::new(test_date(2026, 10, 24)));
    let mut writer = make_writer(dir.clone(), day.clone());

    writer.write_all(b"first\n").unwrap();
    writer.write_all(b"second\n").unwrap();
    writer.flush().unwrap();

    // 同日写入不切换文件：目录里只有当天一个日志文件。
    let entries: Vec<_> = fs::read_dir(&dir).unwrap().collect();
    assert_eq!(entries.len(), 1);
    assert!(dir.join("markflow.log.2026-10-24").exists());
    assert_eq!(
        fs::read_to_string(dir.join("markflow.log.2026-10-24")).unwrap(),
        "first\nsecond\n"
    );
}

#[test]
fn timer_uses_local_offset_without_z() {
    // 时间戳从 UTC `Z` 改为本地偏移（`+08:00`）属外部可见格式变化；
    // 仓库内无解析依赖：e2e/run.mjs 仅复制/脱敏日志文件，src/infra/logger.ts
    // 仅转发事件，均不解析时间戳。
    let mut buf = String::new();
    let mut sink = tracing_subscriber::fmt::format::Writer::new(&mut buf);
    ChronoLocal::rfc_3339().format_time(&mut sink).unwrap();

    // RFC 3339 with local offset (e.g. 2026-10-24T08:22:34.274+08:00): never
    // a trailing Z, always ±HH:MM at the end, local date prefix.
    assert!(!buf.contains('Z'));
    let offset = &buf[buf.len() - 6..];
    assert!(offset.starts_with('+') || offset.starts_with('-'));
    assert_eq!(&offset[3..4], ":");
    assert!(buf.starts_with(&Local::now().format("%Y-%m-%dT").to_string()));
}

#[test]
fn masks_url_credentials() {
    assert_eq!(
        redact_url_secrets("https://user:secret@example.com/path"),
        "https://***@example.com/path"
    );
}

#[test]
fn masks_bare_token_without_colon() {
    // A token with no ':' before '@' is still a credential and must be masked.
    assert_eq!(
        redact_url_secrets("https://token@example.com/path"),
        "https://***@example.com/path"
    );
}

#[test]
fn masks_query_strings() {
    assert_eq!(
        redact_url_secrets("https://example.com/api?token=abc123&x=1"),
        "https://example.com/api?<redacted>"
    );
}

#[test]
fn masks_credentials_and_query() {
    assert_eq!(
        redact_url_secrets("https://user:pass@host/api?key=zzz"),
        "https://***@host/api?<redacted>"
    );
}

#[test]
fn masks_private_path_filename() {
    // Private absolute path: filename masked, one parent dir kept for context,
    // user home prefix collapsed to '...'.
    let out = redact_message("/Users/alice/docs/note.md");
    assert_eq!(out, ".../docs/<redacted-file>");
}

#[test]
fn leaves_short_paths_untouched() {
    // Too few components to reveal private home/prefix — left as-is.
    assert_eq!(redact_message("/tmp/note.md"), "/tmp/note.md");
    assert_eq!(redact_message("note.md"), "note.md");
    assert_eq!(
        redact_message("relative/path/note.md"),
        "relative/path/note.md"
    );
}

#[test]
fn masks_path_inside_redacted_url_message() {
    // A path embedded in a free-text message (with trailing punctuation) is
    // still masked as a whole token.
    let out = redact_message("Failed to open /Users/alice/docs/note.md: permission denied");
    assert!(out.contains(".../docs/<redacted-file>"));
    assert!(!out.contains("note.md"));
}

#[test]
fn truncates_long_message() {
    let long = "x".repeat(600);
    let out = redact_message(&long);
    assert!(out.contains("truncated"));
    assert!(out.len() < long.len());
}
