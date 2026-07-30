mod common;

use common::{change, open};
use markflow_core::{
    ByteOffset, CoreError, ReplacePreviewRequest, ReplaceScope, Revision, SearchOptions,
    SearchPage, SearchRequest, SourceRange, TextPatch, TransactionId,
};

fn options(case_sensitive: bool, whole_word: bool) -> SearchOptions {
    SearchOptions {
        case_sensitive,
        whole_word,
    }
}

#[test]
fn search_maps_unicode_matches_to_source_ui_and_selection_ranges() {
    let session = open("Hello hello 标题 hello_world hello\n".as_bytes());

    let chinese = session
        .search(SearchRequest {
            session_id: session.id,
            revision: session.revision(),
            query_id: "q-cn".to_string(),
            query: "标题".to_string(),
            options: options(true, false),
            page: SearchPage::default(),
        })
        .unwrap();
    assert_eq!(chinese.matches.len(), 1);
    assert_eq!(
        chinese.matches[0].source_range,
        SourceRange::new(Revision(0), 12, 18)
    );
    assert_eq!(chinese.matches[0].ui_range.start.0, 12);
    assert_eq!(chinese.matches[0].ui_range.end.0, 14);
    assert_eq!(chinese.matches[0].selection, chinese.matches[0].selection);

    let words = session
        .search(SearchRequest {
            session_id: session.id,
            revision: session.revision(),
            query_id: "q-word".to_string(),
            query: "hello".to_string(),
            options: options(false, true),
            page: SearchPage::default(),
        })
        .unwrap();
    assert_eq!(words.matches.len(), 3);
    assert!(words
        .matches
        .iter()
        .all(|item| item.preview.contains("hello") || item.preview.contains("Hello")));
}

#[test]
fn large_document_search_returns_pages() {
    let mut text = String::from("needle\n");
    text.push_str(&"x".repeat(1024 * 1024 + 1));
    text.push_str("\nneedle\n");
    let session = open(text.as_bytes());

    let first = session
        .search(SearchRequest {
            session_id: session.id,
            revision: session.revision(),
            query_id: "q-large".to_string(),
            query: "needle".to_string(),
            options: options(true, false),
            page: SearchPage {
                cursor: ByteOffset(0),
                limit: 1,
            },
        })
        .unwrap();
    assert!(first.large_document);
    assert!(first.paged);
    assert_eq!(first.matches.len(), 1);
    let next_cursor = first.next_cursor.unwrap();

    let second = session
        .search(SearchRequest {
            session_id: session.id,
            revision: session.revision(),
            query_id: "q-large".to_string(),
            query: "needle".to_string(),
            options: options(true, false),
            page: SearchPage {
                cursor: next_cursor,
                limit: 1,
            },
        })
        .unwrap();
    assert_eq!(second.matches.len(), 1);
    assert!(second.matches[0].source_range.start.0 > 1024 * 1024);
}

#[test]
fn replace_preview_generates_single_and_all_patch_sets() {
    let mut session = open(b"one two one\n");
    let single = session
        .preview_search_replace(ReplacePreviewRequest {
            session_id: session.id,
            base_revision: session.revision(),
            transaction_id: TransactionId(10),
            query_id: "r1".to_string(),
            query: "one".to_string(),
            replacement: "three".to_string(),
            options: options(true, true),
            scope: ReplaceScope::First,
        })
        .unwrap();
    assert_eq!(single.replacements.len(), 1);
    assert_eq!(single.patch.changes.len(), 1);
    session.apply_patch(single.patch).unwrap();
    assert_eq!(session.text().logical_text(), "three two one\n");

    let all = session
        .preview_search_replace(ReplacePreviewRequest {
            session_id: session.id,
            base_revision: session.revision(),
            transaction_id: TransactionId(11),
            query_id: "r2".to_string(),
            query: "o".to_string(),
            replacement: "O".to_string(),
            options: options(true, false),
            scope: ReplaceScope::All,
        })
        .unwrap();
    assert_eq!(all.patch.changes.len(), 2);
    session.apply_patch(all.patch).unwrap();
    assert_eq!(session.text().logical_text(), "three twO One\n");
}

#[test]
fn search_and_replace_reject_stale_revision_and_mismatched_session() {
    let mut session = open(b"alpha\n");
    session
        .apply_patch(TextPatch {
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(Revision(0), 0, 0, "x")],
            selection_after: None,
        })
        .unwrap();

    let stale = session
        .search(SearchRequest {
            session_id: session.id,
            revision: Revision(0),
            query_id: "stale".to_string(),
            query: "alpha".to_string(),
            options: options(true, false),
            page: SearchPage::default(),
        })
        .unwrap_err();
    assert!(matches!(stale, CoreError::StaleRevision { .. }));

    let wrong_session = session
        .preview_search_replace(ReplacePreviewRequest {
            session_id: markflow_core::SessionId(999),
            base_revision: session.revision(),
            transaction_id: TransactionId(2),
            query_id: "wrong".to_string(),
            query: "alpha".to_string(),
            replacement: "beta".to_string(),
            options: options(true, false),
            scope: ReplaceScope::Range(SourceRange::new(session.revision(), 1, 6)),
        })
        .unwrap_err();
    assert!(matches!(wrong_session, CoreError::SessionMismatch { .. }));
}
