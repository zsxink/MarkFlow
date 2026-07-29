use super::scanner::is_space;

pub(crate) fn heading_title(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut start = 0;
    while start < bytes.len() && is_space(bytes[start]) {
        start += 1;
    }

    let mut end = bytes.len();
    while end > start && is_space(bytes[end - 1]) {
        end -= 1;
    }

    if end > start && bytes[end - 1] == b'#' {
        let mut closing_start = end;
        while closing_start > start && bytes[closing_start - 1] == b'#' {
            closing_start -= 1;
        }
        if closing_start == start || is_space(bytes[closing_start - 1]) {
            end = closing_start;
            while end > start && is_space(bytes[end - 1]) {
                end -= 1;
            }
        }
    }

    raw[start..end].to_string()
}
