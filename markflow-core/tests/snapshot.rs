mod common;

use common::{fixture, open};
use markflow_core::{BomKind, CoreError, DocumentId, DocumentSession, LineEndingKind, SessionId};

#[test]
fn snapshot_records_bom_and_trailing_newlines() {
    let bom = fixture("utf8-bom.md");
    let session = open(&bom);
    assert_eq!(session.original().bom, BomKind::Utf8);
    assert!(session
        .save_payload()
        .as_bytes()
        .starts_with(&[0xEF, 0xBB, 0xBF]));

    let trailing = fixture("trailing-newlines.md");
    let session = open(&trailing);
    assert_eq!(session.original().trailing_newlines, 3);
    assert!(session.original().final_newline);
    assert_eq!(session.save_payload().as_bytes(), trailing);
}

#[test]
fn rejects_invalid_utf8_without_transcoding() {
    let err = DocumentSession::open_bytes(SessionId(1), DocumentId(1), b"ok\xFFbad").unwrap_err();
    assert_eq!(err, CoreError::UnsupportedEncoding);
}

#[test]
fn crlf_and_mixed_eol_are_preserved() {
    let crlf = fixture("crlf.md");
    assert!(crlf.windows(2).any(|pair| pair == b"\r\n"));
    assert!(!crlf
        .iter()
        .enumerate()
        .any(|(idx, byte)| { *byte == b'\n' && idx > 0 && crlf[idx - 1] != b'\r' }));
    assert_eq!(open(&crlf).save_payload().as_bytes(), crlf);

    let mixed = fixture("mixed-eol.md");
    let session = open(&mixed);
    assert_eq!(session.save_payload().as_bytes(), mixed);
    assert_eq!(
        session.original().dominant_line_ending,
        LineEndingKind::Mixed
    );
}
