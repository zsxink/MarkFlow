mod common;

use common::{fixture, open, patch_at};
use markflow_core::{
    ByteOffset, CoreError, DocumentSession, Revision, SourceByteOffset, SourceOffsetError,
    Utf16Offset,
};

fn assert_position_roundtrip(session: &DocumentSession) {
    for logical in session
        .text()
        .logical_text()
        .char_indices()
        .map(|(offset, _)| offset)
        .chain([session.text().len_bytes()])
    {
        let logical = ByteOffset(logical);
        let source = session.source_byte_for_byte(logical).unwrap();
        assert_eq!(session.byte_for_source_byte(source).unwrap(), logical);
    }
}

#[test]
fn utf8_utf16_line_col_offsets_are_reversible() {
    let mut session = open("A中文😀e\u{301}\nnext".as_bytes());
    for byte in session
        .text()
        .logical_text()
        .char_indices()
        .map(|(idx, _)| idx)
        .chain([session.text().logical_text().len()])
    {
        let byte = ByteOffset(byte);
        let utf16 = session.utf16_for_byte(byte).unwrap();
        assert_eq!(session.byte_for_utf16(utf16).unwrap(), byte);

        let line_col = session.line_col_for_byte(byte).unwrap();
        assert_eq!(session.byte_for_line_col(line_col).unwrap(), byte);
    }

    let emoji = session.text().logical_text().find('😀').unwrap();
    let half_surrogate = session.utf16_for_byte(ByteOffset(emoji)).unwrap().0 + 1;
    assert_eq!(
        session
            .byte_for_utf16(Utf16Offset(half_surrogate))
            .unwrap_err(),
        CoreError::InvalidUtf16Boundary
    );

    let patch = patch_at(session.revision(), 20, 0, 1, "Z");
    session.apply_patch(patch).unwrap();
    assert_eq!(session.position_map().revision(), Revision(1));
}

#[test]
fn source_byte_offsets_account_for_bom_and_crlf_width() {
    let bom = open(&fixture("utf8-bom.md"));
    assert_eq!(bom.source_byte_for_byte(ByteOffset(0)).unwrap().0, 3);

    let crlf = open(&fixture("crlf.md"));
    let newline = crlf.text().logical_text().find('\n').unwrap();
    let line_two = ByteOffset(newline + 1);
    assert_eq!(crlf.source_byte_for_byte(line_two).unwrap().0, newline + 2);
}

#[test]
fn source_offsets_roundtrip_for_bom_crlf_mixed_and_unicode() {
    for bytes in [
        b"\xEF\xBB\xBFA\r\n\xe4\xb8\xad\xf0\x9f\x98\x80\r\n".as_slice(),
        b"one\r\ntwo\nthree\rfour".as_slice(),
        "ASCII\n中文\r\nemoji 😀\rcombining e\u{301}".as_bytes(),
    ] {
        assert_position_roundtrip(&open(bytes));
    }
}

#[test]
fn invalid_source_offsets_report_exact_boundary_reason() {
    let bom = open(b"\xEF\xBB\xBFA\r\n\xf0\x9f\x98\x80");
    for offset in 0..3 {
        assert_eq!(
            bom.byte_for_source_byte(SourceByteOffset(offset)),
            Err(CoreError::InvalidSourceOffset {
                offset: SourceByteOffset(offset),
                reason: SourceOffsetError::InsideBom,
            })
        );
    }

    let crlf_start = bom
        .save_payload()
        .as_bytes()
        .windows(2)
        .position(|pair| pair == b"\r\n")
        .unwrap();
    let crlf_middle = SourceByteOffset(crlf_start + 1);
    assert_eq!(
        bom.byte_for_source_byte(crlf_middle),
        Err(CoreError::InvalidSourceOffset {
            offset: crlf_middle,
            reason: SourceOffsetError::InsideCrlf,
        })
    );

    let emoji_start = bom
        .save_payload()
        .as_bytes()
        .windows(4)
        .position(|bytes| bytes == "😀".as_bytes())
        .unwrap();
    let emoji_middle = SourceByteOffset(emoji_start + 1);
    assert_eq!(
        bom.byte_for_source_byte(emoji_middle),
        Err(CoreError::InvalidSourceOffset {
            offset: emoji_middle,
            reason: SourceOffsetError::InvalidUtf8Boundary,
        })
    );

    let out_of_bounds = SourceByteOffset(bom.save_payload().as_bytes().len() + 1);
    assert_eq!(
        bom.byte_for_source_byte(out_of_bounds),
        Err(CoreError::InvalidSourceOffset {
            offset: out_of_bounds,
            reason: SourceOffsetError::OutOfBounds,
        })
    );
}
