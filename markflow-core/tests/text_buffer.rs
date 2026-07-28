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
