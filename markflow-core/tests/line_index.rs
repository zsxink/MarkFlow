use markflow_core::{ByteOffset, LineIndex};

#[test]
fn line_index_tracks_all_newlines() {
    let text = "a\nb\nc\n";
    let index = LineIndex::new(text);
    assert_eq!(index.line_count(), 4);
    assert_eq!(index.line_start(0), Some(ByteOffset(0)));
    assert_eq!(index.line_start(1), Some(ByteOffset(2)));
    assert_eq!(index.line_start(2), Some(ByteOffset(4)));
    assert_eq!(index.line_start(3), Some(ByteOffset(6)));
}

#[test]
fn line_index_empty_text_has_one_line() {
    let text = "";
    let index = LineIndex::new(text);
    assert_eq!(index.line_count(), 1);
    assert_eq!(index.line_start(0), Some(ByteOffset(0)));
}

#[test]
fn line_col_for_byte_mid_line() {
    let text = "hello world";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(6)).unwrap();
    assert_eq!(result.line, 0);
    assert_eq!(result.column_utf8, 6);
    assert_eq!(result.column_utf16, 6);
}

#[test]
fn line_col_for_byte_multi_line() {
    let text = "abc\ndef\nghi";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(5)).unwrap();
    assert_eq!(result.line, 1);
    assert_eq!(result.column_utf8, 1); // byte 5 is "e" in "def", column 1
    assert_eq!(result.column_utf16, 1);
}

#[test]
fn line_col_for_byte_at_end_of_line() {
    let text = "abc\n";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(3)).unwrap();
    assert_eq!(result.line, 0);
    assert_eq!(result.column_utf8, 3);
}

#[test]
fn line_col_for_byte_out_of_bounds_returns_error() {
    let text = "hello";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(100));
    assert!(result.is_err());
}

#[test]
fn line_col_for_byte_invalid_utf8_boundary_returns_error() {
    let text = "héllo";
    let index = LineIndex::new(text);
    // 'é' is 2 bytes; byte 2 (0xA9) is the continuation byte, not a char boundary
    let result = index.line_col_for_byte(text, ByteOffset(2));
    assert!(result.is_err());
}

#[test]
fn line_col_for_byte_at_newline_returns_correct_line() {
    let text = "ab\ncd\n";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(2)).unwrap();
    assert_eq!(result.line, 0);
    // column at the newline itself — not past it
    assert_eq!(result.column_utf8, 2);
}

#[test]
fn line_col_for_byte_trailing_text_without_newline() {
    let text = "line1\nline2";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(8)).unwrap();
    assert_eq!(result.line, 1);
    assert_eq!(result.column_utf8, 2); // byte 8 in "line1\nline2" is "n" at column 2
}

#[test]
fn line_col_for_byte_unicode_utf16_count() {
    // '🔥' is 4 bytes, 2 UTF-16 code units
    let text = "a🔥b";
    let index = LineIndex::new(text);
    let result = index.line_col_for_byte(text, ByteOffset(5)).unwrap();
    assert_eq!(result.line, 0);
    assert_eq!(result.column_utf8, 5);
    assert_eq!(result.column_utf16, 3);
}

#[test]
fn byte_for_line_col_basic() {
    let text = "abc\ndef\n";
    let index = LineIndex::new(text);
    let result = index.byte_for_line_col(
        text,
        markflow_core::LineCol {
            line: 1,
            column_utf16: 0,
            column_utf8: 0,
        },
    );
    assert_eq!(result, Ok(ByteOffset(4)));
}

#[test]
fn byte_for_line_col_unicode() {
    let text = "🔥\nhello";
    let index = LineIndex::new(text);
    let result = index.byte_for_line_col(
        text,
        markflow_core::LineCol {
            line: 1,
            column_utf16: 0,
            column_utf8: 0,
        },
    );
    assert_eq!(result, Ok(ByteOffset(5)));
}
