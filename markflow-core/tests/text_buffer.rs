use markflow_core::{BomKind, CoreError, LineEndingKind, TextBuffer};

#[test]
fn logical_text_constructor_rejects_source_cr_and_preserves_lf_only_contract() {
    for source_form in ["a\rb", "a\r\nb"] {
        assert_eq!(
            TextBuffer::from_logical_text(source_form, LineEndingKind::Crlf),
            Err(CoreError::InvalidLogicalLineEnding)
        );
    }

    let logical =
        TextBuffer::from_logical_text("a\nb", LineEndingKind::Crlf).expect("LF-only logical text");
    assert_eq!(logical.logical_text(), "a\nb");
    assert_eq!(logical.to_source_bytes(BomKind::None), b"a\r\nb");
}

#[test]
fn logical_text_preserves_lf_contract_with_lf_dominant() {
    let buffer = TextBuffer::from_logical_text("hello\nworld", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.logical_text(), "hello\nworld");
    assert_eq!(buffer.to_source_bytes(BomKind::None), b"hello\nworld");
}

#[test]
fn logical_text_dominant_crlf_converts_output() {
    let buffer = TextBuffer::from_logical_text("hello\nworld", LineEndingKind::Crlf).unwrap();
    assert_eq!(buffer.logical_text(), "hello\nworld");
    assert_eq!(buffer.to_source_bytes(BomKind::None), b"hello\r\nworld");
}

#[test]
fn logical_text_preserves_unicode_content() {
    let buffer =
        TextBuffer::from_logical_text("héllo\nwörld", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.logical_text(), "héllo\nwörld");
}

#[test]
fn len_bytes_returns_logical_byte_length() {
    let buffer = TextBuffer::from_logical_text("hello\nworld", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.len_bytes(), 11);
}

#[test]
fn len_bytes_unicode() {
    let buffer = TextBuffer::from_logical_text("héllo", LineEndingKind::Lf).unwrap();
    // 'é' is 2 bytes in UTF-8
    assert_eq!(buffer.len_bytes(), 6);
}

#[test]
fn empty_buffer_to_source_bytes() {
    let buffer = TextBuffer::from_logical_text("", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.to_source_bytes(BomKind::None), b"");
}

#[test]
fn empty_buffer_has_zero_len() {
    let buffer = TextBuffer::from_logical_text("", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.len_bytes(), 0);
    assert_eq!(buffer.logical_text(), "");
}

#[test]
fn from_logical_text_mixed_ending_is_treated_as_lf_dominant() {
    let buffer = TextBuffer::from_logical_text("a\nb", LineEndingKind::Mixed).unwrap();
    assert_eq!(buffer.to_source_bytes(BomKind::None), b"a\nb");
}

#[test]
fn to_source_bytes_with_bom() {
    // BOM is prepended during to_source_bytes, not stored in logical text
    let buffer = TextBuffer::from_logical_text("hello", LineEndingKind::Lf).unwrap();
    let bom = &[0xEF, 0xBB, 0xBF];
    let result = buffer.to_source_bytes(BomKind::Utf8);
    assert!(result.starts_with(bom));
    assert_eq!(&result[3..], b"hello");
}

#[test]
fn from_logical_text_preserves_trailing_newline() {
    let buffer = TextBuffer::from_logical_text("hello\n", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.logical_text(), "hello\n");
}

#[test]
fn from_logical_text_preserves_multiple_newlines() {
    let buffer = TextBuffer::from_logical_text("a\n\n\nb", LineEndingKind::Lf).unwrap();
    assert_eq!(buffer.logical_text(), "a\n\n\nb");
    assert_eq!(buffer.to_source_bytes(BomKind::None), b"a\n\n\nb");
}
