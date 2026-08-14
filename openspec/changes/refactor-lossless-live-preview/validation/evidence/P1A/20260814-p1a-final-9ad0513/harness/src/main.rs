use markflow_core::{
    BomKind, CoreError, DocumentId, LineEndingKind, LogicalByteOffset,
    LosslessDocumentSession, NewlineEnding, PositionMap, SessionId, SourceByteOffset,
    SourceRange, TextBuffer, TextChange, TextPatch, TransactionId, Utf16Offset,
    TRANSACTION_RETRY_WINDOW_CAPACITY,
};

fn change(start: usize, end: usize, inserted: &str, eols: Vec<NewlineEnding>) -> TextChange {
    TextChange {
        range: SourceRange::new(LogicalByteOffset(start), LogicalByteOffset(end)),
        inserted_logical_text: inserted.to_owned(),
        inserted_line_endings: eols,
    }
}

fn patch(
    session: &LosslessDocumentSession,
    transaction_id: u64,
    changes: Vec<TextChange>,
) -> TextPatch {
    TextPatch {
        binding_generation: session.binding_generation(),
        session_id: session.session_id,
        document_id: session.document_id,
        transaction_id: TransactionId(transaction_id),
        base_revision: session.revision(),
        changes,
        selection_after: None,
    }
}

fn main() {
    let mut lifecycle = LosslessDocumentSession::open_bytes(
        SessionId(101),
        DocumentId(201),
        b"open\r\nclean\r\n",
        LineEndingKind::Lf,
    )
    .unwrap();
    assert_eq!(lifecycle.persisted_revision(), Some(lifecycle.revision()));
    assert!(!lifecycle.is_dirty());

    let delayed = patch(
        &lifecycle,
        1,
        vec![change(0, 0, "stale-", Vec::new())],
    );
    let old_generation = lifecycle.binding_generation();
    lifecycle.reload(b"reloaded\n", LineEndingKind::Crlf).unwrap();
    assert_ne!(lifecycle.binding_generation(), old_generation);
    assert_eq!(lifecycle.persisted_revision(), Some(lifecycle.revision()));
    assert!(!lifecycle.is_dirty());
    assert_eq!(lifecycle.apply_patch(delayed), Err(CoreError::WrongIdentity));
    assert_eq!(lifecycle.text().logical_text(), "reloaded\n");
    assert!(!lifecycle.is_dirty());
    println!("PASS open/reload clean and delayed old-generation patch rejection");

    let mut multi = LosslessDocumentSession::open_bytes(
        SessionId(102),
        DocumentId(202),
        b"A\nB",
        LineEndingKind::Lf,
    )
    .unwrap();
    let multi_patch = patch(
        &multi,
        2,
        vec![
            change(0, 0, "X\n", vec![NewlineEnding::Inherit]),
            change(1, 2, "\n", vec![NewlineEnding::ExplicitCrlf]),
        ],
    );
    multi.apply_patch(multi_patch).unwrap();
    let bytes = multi
        .prepare_save(multi.revision(), &multi.original().file_identity)
        .unwrap()
        .into_bytes();
    assert_eq!(bytes, b"X\nA\r\nB");
    println!("PASS multi-change inheritance resolved from immutable base snapshot");

    let base = TextBuffer::from_logical_text("a\nb", LineEndingKind::Crlf).unwrap();
    let other = TextBuffer::from_logical_text("x\ny\nz", LineEndingKind::Lf).unwrap();
    let map = PositionMap::new(&base, BomKind::None);
    let checks = [
        std::panic::catch_unwind(|| map.utf16_for_byte(&other, LogicalByteOffset(0)))
            .map(|result| result.map(|_| ())),
        std::panic::catch_unwind(|| map.byte_for_utf16(&other, Utf16Offset(0)))
            .map(|result| result.map(|_| ())),
        std::panic::catch_unwind(|| map.source_byte_for_byte(&other, LogicalByteOffset(0)))
            .map(|result| result.map(|_| ())),
        std::panic::catch_unwind(|| map.byte_for_source_byte(&other, SourceByteOffset(0)))
            .map(|result| result.map(|_| ())),
    ];
    for check in checks {
        assert_eq!(check.unwrap(), Err(CoreError::PositionMapMismatch));
    }
    println!("PASS all PositionMap public conversions reject mismatched geometry without panic");

    let mut atomic = LosslessDocumentSession::open_bytes(
        SessionId(103),
        DocumentId(203),
        b"hello world",
        LineEndingKind::Lf,
    )
    .unwrap();
    let before_hash = atomic.confirmed_hash();
    let bad = patch(
        &atomic,
        3,
        vec![
            change(0, 5, "HELLO", Vec::new()),
            change(4, 11, "WORLD", Vec::new()),
        ],
    );
    assert_eq!(atomic.apply_patch(bad), Err(CoreError::OverlappingChanges));
    assert_eq!(atomic.revision().0, 0);
    assert_eq!(atomic.text().logical_text(), "hello world");
    assert_eq!(atomic.confirmed_hash(), before_hash);
    assert!(!atomic.is_dirty());
    println!("PASS injected overlapping-change failure is atomic");

    let mut bounded = LosslessDocumentSession::open_bytes(
        SessionId(104),
        DocumentId(204),
        b"x",
        LineEndingKind::Lf,
    )
    .unwrap();
    for index in 0..=TRANSACTION_RETRY_WINDOW_CAPACITY {
        let transaction_id = 10_000 + index as u64;
        let item = patch(
            &bounded,
            transaction_id,
            vec![change(0, 0, "a", Vec::new())],
        );
        bounded.apply_patch(item).unwrap();
    }
    let reused_after_eviction = patch(
        &bounded,
        10_000,
        vec![change(0, 0, "different", Vec::new())],
    );
    assert!(bounded.apply_patch(reused_after_eviction).is_ok());
    println!(
        "OBSERVED P2 transaction id can be reused with a different payload after {} retained entries",
        TRANSACTION_RETRY_WINDOW_CAPACITY
    );
}
