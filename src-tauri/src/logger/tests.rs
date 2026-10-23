use super::*;

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
