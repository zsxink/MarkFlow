use crate::http::{validate_external_url, MAX_TITLE_LEN, MAX_TITLE_READ_BYTES};
use crate::state::AppState;
use futures::StreamExt;
use tauri::State;

/// Fetch the `<title>` from a remote page.
///
/// Safety measures:
/// - Same URL/DNS validation as image fetches
/// - Streaming read, hard 256 KB cap
/// - Title string truncated to 512 chars
/// - Concurrency bounded by semaphore
async fn fetch_page_title_inner(url: &str, state: &AppState) -> Result<String, String> {
    let _permit = state
        .http_semaphore
        .acquire()
        .await
        .map_err(|_| "Semaphore closed".to_string())?;

    let response = crate::http::fetch_with_redirects(
        &state.http_client,
        url,
        5,
        validate_external_url,
        Some(MAX_TITLE_READ_BYTES as u64),
    )
    .await?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // Stream at most MAX_TITLE_READ_BYTES, looking for <title>...</title>
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::with_capacity(8192);
    let mut total_read = 0usize;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Failed to read response body".to_string())?;
        total_read += chunk.len();

        if total_read > MAX_TITLE_READ_BYTES {
            return Err("No title found".into());
        }

        buffer.extend_from_slice(&chunk);

        // Once we have enough data, try to extract the title
        if let Some(title) = extract_title_from_bytes(&buffer) {
            return Ok(title);
        }
    }

    // Stream ended — try extracting from whatever we read
    extract_title_from_bytes(&buffer).ok_or_else(|| "No title found".into())
}

/// Scan a byte buffer for `<title>...</title>` (case-insensitive).
/// Performs a single pass without allocating a lowercased copy.
fn extract_title_from_bytes(buf: &[u8]) -> Option<String> {
    // Case-insensitive search for "<title" — scan one byte at a time
    let tag_start = find_case_insensitive(buf, b"<title")?;
    let rest = &buf[tag_start..];
    let close = rest.iter().position(|&b| b == b'>')?;

    let content_start = tag_start + close + 1;
    let rest2 = &buf[content_start..];
    let title_end = content_start + find_case_insensitive(rest2, b"</title>")?;

    let raw_title = &buf[content_start..title_end];
    let title = String::from_utf8_lossy(raw_title).trim().to_string();
    if title.is_empty() {
        return None;
    }
    // Safe truncation: floor to a char boundary to avoid panicking on
    // multi-byte UTF-8 characters (CJK, emoji, etc.)
    if title.len() > MAX_TITLE_LEN {
        let boundary = title.floor_char_boundary(MAX_TITLE_LEN);
        Some(title[..boundary].to_string())
    } else {
        Some(title)
    }
}

/// Case-insensitive byte-pattern search in `haystack`.
/// Returns the byte offset of the first match, or `None`.
fn find_case_insensitive(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    'outer: for i in 0..=haystack.len() - needle.len() {
        for (j, &nb) in needle.iter().enumerate() {
            if !haystack[i + j].eq_ignore_ascii_case(&nb) {
                continue 'outer;
            }
        }
        return Some(i);
    }
    None
}

#[tauri::command]
pub async fn fetch_page_title(url: String, state: State<'_, AppState>) -> Result<String, String> {
    fetch_page_title_inner(&url, &state).await
}

#[cfg(test)]
mod tests {
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
}
