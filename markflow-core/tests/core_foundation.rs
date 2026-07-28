use std::fs;
use std::path::Path;

use markflow_core::{
    BomKind, ByteOffset, CoreError, DocumentId, DocumentSession, LineEndingKind, Revision,
    SessionId, SourceRange, TextChange, TextPatch, TransactionId, Utf16Offset,
};

const FIXTURE_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/lossless");

fn open(bytes: &[u8]) -> DocumentSession {
    DocumentSession::open_bytes(SessionId(7), DocumentId(11), bytes).unwrap()
}

fn fixture(name: &str) -> Vec<u8> {
    fs::read(Path::new(FIXTURE_ROOT).join(name)).unwrap()
}

fn patch_at(revision: Revision, tx: u64, start: usize, end: usize, replacement: &str) -> TextPatch {
    TextPatch {
        transaction_id: TransactionId(tx),
        base_revision: revision,
        changes: vec![TextChange {
            range: SourceRange::new(revision, start, end),
            replacement: replacement.to_string(),
        }],
        selection_after: None,
    }
}

#[test]
fn required_lossless_fixtures_exist() {
    for name in [
        "lf.md",
        "crlf.md",
        "mixed-eol.md",
        "utf8-bom.md",
        "unicode-offsets.md",
        "trailing-newlines.md",
        "frontmatter.md",
        "html-comment.md",
        "mixed-list-markers.md",
        "code-fence-backtick.md",
        "code-fence-tilde.md",
        "table-alignment.md",
    ] {
        assert!(
            Path::new(FIXTURE_ROOT).join(name).exists(),
            "{name} missing"
        );
    }
}

#[test]
fn fixtures_roundtrip_byte_for_byte() {
    for entry in fs::read_dir(FIXTURE_ROOT).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let bytes = fs::read(&path).unwrap();
        let session = open(&bytes);
        assert_eq!(session.save_payload().as_bytes(), bytes, "{path:?}");
    }
}

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

#[test]
fn localized_patch_preserves_untouched_bytes() {
    let bytes = fixture("lf.md");
    let mut session = open(&bytes);
    let original_text = session.text().logical_text().to_string();
    let start = original_text.find("First paragraph.").unwrap();
    let end = start + "First paragraph.".len();
    let replacement = "First sentence..";
    assert_eq!(replacement.len(), end - start);

    session
        .apply_patch(patch_at(session.revision(), 1, start, end, replacement))
        .unwrap();

    let saved = session.save_payload().into_bytes();
    assert_eq!(&saved[..start], &bytes[..start]);
    assert_eq!(&saved[end..], &bytes[end..]);
    assert_eq!(&saved[start..end], replacement.as_bytes());
    assert_eq!(session.revision(), Revision(1));
}

#[test]
fn patch_revision_mismatch_fails_without_mutation() {
    let bytes = fixture("lf.md");
    let mut session = open(&bytes);
    let before = session.save_payload().into_bytes();
    let err = session
        .apply_patch(patch_at(Revision(99), 1, 0, 1, "X"))
        .unwrap_err();
    assert!(matches!(err, CoreError::StaleRevision { .. }));
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(session.save_payload().as_bytes(), before);
}

#[test]
fn overlapping_changes_fail_without_mutation() {
    let bytes = fixture("lf.md");
    let mut session = open(&bytes);
    let before = session.save_payload().into_bytes();
    let revision = session.revision();
    let patch = TextPatch {
        transaction_id: TransactionId(2),
        base_revision: revision,
        changes: vec![
            TextChange {
                range: SourceRange::new(revision, 1, 5),
                replacement: "one".into(),
            },
            TextChange {
                range: SourceRange::new(revision, 4, 7),
                replacement: "two".into(),
            },
        ],
        selection_after: None,
    };
    assert_eq!(
        session.apply_patch(patch),
        Err(CoreError::OverlappingChanges)
    );
    assert_eq!(session.save_payload().as_bytes(), before);
}

#[test]
fn retried_transaction_is_idempotent() {
    let mut session = open(&fixture("lf.md"));
    let patch = patch_at(session.revision(), 9, 0, 1, "!");
    let first = session.apply_patch(patch.clone()).unwrap();
    let second = session.apply_patch(patch).unwrap();
    assert_eq!(first, second);
    assert_eq!(session.revision(), Revision(1));
    assert!(session.text().logical_text().starts_with("!"));
    assert!(!session.text().logical_text().starts_with("!!"));
}

#[test]
fn invalid_utf8_boundary_patch_fails_without_mutation() {
    let bytes = fixture("unicode-offsets.md");
    let mut session = open(&bytes);
    let text = session.text().logical_text().to_string();
    let emoji_start = text.find('😀').unwrap();
    let before = session.save_payload().into_bytes();
    let err = session
        .apply_patch(patch_at(
            session.revision(),
            10,
            emoji_start + 1,
            emoji_start + 2,
            "x",
        ))
        .unwrap_err();
    assert_eq!(err, CoreError::InvalidUtf8Boundary);
    assert_eq!(session.save_payload().as_bytes(), before);
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
fn generated_unicode_patches_preserve_valid_utf8_and_reversible_offsets() {
    let seeds = [
        "abc",
        "中文段落",
        "emoji 😀 text",
        "combining e\u{301} mark",
    ];
    let replacements = ["x", "替换", "🙂", "line\r\nnext"];

    for seed in seeds {
        for replacement in replacements {
            let mut session = open(format!("{seed}\nsecond line\n").as_bytes());
            let end = session
                .text()
                .logical_text()
                .chars()
                .next()
                .unwrap()
                .len_utf8();
            session
                .apply_patch(patch_at(
                    session.revision(),
                    100 + end as u64,
                    0,
                    end,
                    replacement,
                ))
                .unwrap();

            assert!(std::str::from_utf8(session.save_payload().as_bytes()).is_ok());
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
            }
        }
    }
}

#[test]
fn replacement_captures_explicit_eol_kinds() {
    let mut session = open(b"one\ntwo\nthree\n");
    let start = session.text().logical_text().find("two").unwrap();
    let end = start + "two".len();
    session
        .apply_patch(patch_at(session.revision(), 55, start, end, "dos\r\nzwei"))
        .unwrap();

    let saved = session.save_payload().into_bytes();
    assert!(saved.windows(2).any(|pair| pair == b"\r\n"));
    assert!(std::str::from_utf8(&saved).is_ok());
}
