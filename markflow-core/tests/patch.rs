mod common;

use common::{change, fixture, open, patch, patch_at};
use markflow_core::{
    ByteOffset, CoreError, Revision, SourceRange, TextChange, TextPatch, TransactionId,
};

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

#[test]
fn reverse_ordered_non_overlapping_changes_are_order_independent() {
    let revision = Revision(0);
    let left = change(revision, 0, 1, "X");
    let right = change(revision, 4, 6, "YZ");

    let mut forward = open(b"abcdef");
    let forward_outcome = forward
        .apply_patch(patch(revision, 10, vec![left.clone(), right.clone()], None))
        .unwrap();

    let mut reverse = open(b"abcdef");
    let reverse_outcome = reverse
        .apply_patch(patch(revision, 10, vec![right, left], None))
        .unwrap();

    assert_eq!(forward.text().logical_text(), "XbcdYZ");
    assert_eq!(reverse.text().logical_text(), forward.text().logical_text());
    assert_eq!(reverse_outcome, forward_outcome);
}

#[test]
fn normalized_overlap_is_rejected_atomically() {
    let mut session = open(b"abcdefgh");
    let before = session.save_payload().into_bytes();
    let revision = session.revision();
    let overlapping = patch(
        revision,
        12,
        vec![
            change(revision, 4, 7, "right"),
            change(revision, 2, 5, "left"),
        ],
        None,
    );

    assert_eq!(
        session.apply_patch(overlapping),
        Err(CoreError::OverlappingChanges)
    );
    assert_eq!(session.revision(), revision);
    assert_eq!(session.save_payload().as_bytes(), before);
    assert_eq!(session.retained_transaction_count(), 0);
}
