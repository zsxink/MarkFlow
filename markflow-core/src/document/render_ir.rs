use super::{
    BlockKind, ByteOffset, CoreError, CoreResult, DocumentId, DocumentSession, DocumentSizeClass,
    LineRange, Revision, SessionId, SourceRange, Utf16Offset,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UiRange {
    pub start: Utf16Offset,
    pub end: Utf16Offset,
}

impl UiRange {
    pub fn new(start: usize, end: usize) -> Self {
        Self {
            start: Utf16Offset(start),
            end: Utf16Offset(end),
        }
    }

    pub fn intersects(&self, other: UiRange) -> bool {
        self.start.0 < other.end.0 && other.start.0 < self.end.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderRequest {
    pub revision: Revision,
    pub viewport: UiRange,
    pub request_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderDocument {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub request_id: String,
    pub viewport: UiRange,
    pub blocks: Vec<RenderBlock>,
    pub large_document: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderBlock {
    pub id: String,
    pub kind: RenderBlockKind,
    pub source_range: UiRange,
    pub content_range: UiRange,
    pub line_range: LineRange,
    pub text: String,
    pub inlines: Vec<RenderInline>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RenderBlockKind {
    Heading { level: u8 },
    Paragraph,
    Blockquote,
    BulletList,
    OrderedList,
    TaskList,
    CodeFence,
    Image,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderInline {
    pub kind: RenderInlineKind,
    pub source_range: UiRange,
    pub content_range: UiRange,
    pub marker_ranges: Vec<UiRange>,
    pub text: String,
    pub target: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RenderInlineKind {
    Strong,
    Emphasis,
    InlineCode,
    Link,
    ImageReference,
}

impl DocumentSession {
    pub fn render_blocks(&self, request: RenderRequest) -> CoreResult<RenderDocument> {
        if request.revision != self.revision() {
            return Err(CoreError::StaleRevision {
                expected: request.revision,
                actual: self.revision(),
            });
        }
        if request.viewport.start > request.viewport.end {
            return Err(CoreError::InvalidRange);
        }

        let viewport_start = self.byte_for_utf16(request.viewport.start)?;
        let viewport_end = self.byte_for_utf16(request.viewport.end)?;
        let viewport_source = SourceRange {
            revision: request.revision,
            start: viewport_start,
            end: viewport_end,
        };
        let outcome = self.parse_index();
        let text = self.text().logical_text();
        let blocks = outcome
            .parse_index
            .blocks
            .iter()
            .filter(|block| block.kind != BlockKind::Document)
            .filter(|block| source_ranges_intersect(block.range, viewport_source))
            .map(|block| {
                let kind = RenderBlockKind::from_parse_kind(&block.kind);
                let inlines =
                    if matches!(kind, RenderBlockKind::CodeFence | RenderBlockKind::Unknown) {
                        Vec::new()
                    } else {
                        parse_inline_spans(self, block.content_range, text)?
                    };
                Ok(RenderBlock {
                    id: format!("b{}", block.id.0),
                    kind,
                    source_range: self.ui_range_for_source(block.range)?,
                    content_range: self.ui_range_for_source(block.content_range)?,
                    line_range: block.line_range,
                    text: slice_source(text, block.range).to_string(),
                    inlines,
                })
            })
            .collect::<CoreResult<Vec<_>>>()?;

        Ok(RenderDocument {
            session_id: self.id,
            document_id: self.document_id,
            revision: self.revision(),
            request_id: request.request_id,
            viewport: request.viewport,
            blocks,
            large_document: outcome.large_document_policy.size_class != DocumentSizeClass::Normal,
        })
    }

    fn ui_range_for_source(&self, range: SourceRange) -> CoreResult<UiRange> {
        Ok(UiRange {
            start: self.utf16_for_byte(range.start)?,
            end: self.utf16_for_byte(range.end)?,
        })
    }
}

impl RenderBlockKind {
    fn from_parse_kind(kind: &BlockKind) -> Self {
        match kind {
            BlockKind::Heading { level } => Self::Heading { level: *level },
            BlockKind::Paragraph => Self::Paragraph,
            BlockKind::Blockquote => Self::Blockquote,
            BlockKind::BulletList => Self::BulletList,
            BlockKind::OrderedList => Self::OrderedList,
            BlockKind::TaskList => Self::TaskList,
            BlockKind::CodeFence => Self::CodeFence,
            BlockKind::ImageBlock => Self::Image,
            _ => Self::Unknown,
        }
    }
}

fn source_ranges_intersect(a: SourceRange, b: SourceRange) -> bool {
    a.revision == b.revision && a.start.0 < b.end.0 && b.start.0 < a.end.0
}

fn slice_source(text: &str, range: SourceRange) -> &str {
    &text[range.start.0..range.end.0]
}

fn parse_inline_spans(
    session: &DocumentSession,
    content_range: SourceRange,
    text: &str,
) -> CoreResult<Vec<RenderInline>> {
    let mut spans = Vec::new();
    let content = slice_source(text, content_range);
    parse_image_and_link_spans(session, content_range, content, &mut spans)?;
    parse_delimited_spans(
        session,
        content_range,
        content,
        &mut spans,
        "**",
        RenderInlineKind::Strong,
    )?;
    parse_delimited_spans(
        session,
        content_range,
        content,
        &mut spans,
        "__",
        RenderInlineKind::Strong,
    )?;
    parse_delimited_spans(
        session,
        content_range,
        content,
        &mut spans,
        "`",
        RenderInlineKind::InlineCode,
    )?;
    parse_single_emphasis(session, content_range, content, &mut spans, '*')?;
    parse_single_emphasis(session, content_range, content, &mut spans, '_')?;
    spans.sort_by_key(|span| span.source_range.start.0);
    Ok(spans)
}

fn parse_delimited_spans(
    session: &DocumentSession,
    content_range: SourceRange,
    content: &str,
    spans: &mut Vec<RenderInline>,
    marker: &str,
    kind: RenderInlineKind,
) -> CoreResult<()> {
    let mut cursor = 0;
    while let Some(open_rel) = find_at_boundary(content, marker, cursor) {
        let inner_start = open_rel + marker.len();
        let Some(close_rel) = find_at_boundary(content, marker, inner_start) else {
            break;
        };
        if close_rel == inner_start {
            cursor = close_rel + marker.len();
            continue;
        }
        spans.push(build_inline(
            session,
            content_range,
            kind.clone(),
            SpanOffsets {
                source_start: open_rel,
                source_end: close_rel + marker.len(),
                content_start: inner_start,
                content_end: close_rel,
            },
            vec![
                (open_rel, inner_start),
                (close_rel, close_rel + marker.len()),
            ],
            None,
        )?);
        cursor = close_rel + marker.len();
    }
    Ok(())
}

fn parse_single_emphasis(
    session: &DocumentSession,
    content_range: SourceRange,
    content: &str,
    spans: &mut Vec<RenderInline>,
    marker: char,
) -> CoreResult<()> {
    let marker_len = marker.len_utf8();
    let mut cursor = 0;
    while let Some(open_rel) = find_single_marker(content, marker, cursor) {
        let inner_start = open_rel + marker_len;
        let Some(close_rel) = find_single_marker(content, marker, inner_start) else {
            break;
        };
        if close_rel == inner_start {
            cursor = close_rel + marker_len;
            continue;
        }
        spans.push(build_inline(
            session,
            content_range,
            RenderInlineKind::Emphasis,
            SpanOffsets {
                source_start: open_rel,
                source_end: close_rel + marker_len,
                content_start: inner_start,
                content_end: close_rel,
            },
            vec![(open_rel, inner_start), (close_rel, close_rel + marker_len)],
            None,
        )?);
        cursor = close_rel + marker_len;
    }
    Ok(())
}

fn parse_image_and_link_spans(
    session: &DocumentSession,
    content_range: SourceRange,
    content: &str,
    spans: &mut Vec<RenderInline>,
) -> CoreResult<()> {
    let mut cursor = 0;
    while let Some(open_bracket) = content[cursor..].find('[').map(|idx| cursor + idx) {
        let is_image = open_bracket > 0 && content.as_bytes()[open_bracket - 1] == b'!';
        let source_start = if is_image {
            open_bracket - 1
        } else {
            open_bracket
        };
        let text_start = open_bracket + 1;
        let Some(close_bracket) = content[text_start..].find(']').map(|idx| text_start + idx)
        else {
            break;
        };
        let open_paren = close_bracket + 1;
        if content.as_bytes().get(open_paren) != Some(&b'(') {
            cursor = close_bracket + 1;
            continue;
        }
        let target_start = open_paren + 1;
        let Some(close_paren) = content[target_start..]
            .find(')')
            .map(|idx| target_start + idx)
        else {
            break;
        };
        let target = content[target_start..close_paren].to_string();
        let marker_ranges = if is_image {
            vec![
                (source_start, text_start),
                (close_bracket, target_start),
                (close_paren, close_paren + 1),
            ]
        } else {
            vec![
                (open_bracket, text_start),
                (close_bracket, target_start),
                (close_paren, close_paren + 1),
            ]
        };
        spans.push(build_inline(
            session,
            content_range,
            if is_image {
                RenderInlineKind::ImageReference
            } else {
                RenderInlineKind::Link
            },
            SpanOffsets {
                source_start,
                source_end: close_paren + 1,
                content_start: text_start,
                content_end: close_bracket,
            },
            marker_ranges,
            Some(target),
        )?);
        cursor = close_paren + 1;
    }
    Ok(())
}

struct SpanOffsets {
    source_start: usize,
    source_end: usize,
    content_start: usize,
    content_end: usize,
}

fn build_inline(
    session: &DocumentSession,
    content_range: SourceRange,
    kind: RenderInlineKind,
    offsets: SpanOffsets,
    marker_ranges_rel: Vec<(usize, usize)>,
    target: Option<String>,
) -> CoreResult<RenderInline> {
    let source_range = absolute_range(content_range, offsets.source_start, offsets.source_end);
    let content_source_range =
        absolute_range(content_range, offsets.content_start, offsets.content_end);
    let marker_ranges = marker_ranges_rel
        .into_iter()
        .map(|(start, end)| session.ui_range_for_source(absolute_range(content_range, start, end)))
        .collect::<CoreResult<Vec<_>>>()?;
    Ok(RenderInline {
        kind,
        source_range: session.ui_range_for_source(source_range)?,
        content_range: session.ui_range_for_source(content_source_range)?,
        marker_ranges,
        text: slice_source(session.text().logical_text(), content_source_range).to_string(),
        target,
    })
}

fn absolute_range(base: SourceRange, start: usize, end: usize) -> SourceRange {
    SourceRange {
        revision: base.revision,
        start: ByteOffset(base.start.0 + start),
        end: ByteOffset(base.start.0 + end),
    }
}

fn find_at_boundary(text: &str, needle: &str, start: usize) -> Option<usize> {
    text[start..]
        .find(needle)
        .map(|idx| start + idx)
        .filter(|idx| text.is_char_boundary(*idx))
}

fn find_single_marker(text: &str, marker: char, start: usize) -> Option<usize> {
    let marker_byte = marker as u8;
    let bytes = text.as_bytes();
    let mut idx = start;
    while idx < bytes.len() {
        if bytes[idx] == marker_byte
            && text.is_char_boundary(idx)
            && bytes.get(idx + 1) != Some(&marker_byte)
            && (idx == 0 || bytes.get(idx - 1) != Some(&marker_byte))
        {
            return Some(idx);
        }
        idx += 1;
    }
    None
}
