use markflow_core::{
    BomKind, ByteOffset, CoreError, DocumentId, DocumentSession, LineEndingKind, Revision,
    Selection, SessionId, SourceByteOffset, SourceOffsetError, SourceRange, TextBuffer, TextChange,
    TextPatch, TransactionId, TRANSACTION_RETRY_WINDOW_CAPACITY,
};

fn open(bytes: &[u8]) -> DocumentSession {
    DocumentSession::open_bytes(SessionId(17), DocumentId(23), bytes).unwrap()
}

fn change(revision: Revision, start: usize, end: usize, replacement: &str) -> TextChange {
    TextChange {
        range: SourceRange::new(revision, start, end),
        replacement: replacement.to_string(),
    }
}

fn patch(
    revision: Revision,
    transaction_id: u64,
    changes: Vec<TextChange>,
    selection_after: Option<Selection>,
) -> TextPatch {
    TextPatch {
        transaction_id: TransactionId(transaction_id),
        base_revision: revision,
        changes,
        selection_after,
    }
}

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

#[test]
fn normalized_lf_replacement_inherits_crlf() {
    let mut session = open(b"one\r\ntwo\r\n");
    let insertion = session.text().logical_text().find("two").unwrap() + 1;
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            1,
            vec![change(revision, insertion, insertion, "X\nY")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"one\r\ntX\r\nYwo\r\n");
}

#[test]
fn mixed_eol_inheritance_preserves_untouched_boundaries() {
    let mut session = open(b"a\r\nb\nc\rd");
    let insertion = session.text().logical_text().find('b').unwrap() + 1;
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            2,
            vec![change(revision, insertion, insertion, "X\nY")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"a\r\nbX\nY\nc\rd");
}

#[test]
fn replacement_reuses_removed_eol_before_adjacent_style() {
    let mut session = open(b"a\r\nb\nc\r");
    let text = session.text().logical_text();
    let start = text.find('b').unwrap();
    let end = text.find('c').unwrap();
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            3,
            vec![change(revision, start, end, "B\nX\n")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"a\r\nB\nX\nc\r");
}

#[test]
fn explicit_crlf_and_cr_replacements_are_preserved() {
    let mut session = open(b"one\ntwo\n");
    let start = session.text().logical_text().find("two").unwrap();
    let end = start + 3;
    let revision = session.revision();
    session
        .apply_patch(patch(
            revision,
            4,
            vec![change(revision, start, end, "dos\r\nzwei\rtres")],
            None,
        ))
        .unwrap();

    assert_eq!(
        session.save_payload().as_bytes(),
        b"one\ndos\r\nzwei\rtres\n"
    );
}

#[test]
fn insertion_at_document_end_uses_left_eol_fallback() {
    let mut session = open(b"a\r\nb");
    let revision = session.revision();
    let end = session.text().len_bytes();
    session
        .apply_patch(patch(
            revision,
            5,
            vec![change(revision, end, end, "\nnext")],
            None,
        ))
        .unwrap();

    assert_eq!(session.save_payload().as_bytes(), b"a\r\nb\r\nnext");
}

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
    assert_eq!(session.original().bom, BomKind::Utf8);

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
