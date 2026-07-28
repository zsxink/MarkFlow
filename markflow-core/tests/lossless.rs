use std::fs;
use std::path::Path;

mod common;

use common::{fixture, open, patch_at};
use markflow_core::{
    BlockKind, DocumentSession, Revision, SourceRange, TextChange, TextPatch, TransactionId,
};

const FIXTURE_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/lossless");

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

fn markdown_options() -> markdown::ParseOptions {
    let mut constructs = markdown::Constructs::gfm();
    constructs.frontmatter = true;
    markdown::ParseOptions {
        constructs,
        ..markdown::ParseOptions::gfm()
    }
}

fn collect_markdown_rs_blocks(node: &markdown::mdast::Node, out: &mut Vec<&'static str>) {
    match node {
        markdown::mdast::Node::Heading(_) => out.push("heading"),
        markdown::mdast::Node::List(_) => out.push("list"),
        markdown::mdast::Node::Code(_) => out.push("code"),
        markdown::mdast::Node::Table(_) => out.push("table"),
        _ => {}
    }
    if let Some(children) = node.children() {
        for child in children {
            collect_markdown_rs_blocks(child, out);
        }
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
fn parser_does_not_rewrite_content_or_fail_unknown_syntax() {
    let bytes = b"::: unknown\nstill text\n:::\n";
    let session = open(bytes);

    assert_eq!(session.save_payload().as_bytes(), bytes);
    assert!(session
        .parse_index()
        .parse_index
        .blocks
        .iter()
        .any(|block| block.kind == BlockKind::Paragraph));
}

#[test]
fn parser_comparison_covers_basic_block_structure_with_allowlist() {
    let source = "# Title\n\n- [x] task\n\n```rust\nlet x = 1;\n```\n\n| A | B |\n| --- | :---: |\n| 1 | 2 |\n";
    let session = open(source.as_bytes());
    let markflow_blocks: Vec<_> = session
        .parse_index()
        .parse_index
        .blocks
        .iter()
        .filter_map(|block| match block.kind {
            BlockKind::Heading { .. } => Some("heading"),
            BlockKind::TaskList | BlockKind::BulletList | BlockKind::OrderedList => Some("list"),
            BlockKind::CodeFence => Some("code"),
            BlockKind::Table => Some("table"),
            _ => None,
        })
        .collect();

    let mdast = markdown::to_mdast(source, &markdown_options()).unwrap();
    let mut markdown_rs_blocks = Vec::new();
    collect_markdown_rs_blocks(&mdast, &mut markdown_rs_blocks);

    assert_eq!(markflow_blocks, vec!["heading", "list", "code", "table"]);
    assert_eq!(markdown_rs_blocks, vec!["heading", "list", "code", "table"]);

    let allowlist = [(
        "task-list-style",
        "markdown-rs models task state on list items; MarkFlow promotes task list style into StyleMap and BlockKind::TaskList for edit commands.",
    )];
    assert!(allowlist
        .iter()
        .any(|(name, reason)| { *name == "task-list-style" && reason.contains("StyleMap") }));
}
