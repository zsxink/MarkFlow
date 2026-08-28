// Rust parser-candidate adapters for the P4A spike (task 6.1).
//
//   - markdown-rs  (`markdown` crate 1.0): mdast tree, byte offsets,
//     NO delimiter/marker nodes (mdast position only).
//   - pulldown-cmark 0.13: event stream; Start/End event ranges carry the
//     delimiter spans, so marker ranges ARE derivable.
//   - comrak 0.54: arena AST with 1-based line/column sourcepos (converted
//     via the line table); no delimiter nodes, but TaskItem carries the
//     checkbox symbol sourcepos.
//
// All adapters emit SpikeConstructs already converted to UTF-16 code units.
use crate::common::{CoordMap, SpikeConstruct};

fn construct(kind: &str, map: &CoordMap, source: (usize, usize), content: Option<(usize, usize)>, markers: Vec<(usize, usize)>, level: Option<u8>, meta: Option<serde_json::Value>) -> SpikeConstruct {
    SpikeConstruct {
        kind: kind.to_string(),
        level,
        meta,
        sourceRange: map.convert(source),
        contentRange: content.map(|r| map.convert(r)),
        markerRanges: markers.into_iter().map(|r| map.convert(r)).collect(),
    }
}

// ── markdown-rs (mdast) ─────────────────────────────────────────────────

fn mdast_children_union(node: &markdown::mdast::Node) -> Option<(usize, usize)> {
    node.children().and_then(|children| {
        let first = children.first()?.position()?;
        let last = children.last()?.position()?;
        Some((first.start.offset, last.end.offset))
    })
}

fn walk_mdast(node: &markdown::mdast::Node, parent_kind: Option<&str>, map: &CoordMap, out: &mut Vec<SpikeConstruct>) {
    use markdown::mdast::Node;
    let pos = node.position();
    let (start, end) = match pos {
        Some(p) => (p.start.offset, p.end.offset),
        None => return,
    };
    macro_rules! emit {
        ($kind:expr) => {
            out.push(construct($kind, map, (start, end), mdast_children_union(node), vec![], None, None))
        };
    }
    match node {
        Node::Heading(h) => {
            out.push(construct("heading", map, (start, end), mdast_children_union(node), vec![], Some(h.depth as u8), None));
        }
        Node::Paragraph(_) => emit!("paragraph"),
        Node::Strong(_) => emit!("strong"),
        Node::Emphasis(_) => emit!("emphasis"),
        Node::Delete(_) => emit!("strikethrough"),
        Node::InlineCode(_) => emit!("inlineCode"),
        Node::Link(_) => emit!("link"),
        Node::Image(_) => emit!("image"),
        Node::Blockquote(_) => emit!("blockquote"),
        Node::List(l) => out.push(construct("list", map, (start, end), None, vec![], None, Some(serde_json::json!({ "ordered": l.ordered })))),
        Node::ListItem(_) => emit!("listItem"),
        Node::Code(c) => out.push(construct("fence", map, (start, end), None, vec![], None, Some(serde_json::json!({ "lang": c.lang, "meta": c.meta })))),
        Node::Html(h) => {
            let kind = if h.value.starts_with("<!--") {
                "htmlComment"
            } else if parent_kind == Some("paragraph") || parent_kind == Some("heading") || parent_kind == Some("tableCell") {
                "htmlInline"
            } else {
                "htmlBlock"
            };
            emit!(kind);
        }
        Node::LinkReference(_) => out.push(construct("link", map, (start, end), mdast_children_union(node), vec![], None, Some(serde_json::json!({ "style": "reference" })))),
        Node::ImageReference(_) => out.push(construct("image", map, (start, end), mdast_children_union(node), vec![], None, Some(serde_json::json!({ "style": "reference" })))),
        Node::Definition(_) => emit!("linkRefDef"),
        Node::FootnoteDefinition(_) => emit!("footnoteDefinition"),
        Node::FootnoteReference(_) => emit!("footnoteReference"),
        Node::Table(_) => emit!("table"),
        // markdown-rs 1.0.0 mdast TableRow has NO isHeader field —
        // header rows are indistinguishable from body rows (recorded finding).
        Node::TableRow(_) => emit!("tableRow"),
        // Parser cell spans include the pipes/spaces; the useful projection
        // range is the child text union (same rule for all Rust candidates).
        Node::TableCell(_) => {
            let inner = mdast_children_union(node).unwrap_or((start, end));
            out.push(construct("tableCell", map, inner, None, vec![], None, None))
        }
        Node::ThematicBreak(_) => emit!("hr"),
        Node::Yaml(_) => emit!("frontmatter"),
        Node::Toml(_) => emit!("frontmatter"),
        _ => {}
    }
    let self_kind = match node {
        Node::Paragraph(_) => Some("paragraph"),
        Node::Heading(_) => Some("heading"),
        Node::Table(_) => Some("table"),
        _ => Some(node_alt_name(node)),
    };
    if let Some(children) = node.children() {
        for c in children {
            walk_mdast(c, self_kind, map, out);
        }
    }
}

fn node_alt_name(node: &markdown::mdast::Node) -> &'static str {
    use markdown::mdast::Node;
    match node {
        Node::Root(_) => "root",
        Node::Blockquote(_) => "blockquote",
        Node::List(_) => "list",
        Node::ListItem(_) => "listItem",
        _ => "other",
    }
}

pub fn parse_mdast(text: &str) -> Result<Vec<SpikeConstruct>, String> {
    let mut constructs = markdown::Constructs::gfm();
    constructs.frontmatter = true;
    let opts = markdown::ParseOptions { constructs, ..Default::default() };
    let tree = markdown::to_mdast(text, &opts).map_err(|e| e.to_string())?;
    let map = CoordMap::build(text);
    let mut out = Vec::new();
    walk_mdast(&tree, None, &map, &mut out);
    Ok(out)
}

/// Native coordinate probe: where does a heading over "# 😀" end (byte offsets)?
pub fn probe_mdast(text: &str) -> Option<(usize, usize)> {
    let mut constructs = markdown::Constructs::gfm();
    constructs.frontmatter = true;
    let opts = markdown::ParseOptions { constructs, ..Default::default() };
    let tree = markdown::to_mdast(text, &opts).ok()?;
    let mut found = None;
    walk_probe(&tree, &mut |node| {
        if let markdown::mdast::Node::Heading(h) = node {
            if let Some(p) = h.position.clone() {
                found = Some((p.start.offset, p.end.offset));
            }
        }
    });
    found
}

fn walk_probe(node: &markdown::mdast::Node, f: &mut impl FnMut(&markdown::mdast::Node)) {
    f(node);
    if let Some(children) = node.children() {
        for c in children {
            walk_probe(c, f);
        }
    }
}

// ── pulldown-cmark ──────────────────────────────────────────────────────

fn pulldown_options() -> pulldown_cmark::Options {
    pulldown_cmark::Options::ENABLE_TABLES
        | pulldown_cmark::Options::ENABLE_STRIKETHROUGH
        | pulldown_cmark::Options::ENABLE_TASKLISTS
        | pulldown_cmark::Options::ENABLE_FOOTNOTES
}

struct Frame {
    kind: &'static str,
    level: Option<u8>,
    start: usize,
    content: Option<(usize, usize)>,
    markers: Vec<(usize, usize)>,
    task_marker: Option<(usize, usize)>,
    first_html_comment: bool,
}

fn tag_kind(tag: &pulldown_cmark::Tag) -> (&'static str, Option<u8>) {
    use pulldown_cmark::{HeadingLevel, Tag};
    match tag {
        Tag::Heading { level, .. } => match level {
            HeadingLevel::H1 => ("heading", Some(1)),
            HeadingLevel::H2 => ("heading", Some(2)),
            HeadingLevel::H3 => ("heading", Some(3)),
            HeadingLevel::H4 => ("heading", Some(4)),
            HeadingLevel::H5 => ("heading", Some(5)),
            HeadingLevel::H6 => ("heading", Some(6)),
        },
        Tag::Paragraph => ("paragraph", None),
        Tag::Strong => ("strong", None),
        Tag::Emphasis => ("emphasis", None),
        Tag::Strikethrough => ("strikethrough", None),
        Tag::BlockQuote(_) => ("blockquote", None),
        Tag::List(_) => ("list", None),
        Tag::Item => ("listItem", None),
        Tag::Table(_) => ("table", None),
        Tag::TableHead => ("tableHeader", None),
        Tag::TableRow => ("tableRow", None),
        Tag::TableCell => ("tableCell", None),
        Tag::FootnoteDefinition(_) => ("footnoteDefinition", None),
        Tag::CodeBlock(kind) => match kind {
            pulldown_cmark::CodeBlockKind::Fenced(_) => ("fence", None),
            pulldown_cmark::CodeBlockKind::Indented => ("indentedCode", None),
        },
        Tag::HtmlBlock => ("htmlBlock", None),
        Tag::Image { .. } => ("image", None),
        Tag::Link { .. } => ("link", None),
        _ => ("other", None),
    }
}


pub fn parse_pulldown(text: &str) -> Result<Vec<SpikeConstruct>, String> {
    let map = CoordMap::build(text);
    let parser = pulldown_cmark::Parser::new_ext(text, pulldown_options());
    let mut out: Vec<SpikeConstruct> = Vec::new();
    let mut frames: Vec<Frame> = Vec::new();

    let update_content = |frames: &mut Vec<Frame>, r: (usize, usize)| {
        for f in frames.iter_mut() {
            match f.content {
                None => f.content = Some(r),
                Some((cs, ce)) => f.content = Some((cs.min(r.0), ce.max(r.1))),
            }
        }
    };

    for (ev, range) in parser.into_offset_iter() {
        match ev {
            pulldown_cmark::Event::Start(tag) => {
                // Child Start ranges cover the whole child element: fold them
                // into the OUTER frames' content before pushing this frame.
                for f in frames.iter_mut() {
                    match f.content {
                        None => f.content = Some((range.start, range.end)),
                        Some((cs, ce)) => f.content = Some((cs.min(range.start), ce.max(range.end))),
                    }
                }
                let (kind, level) = tag_kind(&tag);
                frames.push(Frame {
                    kind,
                    level,
                    start: range.start,
                    content: None,
                    // pulldown-cmark 0.13: Start (and End) event ranges cover
                    // the WHOLE element -- no delimiter spans are exposed
                    // (verified by examples/events.rs). Markers stay empty.
                    markers: vec![],
                    task_marker: None,
                    first_html_comment: false,
                });
            }
            pulldown_cmark::Event::End(_) => {
                if let Some(mut f) = frames.pop() {
                    let mut src_end = range.end.max(f.content.map(|c| c.1).unwrap_or(f.start));
                    let mut src_start = f.start;
                    // Parser cell spans include the pipes/spaces; the useful
                    // projection range is the inner content union.
                    if f.kind == "tableCell" {
                        if let Some((cs, ce)) = f.content {
                            src_start = cs;
                            src_end = ce;
                        }
                    }
                    if f.kind == "htmlBlock" && f.first_html_comment {
                        f.kind = "htmlComment";
                    }
                    // fold this element's span into the OUTER frames' content
                    for o in frames.iter_mut() {
                        match o.content {
                            None => o.content = Some((range.start, range.end)),
                            Some((cs, ce)) => o.content = Some((cs.min(range.start), ce.max(range.end))),
                        }
                    }
                                        out.push(construct(
                        f.kind,
                        &map,
                        (src_start, src_end),
                        f.content,
                        f.markers,
                        f.level,
                        None,
                    ));
                    // GFM task item: also emit the checkbox construct. The
                    // TaskListMarker event range covers the whole "[x]" span.
                    if let Some((ts, te)) = f.task_marker {
                        if f.kind == "listItem" {
                            out.push(construct(
                                "taskCheckbox",
                                &map,
                                (ts, src_end),
                                Some((te, src_end)),
                                vec![(ts, te)],
                                None,
                                None,
                            ));
                        }
                    }
                }
            }
            pulldown_cmark::Event::TaskListMarker(_) => {
                if let Some(f) = frames.last_mut() {
                    f.task_marker = Some((range.start, range.end));
                }
            }
            pulldown_cmark::Event::Html(h) => {
                // inside an HtmlBlock frame (block-level); detect comments
                if let Some(f) = frames.last_mut() {
                    if h.trim_start().starts_with("<!--") {
                        f.first_html_comment = true;
                    }
                }
            }
            pulldown_cmark::Event::Text(_)
            | pulldown_cmark::Event::Code(_)
            | pulldown_cmark::Event::SoftBreak
            | pulldown_cmark::Event::HardBreak
            | pulldown_cmark::Event::FootnoteReference(_) => {
                update_content(&mut frames, (range.start, range.end));
                if let pulldown_cmark::Event::FootnoteReference(_) = ev {
                    out.push(construct("footnoteReference", &map, (range.start, range.end), None, vec![], None, None));
                }
                if let pulldown_cmark::Event::Code(_) = ev {
                    out.push(construct("inlineCode", &map, (range.start, range.end), None, vec![], None, None));
                }
            }
            pulldown_cmark::Event::InlineHtml(_) => {
                update_content(&mut frames, (range.start, range.end));
                out.push(construct("htmlInline", &map, (range.start, range.end), None, vec![], None, None));
            }
            pulldown_cmark::Event::Html(_) => {
                update_content(&mut frames, (range.start, range.end));
            }
            _ => {}
        }
    }
    Ok(out)
}

pub fn probe_pulldown(text: &str) -> Option<(usize, usize)> {
    for (ev, range) in pulldown_cmark::Parser::new_ext(text, pulldown_options()).into_offset_iter() {
        if let pulldown_cmark::Event::Start(pulldown_cmark::Tag::Heading { .. }) = ev {
            return Some((range.start, range.end));
        }
    }
    None
}

// ── comrak ──────────────────────────────────────────────────────────────

fn comrak_options() -> comrak::Options<'static> {
    let mut options = comrak::Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.extension.footnotes = true;
    options.extension.front_matter_delimiter = Some("---".to_owned());
    options
}

struct LineTable {
    starts: Vec<usize>, // byte offset of each line start (0-based line index)
    total: usize,
}

fn line_table(text: &str) -> LineTable {
    let mut starts = vec![0usize];
    for (b, ch) in text.char_indices() {
        if ch == '\n' {
            starts.push(b + 1);
        }
    }
    LineTable { starts, total: text.len() }
}

impl LineTable {
    /// Byte offset of a START position: 1-based column of the first byte.
    fn byte_of_start(&self, line: usize, col: usize) -> usize {
        let li = line.saturating_sub(1);
        let start = self.starts.get(li).copied().unwrap_or(self.total);
        (start + col.saturating_sub(1)).min(self.total)
    }

    /// Byte offset (one-past-end) of an END position: comrak reports the
    /// column of the LAST byte, so one-past-end = lineStart + col.
    /// Verified empirically: '# <emoji>' heading end col = 6 = last byte of
    /// the 4-byte emoji.
    fn byte_of_end(&self, line: usize, col: usize) -> usize {
        let li = line.saturating_sub(1);
        let start = self.starts.get(li).copied().unwrap_or(self.total);
        (start + col).min(self.total)
    }
}

pub fn parse_comrak(text: &str) -> Result<Vec<SpikeConstruct>, String> {
    let map = CoordMap::build(text);
    let lines = line_table(text);
    let arena = comrak::Arena::new();
    let root = comrak::parse_document(&arena, text, &comrak_options());
    let mut out = Vec::new();
    walk_comrak(root, &map, &lines, &mut out);
    Ok(out)
}

fn sourcepos_bytes<'a>(node: &'a comrak::nodes::AstNode<'a>, lines: &LineTable) -> Option<(usize, usize)> {
    let ast = node.data.borrow();
    let sp = ast.sourcepos;
    if sp.start.line == 0 || sp.end.line == 0 {
        return None;
    }
    Some((
        lines.byte_of_start(sp.start.line, sp.start.column),
        lines.byte_of_end(sp.end.line, sp.end.column),
    ))
}

fn comrak_children_union<'a>(node: &'a comrak::nodes::AstNode<'a>, lines: &LineTable) -> Option<(usize, usize)> {
    let mut first: Option<(usize, usize)> = None;
    let mut last: Option<(usize, usize)> = None;
    for c in node.children() {
        if let Some(p) = sourcepos_bytes(c, lines) {
            if first.is_none() {
                first = Some(p);
            }
            last = Some(p);
        }
    }
    match (first, last) {
        (Some((f, _)), Some((_, l))) => Some((f, l)),
        _ => None,
    }
}

fn walk_comrak<'a>(node: &'a comrak::nodes::AstNode<'a>, map: &CoordMap, lines: &LineTable, out: &mut Vec<SpikeConstruct>) {
    use comrak::nodes::NodeValue;
    let span = sourcepos_bytes(node, lines);
    if let Some((start, end)) = span {
        if start < end {
            let content = comrak_children_union(node, lines);
            match &node.data.borrow().value {
                NodeValue::Heading(h) => out.push(construct("heading", map, (start, end), content, vec![], Some(h.level as u8), None)),
                NodeValue::Paragraph => out.push(construct("paragraph", map, (start, end), content, vec![], None, None)),
                NodeValue::Strong => out.push(construct("strong", map, (start, end), content, vec![], None, None)),
                NodeValue::Emph => out.push(construct("emphasis", map, (start, end), content, vec![], None, None)),
                NodeValue::Strikethrough => out.push(construct("strikethrough", map, (start, end), content, vec![], None, None)),
                NodeValue::Code(c) => out.push(construct("inlineCode", map, (start, end), None, vec![], None, Some(serde_json::json!({ "backticks": c.num_backticks })))),
                NodeValue::Link(_) => out.push(construct("link", map, (start, end), content, vec![], None, None)),
                NodeValue::Image(_) => out.push(construct("image", map, (start, end), content, vec![], None, None)),
                NodeValue::BlockQuote | NodeValue::MultilineBlockQuote(_) => out.push(construct("blockquote", map, (start, end), content, vec![], None, None)),
                NodeValue::List(l) => out.push(construct("list", map, (start, end), None, vec![], None, Some(serde_json::json!({ "ordered": l.list_type == comrak::nodes::ListType::Ordered })))),
                NodeValue::Item(_) => out.push(construct("listItem", map, (start, end), content, vec![], None, None)),
                NodeValue::TaskItem(t) => {
                    // comrak exposes the checkbox symbol's own source position.
                    let sym = t.symbol_sourcepos;
                    // symbol_sourcepos covers only the inner ' '/'x' char —
                    // expand by one byte each side to reach the '[' and ']'.
                    let sym_start = lines.byte_of_start(sym.start.line, sym.start.column).saturating_sub(1);
                    let sym_end = lines.byte_of_end(sym.end.line, sym.end.column) + 1;
                    let checkbox = Some((sym_start, sym_end)).filter(|(s, e)| s < e);
                    if let Some((s, e)) = checkbox {
                        out.push(construct(
                            "listItem",
                            map,
                            (start, end),
                            content,
                            vec![],
                            None,
                            Some(serde_json::json!({ "task": true })),
                        ));
                        out.push(construct(
                            "taskCheckbox",
                            map,
                            (s, end),
                            Some((e, end)),
                            vec![(s, e)],
                            None,
                            Some(serde_json::json!({ "symbol": t.symbol })),
                        ));
                    } else {
                        out.push(construct("listItem", map, (start, end), content, vec![], None, None));
                    }
                }
                NodeValue::CodeBlock(cb) => {
                    let kind = if cb.fenced { "fence" } else { "indentedCode" };
                    out.push(construct(kind, map, (start, end), None, vec![], None, Some(serde_json::json!({ "info": cb.info }))));
                }
                NodeValue::HtmlBlock(hb) => {
                    let kind = if hb.literal.trim_start().starts_with("<!--") { "htmlComment" } else { "htmlBlock" };
                    out.push(construct(kind, map, (start, end), None, vec![], None, None))
                }
                NodeValue::FrontMatter(_) => out.push(construct("frontmatter", map, (start, end), None, vec![], None, None)),
                NodeValue::Table(_) => out.push(construct("table", map, (start, end), content, vec![], None, None)),
                NodeValue::TableRow(is_header) => out.push(construct(if *is_header { "tableHeader" } else { "tableRow" }, map, (start, end), content, vec![], None, None)),
                // Parser cell spans include the pipes/spaces; the useful
                // projection range is the child text union (same rule for all
                // Rust candidates).
                NodeValue::TableCell => {
                    let inner = content.unwrap_or((start, end));
                    out.push(construct("tableCell", map, inner, None, vec![], None, None))
                }
                NodeValue::HtmlInline(_) => out.push(construct("htmlInline", map, (start, end), None, vec![], None, None)),
                NodeValue::FootnoteDefinition(_) => out.push(construct("footnoteDefinition", map, (start, end), content, vec![], None, None)),
                NodeValue::FootnoteReference(_) => out.push(construct("footnoteReference", map, (start, end), None, vec![], None, None)),
                NodeValue::ThematicBreak => out.push(construct("hr", map, (start, end), None, vec![], None, None)),
                NodeValue::Escaped => out.push(construct("escape", map, (start, end), None, vec![], None, None)),
                _ => {}
            }
        }
    }
    for c in node.children() {
        walk_comrak(c, map, lines, out);
    }
}

pub fn probe_comrak(text: &str) -> Option<(usize, usize, usize, usize)> {
    let arena = comrak::Arena::new();
    let root = comrak::parse_document(&arena, text, &comrak_options());
    for d in root.descendants() {
        if matches!(d.data.borrow().value, comrak::nodes::NodeValue::Heading(_)) {
            let sp = d.data.borrow().sourcepos;
            return Some((sp.start.line, sp.start.column, sp.end.line, sp.end.column));
        }
    }
    None
}
