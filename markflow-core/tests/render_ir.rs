mod common;

use common::open;
use markflow_core::{
    BlockKind, CoreError, RenderBlockKind, RenderInlineKind, RenderRequest, Revision, TextChange,
    TextPatch, TransactionId, UiRange, Utf16Offset,
};

fn render_all(text: &[u8]) -> markflow_core::RenderDocument {
    let session = open(text);
    session
        .render_blocks(RenderRequest {
            revision: Revision(0),
            viewport: UiRange::new(0, session.text().logical_text().encode_utf16().count()),
            request_id: "r1".into(),
        })
        .unwrap()
}

#[test]
fn render_ir_returns_utf16_ranges_and_m5_blocks() {
    let document = render_all(
        b"# Title\n\nparagraph\n\n> quote\n\n- item\n\n1. item\n\n- [x] task\n\n```rust\nfn main() {}\n```\n\n![alt](img.png)\n\n---\n",
    );
    let kinds: Vec<_> = document
        .blocks
        .iter()
        .map(|block| block.kind.clone())
        .collect();

    assert_eq!(
        kinds,
        vec![
            RenderBlockKind::Heading { level: 1 },
            RenderBlockKind::Paragraph,
            RenderBlockKind::Blockquote,
            RenderBlockKind::BulletList,
            RenderBlockKind::OrderedList,
            RenderBlockKind::TaskList,
            RenderBlockKind::CodeFence,
            RenderBlockKind::Image,
            RenderBlockKind::Unknown,
        ]
    );
    assert_eq!(document.blocks[0].source_range, UiRange::new(0, 7));
    assert_eq!(document.blocks[8].text, "---");
}

#[test]
fn render_ir_maps_utf16_offsets_for_unicode_content() {
    let session = open("# 标题 😀\n\n**粗体** and `code`\n".as_bytes());
    let document = session
        .render_blocks(RenderRequest {
            revision: Revision(0),
            viewport: UiRange::new(0, session.text().logical_text().encode_utf16().count()),
            request_id: "unicode".into(),
        })
        .unwrap();

    assert_eq!(document.blocks[0].source_range, UiRange::new(0, 7));
    let strong = document.blocks[1]
        .inlines
        .iter()
        .find(|span| span.kind == RenderInlineKind::Strong)
        .unwrap();
    assert_eq!(strong.text, "粗体");
    assert_eq!(strong.marker_ranges.len(), 2);
}

#[test]
fn render_ir_extracts_inline_spans_and_marker_ranges() {
    let document = render_all(b"**bold** *em* `code` [site](https://example.com) ![alt](img.png)\n");
    let block = &document.blocks[0];
    let kinds: Vec<_> = block
        .inlines
        .iter()
        .map(|span| span.kind.clone())
        .collect();

    assert_eq!(
        kinds,
        vec![
            RenderInlineKind::Strong,
            RenderInlineKind::Emphasis,
            RenderInlineKind::InlineCode,
            RenderInlineKind::Link,
            RenderInlineKind::ImageReference,
        ]
    );
    assert_eq!(block.inlines[0].marker_ranges, vec![UiRange::new(0, 2), UiRange::new(6, 8)]);
    assert_eq!(block.inlines[3].target.as_deref(), Some("https://example.com"));
    assert_eq!(block.inlines[4].target.as_deref(), Some("img.png"));
}

#[test]
fn stale_revision_is_rejected() {
    let mut session = open(b"abc\n");
    session
        .apply_patch(TextPatch {
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![TextChange {
                range: markflow_core::SourceRange::new(Revision(0), 0, 0),
                replacement: "x".into(),
            }],
            selection_after: None,
        })
        .unwrap();

    let err = session
        .render_blocks(RenderRequest {
            revision: Revision(0),
            viewport: UiRange::new(0, 1),
            request_id: "stale".into(),
        })
        .unwrap_err();

    assert_eq!(
        err,
        CoreError::StaleRevision {
            expected: Revision(0),
            actual: Revision(1),
        }
    );
}

#[test]
fn viewport_limits_returned_blocks_for_large_documents() {
    let mut text = String::from("# First\n\n");
    text.push_str(&"a".repeat(1024 * 1024 + 1));
    text.push_str("\n\n# Last\n");
    let session = open(text.as_bytes());
    let document = session
        .render_blocks(RenderRequest {
            revision: Revision(0),
            viewport: UiRange {
                start: Utf16Offset(0),
                end: Utf16Offset(8),
            },
            request_id: "large".into(),
        })
        .unwrap();

    assert!(document.large_document);
    assert_eq!(document.blocks.len(), 1);
    assert_eq!(document.blocks[0].kind, RenderBlockKind::Heading { level: 1 });
}

#[test]
fn parse_index_keeps_source_fallback_for_non_m5_blocks() {
    let document = render_all(b"---\ntitle: x\n---\n");
    assert_eq!(document.blocks[0].kind, RenderBlockKind::Unknown);
    assert_ne!(BlockKind::Document, BlockKind::FrontMatter);
}
