mod common;

use common::{fixture, open};
use markflow_core::{
    BlockId, BlockKind, BulletMarker, CoreError, DeferredWork, DocumentSession, DocumentSizeClass,
    FenceMarker, LineEndingKind, OrderedDelimiter, Revision, SourceRange, TableAlignment,
    TableRowRole, TextChange, TextPatch, TransactionId,
};

fn block_kinds(session: &DocumentSession) -> Vec<BlockKind> {
    session
        .parse_index()
        .parse_index
        .blocks
        .iter()
        .filter(|block| block.kind != BlockKind::Document)
        .map(|block| block.kind.clone())
        .collect()
}

#[test]
fn block_scanner_recognizes_core_markdown_blocks_and_ranges() {
    let bytes = b"---\ntitle: M2\n---\n\n# Title\n\n<!-- note -->\n\n![alt](img.png)\n\n> quote\n\n- [x] task\n\n***\n\n[ref]: https://example.com\n\nparagraph\n";
    let session = open(bytes);
    let outcome = session.parse_index();
    let kinds: Vec<_> = outcome
        .parse_index
        .blocks
        .iter()
        .filter(|block| block.kind != BlockKind::Document)
        .map(|block| block.kind.clone())
        .collect();

    assert_eq!(
        kinds,
        vec![
            BlockKind::FrontMatter,
            BlockKind::Heading { level: 1 },
            BlockKind::HtmlComment,
            BlockKind::ImageBlock,
            BlockKind::Blockquote,
            BlockKind::TaskList,
            BlockKind::ThematicBreak,
            BlockKind::LinkReference,
            BlockKind::Paragraph,
        ]
    );

    let frontmatter = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::FrontMatter)
        .unwrap();
    assert_eq!(frontmatter.range, SourceRange::new(Revision(0), 0, 17));
    assert_eq!(frontmatter.line_range.start, 0);
    assert_eq!(frontmatter.line_range.end, 3);
    assert_eq!(outcome.parse_index.block_by_line[0], frontmatter.id);
}

#[test]
fn outline_matches_heading_hierarchy() {
    let session = open(b"# One\n\n## Two ##\n\n### Three\n");
    let outline = session.parse_index().parse_index.outline;
    let levels_and_titles: Vec<_> = outline
        .iter()
        .map(|item| (item.level, item.title.as_str()))
        .collect();

    assert_eq!(
        levels_and_titles,
        vec![(1, "One"), (2, "Two"), (3, "Three")]
    );
}

#[test]
fn heading_content_range_preserves_atx_closing_marker() {
    let session = open(b"## Title ##\n");
    let outcome = session.parse_index();
    let heading = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Heading { level: 2 })
        .unwrap();

    assert_eq!(
        &session.text().logical_text()[heading.content_range.start.0..heading.content_range.end.0],
        "Title ##"
    );
    assert_eq!(outcome.parse_index.outline[0].title, "Title");
}

#[test]
fn atx_heading_title_preserves_literal_hashes() {
    let source = b"# C# Primer\n\n## Closed ##\n\n### ###\n";
    let outcome = open(source).parse_index();
    let titles: Vec<_> = outcome
        .parse_index
        .outline
        .iter()
        .map(|item| item.title.as_str())
        .collect();

    assert_eq!(titles, vec!["C# Primer", "Closed", ""]);
}

#[test]
fn frontmatter_and_html_comment_fixtures_are_distinct_blocks() {
    let frontmatter = open(&fixture("frontmatter.md"));
    assert!(block_kinds(&frontmatter).contains(&BlockKind::FrontMatter));
    assert!(!matches!(
        block_kinds(&frontmatter)[0],
        BlockKind::ThematicBreak
    ));

    let html = open(&fixture("html-comment.md"));
    assert!(block_kinds(&html).contains(&BlockKind::HtmlComment));
}

#[test]
fn unclosed_frontmatter_delimiter_falls_back_to_markdown_blocks() {
    let session = open(b"---\n# Still a Heading\n");
    let kinds = block_kinds(&session);

    assert_eq!(
        kinds,
        vec![BlockKind::ThematicBreak, BlockKind::Heading { level: 1 }]
    );
}

#[test]
fn list_markers_are_recorded_in_style_map() {
    let session = open(&fixture("mixed-list-markers.md"));
    let style = session.parse_index().style_map;
    let bullets: Vec<_> = style
        .list_spans
        .iter()
        .filter_map(|span| span.bullet)
        .collect();
    let ordered: Vec<_> = style
        .list_spans
        .iter()
        .filter_map(|span| span.ordered.map(|marker| marker.delimiter))
        .collect();

    assert_eq!(
        bullets,
        vec![
            BulletMarker::Dash,
            BulletMarker::Asterisk,
            BulletMarker::Plus
        ]
    );
    assert_eq!(
        ordered,
        vec![OrderedDelimiter::Dot, OrderedDelimiter::Paren]
    );
    assert_eq!(style.default_bullet, Some(BulletMarker::Dash));
}

#[test]
fn code_fence_style_records_marker_and_length() {
    let backtick = open(&fixture("code-fence-backtick.md"))
        .parse_index()
        .style_map
        .default_fence
        .unwrap();
    let tilde = open(&fixture("code-fence-tilde.md"))
        .parse_index()
        .style_map
        .default_fence
        .unwrap();

    assert_eq!(backtick.marker, FenceMarker::Backtick);
    assert_eq!(backtick.length, 3);
    assert_eq!(tilde.marker, FenceMarker::Tilde);
    assert_eq!(tilde.length, 3);
}

#[test]
fn empty_frontmatter_and_code_fence_content_ranges_do_not_move_backwards() {
    let outcome = open(b"---\n---\n\n```\n```\n").parse_index();
    let frontmatter = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::FrontMatter)
        .unwrap();
    let fence = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::CodeFence)
        .unwrap();

    assert_eq!(
        frontmatter.content_range,
        SourceRange::new(Revision(0), 4, 4)
    );
    assert_eq!(fence.content_range, SourceRange::new(Revision(0), 13, 13));
}

#[test]
fn list_blocks_include_indented_continuation_lines() {
    let outcome = open(b"- item\n  continuation\n    code\n- next\n\nparagraph\n").parse_index();
    let lists: Vec<_> = outcome
        .parse_index
        .blocks
        .iter()
        .filter(|block| block.kind == BlockKind::BulletList)
        .collect();

    assert_eq!(lists.len(), 1);
    assert_eq!(lists[0].line_range.start, 0);
    assert_eq!(lists[0].line_range.end, 4);
    assert_eq!(outcome.style_map.list_spans[0].line_range.end, 4);
}

#[test]
fn block_by_line_matches_session_line_index() {
    let session = open(b"# Title\n\nparagraph\n");
    let outcome = session.parse_index();

    assert_eq!(
        outcome.parse_index.block_by_line.len(),
        session.line_count()
    );
    assert_eq!(outcome.parse_index.block_by_line[1], BlockId(0));
}

#[test]
fn block_tree_tracks_document_children() {
    let outcome = open(b"# Title\n\nparagraph\n").parse_index();
    let index = outcome.parse_index;
    let document = &index.blocks[0];

    assert_eq!(document.kind, BlockKind::Document);
    assert_eq!(document.parent, None);
    assert_eq!(document.children, vec![BlockId(1), BlockId(2)]);
    assert_eq!(index.blocks[1].parent, Some(BlockId(0)));
    assert_eq!(index.blocks[2].parent, Some(BlockId(0)));
}

#[test]
fn table_alignment_and_pipe_style_are_recorded() {
    let outcome = open(&fixture("table-alignment.md")).parse_index();
    let table = outcome.style_map.table_spans.first().unwrap();

    assert_eq!(
        table.alignments,
        vec![
            TableAlignment::Left,
            TableAlignment::Center,
            TableAlignment::Right
        ]
    );
    assert!(table.has_leading_pipe);
    assert!(table.has_trailing_pipe);
    assert_eq!(table.delimiter_lengths, vec![3, 4, 4]);
    assert_eq!(table.line_range.start, 2);
    assert_eq!(table.line_range.end, 5);
}

#[test]
fn table_scan_stops_before_following_plain_paragraph() {
    let outcome = open(b"| A |\n| --- |\nplain paragraph\n").parse_index();
    let table = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Table)
        .unwrap();
    let paragraph = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Paragraph)
        .unwrap();

    assert_eq!(table.line_range.end, 2);
    assert_eq!(paragraph.line_range.start, 2);
}

#[test]
fn table_scan_keeps_escaped_and_inline_code_pipes_inside_cells() {
    let outcome =
        open(b"| A | B |\n| --- | --- |\n| `a|b` | c\\|d |\nplain paragraph\n").parse_index();
    let table = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Table)
        .unwrap();
    let paragraph = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Paragraph)
        .unwrap();

    assert_eq!(table.line_range.end, 3);
    assert_eq!(paragraph.line_range.start, 3);
}

#[test]
fn unmatched_backtick_does_not_hide_following_table_delimiter() {
    let outcome = open(b"| a ` | b |\n| --- | --- |\n| c | d |\n").parse_index();
    let table = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Table)
        .unwrap();

    assert_eq!(table.line_range.start, 0);
    assert_eq!(table.line_range.end, 3);
}

#[test]
fn table_model_exposes_cell_values_source_ranges_and_style() {
    let source = b"| A | B |\n| :--- | ---: |\n| `a|b` | c\\|d |\n| | value |";
    let session = open(source);
    let outcome = session.parse_index();
    let table = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Table)
        .unwrap();
    let model = session
        .table_model(table.id, session.revision())
        .unwrap()
        .unwrap();
    let text = session.text().logical_text();

    assert_eq!(model.block_id, table.id);
    assert_eq!(
        model
            .columns
            .iter()
            .map(|column| column.alignment)
            .collect::<Vec<_>>(),
        vec![TableAlignment::Left, TableAlignment::Right]
    );
    assert!(model.style.has_leading_pipe);
    assert!(model.style.has_trailing_pipe);
    assert_eq!(model.style.delimiter_lengths, vec![3, 3]);
    assert_eq!(model.rows[0].role, TableRowRole::Header);
    assert_eq!(model.rows[1].role, TableRowRole::Delimiter);
    assert_eq!(model.rows[2].role, TableRowRole::Body);
    assert_eq!(model.rows[2].cells[0].value, "`a|b`");
    assert_eq!(model.rows[2].cells[1].value, "c\\|d");
    assert_eq!(model.rows[3].cells[0].value, "");
    assert_eq!(model.rows[3].cells[1].value, "value");

    let inline = text.find("`a|b`").unwrap();
    assert_eq!(
        model.rows[2].cells[0].content_range,
        SourceRange::new(Revision(0), inline, inline + "`a|b`".len())
    );
    let escaped = text.find("c\\|d").unwrap();
    assert_eq!(
        model.rows[2].cells[1].content_range,
        SourceRange::new(Revision(0), escaped, escaped + "c\\|d".len())
    );
}

#[test]
fn table_model_rejects_stale_revision_and_non_table_blocks() {
    let session = open(b"# Heading\n\n| A |\n| --- |\n");
    let outcome = session.parse_index();
    let heading = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Heading { level: 1 })
        .unwrap();
    let table = outcome
        .parse_index
        .blocks
        .iter()
        .find(|block| block.kind == BlockKind::Table)
        .unwrap();

    assert_eq!(
        session.table_model(heading.id, session.revision()),
        Ok(None)
    );
    assert!(matches!(
        session.table_model(table.id, Revision(99)),
        Err(CoreError::StaleRevision { .. })
    ));
}

#[test]
fn dominant_line_ending_is_preserved_from_original_snapshot() {
    let outcome = open(&fixture("crlf.md")).parse_index();

    assert_eq!(outcome.style_map.dominant_line_ending, LineEndingKind::Crlf);
}

#[test]
fn large_document_policy_uses_byte_thresholds_and_defers_expensive_work() {
    let normal = open(&vec![b'a'; 1024 * 1024])
        .parse_index()
        .large_document_policy;
    let large = open(&vec![b'a'; 1024 * 1024 + 1])
        .parse_index()
        .large_document_policy;
    let huge = open(&vec![b'a'; 10 * 1024 * 1024 + 1])
        .parse_index()
        .large_document_policy;

    assert_eq!(normal.size_class, DocumentSizeClass::Normal);
    assert_eq!(large.size_class, DocumentSizeClass::Large);
    assert_eq!(huge.size_class, DocumentSizeClass::Huge);
    assert_eq!(large.inline_parse, DeferredWork::OnDemand);
    assert_eq!(large.diagram_render, DeferredWork::OnDemand);
    assert_eq!(large.image_diagnostics, DeferredWork::OnDemand);
    assert_eq!(large.full_diagnostics, DeferredWork::OnDemand);
    assert!(large.viewport_render);
    assert!(large.paged_search);
    assert!(!large.permits_default_inline_parse());
    assert!(!huge.permits_default_full_diagnostics());
}

#[test]
fn large_document_policy_uses_source_bytes_not_logical_text_bytes() {
    let bytes = "a\r\n".repeat(350_000);
    let session = open(bytes.as_bytes());
    assert!(session.text().logical_text().len() <= 1024 * 1024);

    let policy = session.parse_index().large_document_policy;

    assert_eq!(policy.byte_len, bytes.len());
    assert_eq!(policy.size_class, DocumentSizeClass::Large);
}

#[test]
fn update_after_patch_marks_large_sync_rescan_for_background_recovery() {
    let session = open(b"# Title\n\nbody\n");
    let mut index = session.parse_index().parse_index;
    let patch = TextPatch {
        transaction_id: TransactionId(77),
        base_revision: Revision(0),
        changes: vec![TextChange {
            range: SourceRange::new(Revision(0), 0, 10 * 1024 * 1024),
            replacement: "x".repeat(300 * 1024),
        }],
        selection_after: None,
    };

    let affected = index.update_after_patch(&patch);

    assert!(affected.synchronous_budget_exhausted);
    assert!(affected.requires_background_full_parse);
    assert_eq!(affected.revision, Revision(0));
}

#[test]
fn update_after_patch_starts_at_existing_block_boundary() {
    let prefix = "intro\n\n";
    let source = format!("{prefix}paragraph line\ncontinued\n\nnext\n");
    let session = open(source.as_bytes());
    let mut index = session.parse_index().parse_index;
    let edit_start = source.find("continued").unwrap();
    let patch = TextPatch {
        transaction_id: TransactionId(78),
        base_revision: Revision(0),
        changes: vec![TextChange {
            range: SourceRange::new(Revision(0), edit_start, edit_start + "continued".len()),
            replacement: "changed".to_string(),
        }],
        selection_after: None,
    };

    let affected = index.update_after_patch(&patch);

    assert_eq!(affected.stale_ranges[0].start.0, prefix.len());
    assert!(!affected.requires_background_full_parse);
}

#[test]
fn update_after_patch_flags_fence_open_close_as_far_reparse_risk() {
    let session = open(b"paragraph\n\n# after\n");
    let mut index = session.parse_index().parse_index;
    let patch = TextPatch {
        transaction_id: TransactionId(79),
        base_revision: Revision(0),
        changes: vec![TextChange {
            range: SourceRange::new(Revision(0), 0, 0),
            replacement: "```\n".to_string(),
        }],
        selection_after: None,
    };

    let affected = index.update_after_patch(&patch);

    assert!(affected.requires_background_full_parse);
    assert!(affected.synchronous_budget_exhausted);
}

#[test]
fn update_after_patch_flags_list_indentation_as_far_reparse_risk() {
    let session = open(b"- item\n  continuation\n\noutside\n");
    let mut index = session.parse_index().parse_index;
    let continuation = session.text().logical_text().find("continuation").unwrap();
    let patch = TextPatch {
        transaction_id: TransactionId(80),
        base_revision: Revision(0),
        changes: vec![TextChange {
            range: SourceRange::new(Revision(0), continuation - 2, continuation),
            replacement: String::new(),
        }],
        selection_after: None,
    };

    let affected = index.update_after_patch(&patch);

    assert!(affected.requires_background_full_parse);
}

#[test]
fn update_after_patch_flags_html_comment_as_far_reparse_risk() {
    let session = open(b"<!--\ncomment\n-->\n\n# after\n");
    let mut index = session.parse_index().parse_index;
    let comment = session.text().logical_text().find("comment").unwrap();
    let patch = TextPatch {
        transaction_id: TransactionId(81),
        base_revision: Revision(0),
        changes: vec![TextChange {
            range: SourceRange::new(Revision(0), comment, comment + "comment".len()),
            replacement: "changed".to_string(),
        }],
        selection_after: None,
    };

    let affected = index.update_after_patch(&patch);

    assert!(affected.requires_background_full_parse);
}

#[test]
fn parse_index_cache_is_invalidated_after_patch() {
    let mut session = open(b"# Old\n");
    assert_eq!(session.parse_index().parse_index.outline[0].title, "Old");

    let patch = TextPatch {
        transaction_id: TransactionId(82),
        base_revision: Revision(0),
        changes: vec![TextChange {
            range: SourceRange::new(Revision(0), 2, 5),
            replacement: "New".to_string(),
        }],
        selection_after: None,
    };
    let outcome = session.apply_patch(patch).unwrap();
    let outline = session.parse_index().parse_index.outline;

    assert_eq!(outcome.revision, Revision(1));
    assert_eq!(outline[0].range.revision, Revision(1));
    assert_eq!(outline[0].title, "New");
}
