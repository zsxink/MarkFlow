use super::*;

#[test]
fn extract_title_basic() {
    let html = b"<html><head><title>My Page</title></head></html>";
    assert_eq!(extract_title_from_bytes(html).as_deref(), Some("My Page"));
}

#[test]
fn extract_title_case_insensitive() {
    let html = b"<HTML><HEAD><TITLE>Test</TITLE></HEAD></HTML>";
    assert_eq!(extract_title_from_bytes(html).as_deref(), Some("Test"));
}

#[test]
fn extract_title_with_surrounding_text() {
    let html = b"<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Hello World</title></head><body></body></html>";
    assert_eq!(
        extract_title_from_bytes(html).as_deref(),
        Some("Hello World")
    );
}

#[test]
fn extract_title_empty_returns_none() {
    let html = b"<html><head><title></title></head></html>";
    assert!(extract_title_from_bytes(html).is_none());
}

#[test]
fn extract_title_no_title_tag() {
    let html = b"<html><head></head><body>No title here</body></html>";
    assert!(extract_title_from_bytes(html).is_none());
}

#[test]
fn extract_title_truncates_long_title() {
    let long_title = "A".repeat(600);
    let html = format!("<title>{}</title>", long_title);
    let result = extract_title_from_bytes(html.as_bytes()).unwrap();
    assert_eq!(result.len(), MAX_TITLE_LEN);
}

#[test]
fn extract_title_truncates_multibyte_utf8_safely() {
    // 200 CJK chars = 600 bytes — truncation at 512 must not panic
    let long_title = "中".repeat(200);
    let html = format!("<title>{}</title>", long_title);
    let result = extract_title_from_bytes(html.as_bytes()).unwrap();
    // Result should be valid UTF-8 and <= MAX_TITLE_LEN bytes
    assert!(result.len() <= MAX_TITLE_LEN);
    assert!(String::from_utf8(result.into_bytes()).is_ok());
}

#[test]
fn extract_title_whitespace_trimmed() {
    let html = b"<title>  Spaced  </title>";
    assert_eq!(extract_title_from_bytes(html).as_deref(), Some("Spaced"));
}

#[test]
fn extract_title_short_buffer() {
    assert!(extract_title_from_bytes(b"hi").is_none());
}
