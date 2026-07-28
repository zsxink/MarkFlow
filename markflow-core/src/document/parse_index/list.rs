use super::scanner::is_space;

pub fn starts_task_checkbox(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() >= 3
        && bytes[0] == b'['
        && matches!(bytes[1], b' ' | b'x' | b'X')
        && bytes[2] == b']'
        && bytes.get(3).is_none_or(|byte| is_space(*byte))
}

pub fn starts_like_list_marker(trimmed: &str) -> bool {
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 && matches!(bytes[0], b'-' | b'*' | b'+') && is_space(bytes[1]) {
        return true;
    }

    let digit_count = bytes
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    digit_count > 0
        && digit_count <= 9
        && digit_count + 1 < bytes.len()
        && matches!(bytes[digit_count], b'.' | b')')
        && is_space(bytes[digit_count + 1])
}
