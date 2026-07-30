mod common;

use common::open;
use markflow_core::{
    CoreError, DocumentId, DocumentSession, FrontMatterCommand, FrontMatterCommandRequest,
    FrontMatterTriviaKind, FrontMatterUnsafeReason, FrontMatterValue, Revision, SessionId,
    TransactionId,
};

fn request(
    session: &DocumentSession,
    tx: u64,
    command: FrontMatterCommand,
) -> FrontMatterCommandRequest {
    FrontMatterCommandRequest {
        session_id: session.id,
        base_revision: session.revision(),
        transaction_id: TransactionId(tx),
        command,
    }
}

#[test]
fn extracts_safe_yaml_frontmatter_fields_and_trivia() {
    let session = open(
        b"---\n# note\n\ntitle: Hello\npublished: true\ncount: 42\ndate: 2026-07-30\ntags: [rust, core]\nmeta:\n  author: Xian\n  draft: false\n---\n# Body\n",
    );

    let model = session.frontmatter_model().unwrap();
    assert!(model.structured_edit_safe);
    assert!(model.unsafe_reasons.is_empty());
    assert_eq!(
        model
            .trivia
            .iter()
            .map(|trivia| trivia.kind)
            .collect::<Vec<_>>(),
        vec![
            FrontMatterTriviaKind::Comment,
            FrontMatterTriviaKind::BlankLine
        ]
    );
    assert_eq!(
        model
            .fields
            .iter()
            .map(|field| field.key.as_str())
            .collect::<Vec<_>>(),
        vec!["title", "published", "count", "date", "tags", "meta"]
    );
    assert_eq!(
        model.fields[0].value,
        FrontMatterValue::String("Hello".to_string())
    );
    assert_eq!(model.fields[1].value, FrontMatterValue::Boolean(true));
    assert_eq!(
        model.fields[2].value,
        FrontMatterValue::Number("42".to_string())
    );
    assert_eq!(
        model.fields[3].value,
        FrontMatterValue::DateLike("2026-07-30".to_string())
    );
    assert_eq!(
        model.fields[4].value,
        FrontMatterValue::Array(vec![
            FrontMatterValue::String("rust".to_string()),
            FrontMatterValue::String("core".to_string()),
        ])
    );
    assert!(matches!(
        model.fields[5].value,
        FrontMatterValue::Mapping(_)
    ));
}

#[test]
fn unsafe_yaml_frontmatter_reports_reasons_and_rejects_command() {
    let session = open(
        b"---\ntitle: A\ntitle: B\nref: &id value\ncopy: *id\nkind: !custom value\n<<: *defaults\nbody: |\n  text\n---\n",
    );

    let model = session.frontmatter_model().unwrap();
    assert!(!model.structured_edit_safe);
    assert!(model
        .unsafe_reasons
        .contains(&FrontMatterUnsafeReason::DuplicateKey {
            key: "title".to_string(),
        }));
    assert!(model
        .unsafe_reasons
        .contains(&FrontMatterUnsafeReason::AnchorOrAlias));
    assert!(model.unsafe_reasons.contains(&FrontMatterUnsafeReason::Tag));
    assert!(model
        .unsafe_reasons
        .contains(&FrontMatterUnsafeReason::MergeKey));
    assert!(model
        .unsafe_reasons
        .contains(&FrontMatterUnsafeReason::BlockScalar {
            key: "body".to_string(),
        }));

    let result = session.execute_frontmatter_command(request(
        &session,
        1,
        FrontMatterCommand::UpdateField {
            key: "title".to_string(),
            value: FrontMatterValue::String("Safe".to_string()),
        },
    ));
    assert_eq!(result, Err(CoreError::UnsupportedFrontMatter));
}

#[test]
fn frontmatter_command_guards_session_and_revision() {
    let mut session = open(b"---\ntitle: Old\n---\n");
    let patch = session
        .execute_frontmatter_command(request(
            &session,
            1,
            FrontMatterCommand::UpdateField {
                key: "title".to_string(),
                value: FrontMatterValue::String("New".to_string()),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(patch).unwrap();

    let stale = FrontMatterCommandRequest {
        session_id: session.id,
        base_revision: Revision(0),
        transaction_id: TransactionId(2),
        command: FrontMatterCommand::UpdateField {
            key: "title".to_string(),
            value: FrontMatterValue::String("Again".to_string()),
        },
    };
    assert!(matches!(
        session.execute_frontmatter_command(stale),
        Err(CoreError::StaleRevision { .. })
    ));

    let wrong_session = FrontMatterCommandRequest {
        session_id: SessionId(999),
        base_revision: session.revision(),
        transaction_id: TransactionId(3),
        command: FrontMatterCommand::UpdateField {
            key: "title".to_string(),
            value: FrontMatterValue::String("Again".to_string()),
        },
    };
    assert!(matches!(
        session.execute_frontmatter_command(wrong_session),
        Err(CoreError::SessionMismatch { .. })
    ));
}

#[test]
fn update_add_rename_and_delete_preserve_frontmatter_trivia() {
    let mut session = open(b"---\n# keep\n\ntitle: Old\ncount: 1\n---\nBody\n");

    let update = session
        .execute_frontmatter_command(request(
            &session,
            10,
            FrontMatterCommand::UpdateField {
                key: "title".to_string(),
                value: FrontMatterValue::String("New Title".to_string()),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(update).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\n# keep\n\ntitle: \"New Title\"\ncount: 1\n---\nBody\n"
    );

    let add = session
        .execute_frontmatter_command(request(
            &session,
            11,
            FrontMatterCommand::AddField {
                key: "published".to_string(),
                value: FrontMatterValue::Boolean(true),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(add).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\n# keep\n\ntitle: \"New Title\"\ncount: 1\npublished: true\n---\nBody\n"
    );

    let rename = session
        .execute_frontmatter_command(request(
            &session,
            12,
            FrontMatterCommand::RenameField {
                key: "count".to_string(),
                new_key: "words".to_string(),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(rename).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\n# keep\n\ntitle: \"New Title\"\nwords: 1\npublished: true\n---\nBody\n"
    );

    let delete = session
        .execute_frontmatter_command(request(
            &session,
            13,
            FrontMatterCommand::DeleteField {
                key: "words".to_string(),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(delete).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\n# keep\n\ntitle: \"New Title\"\npublished: true\n---\nBody\n"
    );
}

#[test]
fn update_field_preserves_inline_comment_and_allows_safe_string_symbols() {
    let mut session = open(
        b"---\ntitle: Old # keep inline\nsummary: \"A & B\"\npattern: \"Use * wildcard\"\n---\n",
    );
    let model = session.frontmatter_model().unwrap();
    assert!(
        model.structured_edit_safe,
        "unexpected unsafe reasons: {:?}",
        model.unsafe_reasons
    );

    let update = session
        .execute_frontmatter_command(request(
            &session,
            30,
            FrontMatterCommand::UpdateField {
                key: "title".to_string(),
                value: FrontMatterValue::String("New".to_string()),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(update).unwrap();

    assert_eq!(
        session.text().logical_text(),
        "---\ntitle: New # keep inline\nsummary: \"A & B\"\npattern: \"Use * wildcard\"\n---\n"
    );
}

#[test]
fn path_commands_edit_simple_nested_mapping_fields() {
    let mut session = open(b"---\nmeta:\n  author: Xian\n  draft: false\n---\nBody\n");

    let update = session
        .execute_frontmatter_command(request(
            &session,
            40,
            FrontMatterCommand::UpdateFieldPath {
                path: vec!["meta".to_string(), "author".to_string()],
                value: FrontMatterValue::String("Ada".to_string()),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(update).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\nmeta:\n  author: Ada\n  draft: false\n---\nBody\n"
    );

    let add = session
        .execute_frontmatter_command(request(
            &session,
            41,
            FrontMatterCommand::AddFieldPath {
                path: vec!["meta".to_string(), "reviewed".to_string()],
                value: FrontMatterValue::Boolean(true),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(add).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\nmeta:\n  author: Ada\n  draft: false\n  reviewed: true\n---\nBody\n"
    );

    let rename = session
        .execute_frontmatter_command(request(
            &session,
            42,
            FrontMatterCommand::RenameFieldPath {
                path: vec!["meta".to_string(), "draft".to_string()],
                new_key: "hidden".to_string(),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(rename).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\nmeta:\n  author: Ada\n  hidden: false\n  reviewed: true\n---\nBody\n"
    );

    let delete = session
        .execute_frontmatter_command(request(
            &session,
            43,
            FrontMatterCommand::DeleteFieldPath {
                path: vec!["meta".to_string(), "hidden".to_string()],
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(delete).unwrap();
    assert_eq!(
        session.text().logical_text(),
        "---\nmeta:\n  author: Ada\n  reviewed: true\n---\nBody\n"
    );
}

#[test]
fn add_field_preserves_crlf_source_line_endings() {
    let mut session = DocumentSession::open_bytes(
        SessionId(7),
        DocumentId(11),
        b"---\r\ntitle: Old\r\n---\r\nBody\r\n",
    )
    .unwrap();

    let add = session
        .execute_frontmatter_command(request(
            &session,
            20,
            FrontMatterCommand::AddField {
                key: "published".to_string(),
                value: FrontMatterValue::Boolean(false),
            },
        ))
        .unwrap()
        .patch;
    session.apply_patch(add).unwrap();

    assert_eq!(
        session.save_payload().as_bytes(),
        b"---\r\ntitle: Old\r\npublished: false\r\n---\r\nBody\r\n"
    );
}
