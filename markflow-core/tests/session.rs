mod common;

use common::{change, fixture, open, patch, patch_at};
use markflow_core::{
    BomKind, ByteOffset, CoreError, Revision, Selection, TRANSACTION_RETRY_WINDOW_CAPACITY,
};

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
fn equivalent_retry_order_returns_identical_outcome_without_reapplying() {
    let mut session = open(b"abcdef");
    let revision = session.revision();
    let left = change(revision, 0, 1, "X");
    let right = change(revision, 4, 6, "YZ");
    let first = session
        .apply_patch(patch(revision, 11, vec![right.clone(), left.clone()], None))
        .unwrap();
    let retry = session
        .apply_patch(patch(revision, 11, vec![left, right], None))
        .unwrap();

    assert_eq!(retry, first);
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(session.text().logical_text(), "XbcdYZ");
}

#[test]
fn unicode_selection_is_validated_against_post_edit_text_and_rebound() {
    let mut session = open("A😀B".as_bytes());
    let revision = session.revision();
    let emoji_start = session.text().logical_text().find('😀').unwrap();
    let emoji_end = emoji_start + '😀'.len_utf8();
    let replacement = "中🙂";
    let projected = emoji_start + replacement.len();
    let request = patch(
        revision,
        20,
        vec![change(revision, emoji_start, emoji_end, replacement)],
        Some(Selection {
            anchor: ByteOffset(projected),
            head: ByteOffset(projected),
            revision,
        }),
    );

    let first = session.apply_patch(request.clone()).unwrap();
    assert_eq!(session.text().logical_text(), "A中🙂B");
    assert_eq!(
        first.selection_after,
        Some(Selection {
            anchor: ByteOffset(projected),
            head: ByteOffset(projected),
            revision: Revision(1),
        })
    );
    assert_eq!(session.apply_patch(request).unwrap(), first);
}

#[test]
fn stale_or_invalid_projected_selection_fails_without_state_or_retry_mutation() {
    let mut session = open("A😀B".as_bytes());
    let before = session.save_payload().into_bytes();
    let revision = session.revision();
    let emoji_start = session.text().logical_text().find('😀').unwrap();
    let emoji_end = emoji_start + '😀'.len_utf8();

    let stale = patch(
        revision,
        21,
        vec![change(revision, emoji_start, emoji_end, "中")],
        Some(Selection {
            anchor: ByteOffset(4),
            head: ByteOffset(4),
            revision: Revision(99),
        }),
    );
    assert!(matches!(
        session.apply_patch(stale),
        Err(CoreError::StaleRevision { .. })
    ));

    let invalid_boundary = patch(
        revision,
        22,
        vec![change(revision, emoji_start, emoji_end, "中")],
        Some(Selection {
            anchor: ByteOffset(emoji_start + 1),
            head: ByteOffset(emoji_start + 1),
            revision,
        }),
    );
    assert_eq!(
        session.apply_patch(invalid_boundary),
        Err(CoreError::InvalidUtf8Boundary)
    );
    assert_eq!(session.revision(), revision);
    assert_eq!(session.save_payload().as_bytes(), before);
    assert_eq!(session.retained_transaction_count(), 0);

    let valid_retry = patch(
        revision,
        22,
        vec![change(revision, emoji_start, emoji_end, "中")],
        Some(Selection {
            anchor: ByteOffset(emoji_start + "中".len()),
            head: ByteOffset(emoji_start + "中".len()),
            revision,
        }),
    );
    assert!(session.apply_patch(valid_retry).is_ok());
}

#[test]
fn transaction_retry_window_is_bounded_and_evicts_oldest() {
    let mut session = open(b"");
    let first_patch = patch(
        session.revision(),
        1000,
        vec![change(session.revision(), 0, 0, "x")],
        None,
    );
    session.apply_patch(first_patch.clone()).unwrap();

    for index in 1..=TRANSACTION_RETRY_WINDOW_CAPACITY {
        let revision = session.revision();
        let end = session.text().len_bytes();
        session
            .apply_patch(patch(
                revision,
                1000 + index as u64,
                vec![change(revision, end, end, "x")],
                None,
            ))
            .unwrap();
    }

    assert_eq!(
        session.retained_transaction_count(),
        TRANSACTION_RETRY_WINDOW_CAPACITY
    );
    assert!(matches!(
        session.apply_patch(first_patch),
        Err(CoreError::StaleRevision { .. })
    ));

    let retained_conflict = patch(
        session.revision(),
        1001,
        vec![change(session.revision(), 0, 0, "different")],
        None,
    );
    assert_eq!(
        session.apply_patch(retained_conflict),
        Err(CoreError::TransactionConflict)
    );

    let revision = session.revision();
    let end = session.text().len_bytes();
    let reused_after_eviction = patch(revision, 1000, vec![change(revision, end, end, "!")], None);
    assert!(session.apply_patch(reused_after_eviction).is_ok());
    assert!(session.text().logical_text().ends_with('!'));
    assert_eq!(
        session.retained_transaction_count(),
        TRANSACTION_RETRY_WINDOW_CAPACITY
    );
}

#[test]
fn session_facade_keeps_all_position_maps_coherent_after_patch() {
    let mut session = open(b"\xEF\xBB\xBFA\r\n\xe4\xb8\xad\xf0\x9f\x98\x80\nZ");
    let revision = session.revision();
    let text = session.text().logical_text();
    let start = text.find('中').unwrap();
    let end = start + "中😀".len();
    session
        .apply_patch(patch(
            revision,
            2000,
            vec![change(revision, start, end, "e\u{301}\n🙂")],
            None,
        ))
        .unwrap();

    assert_eq!(session.revision(), Revision(1));
    assert_eq!(session.position_map().revision(), session.revision());
    assert_eq!(session.line_count(), 4);
    assert_eq!(session.line_start(0), Some(ByteOffset(0)));
    assert_eq!(session.original().bom(), BomKind::Utf8);

    for offset in session
        .text()
        .logical_text()
        .char_indices()
        .map(|(offset, _)| offset)
        .chain([session.text().len_bytes()])
    {
        let byte = ByteOffset(offset);
        let utf16 = session.utf16_for_byte(byte).unwrap();
        assert_eq!(session.byte_for_utf16(utf16).unwrap(), byte);

        let line_col = session.line_col_for_byte(byte).unwrap();
        assert_eq!(session.byte_for_line_col(line_col).unwrap(), byte);

        let source = session.source_byte_for_byte(byte).unwrap();
        assert_eq!(session.byte_for_source_byte(source).unwrap(), byte);
    }
}
