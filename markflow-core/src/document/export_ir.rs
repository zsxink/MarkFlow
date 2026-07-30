use super::{
    BlockKind, CoreError, CoreResult, DocumentSession, LineRange, Revision, SessionId, SourceRange,
    TableAlignment,
};
use serde::{Deserialize, Serialize};

pub const EXPORT_IR_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportOptions {
    pub include_diagnostics: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            include_diagnostics: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportRequest {
    pub session_id: SessionId,
    pub revision: Revision,
    pub export_request_id: String,
    pub options: ExportOptions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportDocument {
    pub schema_version: u32,
    pub session_id: u64,
    pub document_id: u64,
    pub base_revision: u64,
    pub export_request_id: String,
    pub metadata: ExportMetadata,
    pub blocks: Vec<ExportBlock>,
    pub assets: Vec<ExportAsset>,
    pub diagnostics: Vec<ExportDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ExportMetadata {
    pub frontmatter: Option<ExportFrontMatter>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportFrontMatter {
    pub format: FrontMatterExportFormat,
    pub fields: Vec<ExportFrontMatterField>,
    pub unsafe_source_range: Option<ExportRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FrontMatterExportFormat {
    Yaml,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportFrontMatterField {
    pub key: String,
    pub value: String,
    pub source_range: ExportRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportBlock {
    pub id: String,
    pub kind: ExportBlockKind,
    pub source_range: ExportRange,
    pub content_range: ExportRange,
    pub line_range: LineRangeDto,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExportBlockKind {
    Heading {
        level: u8,
        title: String,
    },
    Paragraph,
    List {
        ordered: bool,
        task: bool,
        checked: Vec<bool>,
    },
    Blockquote,
    CodeBlock {
        language: Option<String>,
    },
    Table {
        alignments: Vec<ExportTableAlignment>,
    },
    Image {
        alt: String,
        target: String,
        title: Option<String>,
        asset_id: String,
    },
    Diagram {
        language: String,
        render_target: ExportDiagramRenderTarget,
        sandbox_required: bool,
        timeout_ms: u64,
    },
    FrontMatter,
    Unknown {
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportTableAlignment {
    None,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportDiagramRenderTarget {
    Mermaid,
    PlantUml,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportAsset {
    pub logical_id: String,
    pub original_reference: String,
    pub resolved_identity: Option<String>,
    pub mime_type_hint: Option<String>,
    pub requires_host_read: bool,
    pub source_range: ExportRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportDiagnostic {
    pub code: ExportDiagnosticCode,
    pub severity: ExportDiagnosticSeverity,
    pub block_id: Option<String>,
    pub source_range: Option<ExportRange>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExportDiagnosticCode {
    ExportIrUnsupportedBlock,
    ExportIrUnsupportedDiagram,
    ExportIrUnsafeFrontmatter,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportDiagnosticSeverity {
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineRangeDto {
    pub start: usize,
    pub end: usize,
}

impl DocumentSession {
    pub fn build_export_document(&self, request: ExportRequest) -> CoreResult<ExportDocument> {
        if request.session_id != self.id {
            return Err(CoreError::SessionMismatch {
                expected: self.id,
                actual: request.session_id,
            });
        }
        if request.revision != self.revision() {
            return Err(CoreError::StaleRevision {
                expected: request.revision,
                actual: self.revision(),
            });
        }

        let outcome = self.parse_index();
        let text = self.text().logical_text();
        let mut metadata = ExportMetadata::default();
        let mut blocks = Vec::new();
        let mut assets = Vec::new();
        let mut diagnostics = Vec::new();

        for block in outcome
            .parse_index
            .blocks
            .iter()
            .filter(|block| block.kind != BlockKind::Document)
        {
            let id = format!("b{}", block.id.0);
            let source = slice_source(text, block.range).to_string();
            let content = slice_source(text, block.content_range);
            let source_range = export_range(block.range);
            let content_range = export_range(block.content_range);
            let line_range = LineRangeDto::from(block.line_range);

            let kind = match &block.kind {
                BlockKind::Heading { level } => ExportBlockKind::Heading {
                    level: *level,
                    title: content.trim().to_string(),
                },
                BlockKind::Paragraph => ExportBlockKind::Paragraph,
                BlockKind::Blockquote => ExportBlockKind::Blockquote,
                BlockKind::BulletList | BlockKind::OrderedList | BlockKind::TaskList => {
                    ExportBlockKind::List {
                        ordered: block.kind == BlockKind::OrderedList,
                        task: block.kind == BlockKind::TaskList,
                        checked: task_checked_states(&source),
                    }
                }
                BlockKind::CodeFence => {
                    let language = code_fence_language(&source);
                    if let Some(target) = diagram_render_target(language.as_deref()) {
                        ExportBlockKind::Diagram {
                            language: language.unwrap_or_default(),
                            render_target: target,
                            sandbox_required: true,
                            timeout_ms: 10_000,
                        }
                    } else {
                        ExportBlockKind::CodeBlock { language }
                    }
                }
                BlockKind::Table => {
                    let alignments = outcome
                        .style_map
                        .table_spans
                        .iter()
                        .find(|span| span.block_id == block.id)
                        .map(|span| {
                            span.alignments
                                .iter()
                                .copied()
                                .map(ExportTableAlignment::from)
                                .collect()
                        })
                        .unwrap_or_default();
                    ExportBlockKind::Table { alignments }
                }
                BlockKind::ImageBlock => {
                    if let Some(image) = parse_image(&source) {
                        let asset_id = format!("asset{}", assets.len() + 1);
                        assets.push(ExportAsset {
                            logical_id: asset_id.clone(),
                            original_reference: image.target.clone(),
                            resolved_identity: None,
                            mime_type_hint: mime_type_hint(&image.target),
                            requires_host_read: requires_host_read(&image.target),
                            source_range,
                        });
                        ExportBlockKind::Image {
                            alt: image.alt,
                            target: image.target,
                            title: image.title,
                            asset_id,
                        }
                    } else {
                        push_unsupported(&mut diagnostics, &id, source_range, "image block");
                        ExportBlockKind::Unknown {
                            reason: "unsupported_image_block".into(),
                        }
                    }
                }
                BlockKind::FrontMatter => {
                    metadata.frontmatter = Some(parse_frontmatter(content, content_range));
                    ExportBlockKind::FrontMatter
                }
                other => {
                    push_unsupported(&mut diagnostics, &id, source_range, block_kind_name(other));
                    ExportBlockKind::Unknown {
                        reason: block_kind_name(other).into(),
                    }
                }
            };

            blocks.push(ExportBlock {
                id,
                kind,
                source_range,
                content_range,
                line_range,
                source,
            });
        }

        if !request.options.include_diagnostics {
            diagnostics.clear();
        }

        Ok(ExportDocument {
            schema_version: EXPORT_IR_SCHEMA_VERSION,
            session_id: self.id.0,
            document_id: self.document_id.0,
            base_revision: self.revision().0,
            export_request_id: request.export_request_id,
            metadata,
            blocks,
            assets,
            diagnostics,
        })
    }
}

impl From<LineRange> for LineRangeDto {
    fn from(value: LineRange) -> Self {
        Self {
            start: value.start,
            end: value.end,
        }
    }
}

impl From<TableAlignment> for ExportTableAlignment {
    fn from(value: TableAlignment) -> Self {
        match value {
            TableAlignment::None => Self::None,
            TableAlignment::Left => Self::Left,
            TableAlignment::Center => Self::Center,
            TableAlignment::Right => Self::Right,
        }
    }
}

fn export_range(range: SourceRange) -> ExportRange {
    ExportRange {
        start: range.start.0,
        end: range.end.0,
    }
}

fn slice_source(text: &str, range: SourceRange) -> &str {
    &text[range.start.0..range.end.0]
}

fn push_unsupported(
    diagnostics: &mut Vec<ExportDiagnostic>,
    block_id: &str,
    source_range: ExportRange,
    name: &str,
) {
    diagnostics.push(ExportDiagnostic {
        code: ExportDiagnosticCode::ExportIrUnsupportedBlock,
        severity: ExportDiagnosticSeverity::Warning,
        block_id: Some(block_id.to_string()),
        source_range: Some(source_range),
        message: format!("Export IR preserved unsupported {} as raw source", name),
    });
}

fn block_kind_name(kind: &BlockKind) -> &'static str {
    match kind {
        BlockKind::Document => "document",
        BlockKind::FrontMatter => "frontmatter",
        BlockKind::HtmlComment => "html_comment",
        BlockKind::Heading { .. } => "heading",
        BlockKind::Paragraph => "paragraph",
        BlockKind::Blockquote => "blockquote",
        BlockKind::BulletList => "bullet_list",
        BlockKind::OrderedList => "ordered_list",
        BlockKind::TaskList => "task_list",
        BlockKind::CodeFence => "code_fence",
        BlockKind::Table => "table",
        BlockKind::LinkReference => "link_reference",
        BlockKind::ImageBlock => "image_block",
        BlockKind::ThematicBreak => "thematic_break",
    }
}

fn task_checked_states(source: &str) -> Vec<bool> {
    source
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim_start();
            let marker = trimmed
                .strip_prefix("- ")
                .or_else(|| trimmed.strip_prefix("* "))
                .or_else(|| trimmed.strip_prefix("+ "))
                .or_else(|| ordered_item_content(trimmed))?;
            let marker = marker.trim_start();
            if marker.len() < 3 {
                return None;
            }
            let bytes = marker.as_bytes();
            if bytes[0] == b'[' && bytes[2] == b']' {
                match bytes[1] {
                    b'x' | b'X' => Some(true),
                    b' ' => Some(false),
                    _ => None,
                }
            } else {
                None
            }
        })
        .collect()
}

fn ordered_item_content(trimmed: &str) -> Option<&str> {
    let marker_end = trimmed
        .char_indices()
        .take_while(|(_, ch)| ch.is_ascii_digit())
        .last()
        .map(|(idx, ch)| idx + ch.len_utf8())?;
    let rest = trimmed.get(marker_end..)?;
    rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") "))
}

fn code_fence_language(source: &str) -> Option<String> {
    let first_line = source.lines().next()?.trim_start();
    let opener = first_line
        .strip_prefix("```")
        .or_else(|| first_line.strip_prefix("~~~"))?;
    let language = opener.split_whitespace().next().unwrap_or("").trim();
    if language.is_empty() {
        None
    } else {
        Some(language.to_string())
    }
}

fn diagram_render_target(language: Option<&str>) -> Option<ExportDiagramRenderTarget> {
    match language?.to_ascii_lowercase().as_str() {
        "mermaid" => Some(ExportDiagramRenderTarget::Mermaid),
        "plantuml" | "puml" => Some(ExportDiagramRenderTarget::PlantUml),
        _ => None,
    }
}

#[derive(Debug)]
struct ParsedImage {
    alt: String,
    target: String,
    title: Option<String>,
}

fn parse_image(source: &str) -> Option<ParsedImage> {
    let trimmed = source.trim();
    let inner = trimmed.strip_prefix("![")?;
    let alt_end = inner.find("](")?;
    let alt = inner[..alt_end].to_string();
    let rest = &inner[alt_end + 2..];
    let target_end = rest.rfind(')')?;
    let destination = rest[..target_end].trim();
    let (target, title) = split_image_destination(destination);
    Some(ParsedImage { alt, target, title })
}

fn split_image_destination(destination: &str) -> (String, Option<String>) {
    let Some(title_start) = destination.find(" \"") else {
        return (trim_wrapping_angles(destination).to_string(), None);
    };
    let target = trim_wrapping_angles(destination[..title_start].trim()).to_string();
    let title = destination[title_start + 2..]
        .strip_suffix('"')
        .map(str::to_string);
    (target, title)
}

fn trim_wrapping_angles(value: &str) -> &str {
    value
        .strip_prefix('<')
        .and_then(|v| v.strip_suffix('>'))
        .unwrap_or(value)
}

fn mime_type_hint(target: &str) -> Option<String> {
    let lower = target.to_ascii_lowercase();
    let mime = if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else {
        return None;
    };
    Some(mime.to_string())
}

fn requires_host_read(target: &str) -> bool {
    !(target.starts_with("data:")
        || target.starts_with("http://")
        || target.starts_with("https://"))
}

fn parse_frontmatter(source: &str, range: ExportRange) -> ExportFrontMatter {
    let mut fields = Vec::new();
    let mut cursor = range.start;
    let mut unsafe_source_range = None;

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            cursor += line.len() + 1;
            continue;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            let value = value.trim();
            if !key.trim().is_empty() && !value.starts_with(['[', '{']) {
                fields.push(ExportFrontMatterField {
                    key: key.trim().to_string(),
                    value: value.trim_matches('"').to_string(),
                    source_range: ExportRange {
                        start: cursor,
                        end: cursor + line.len(),
                    },
                });
            } else {
                unsafe_source_range = Some(range);
            }
        } else {
            unsafe_source_range = Some(range);
        }
        cursor += line.len() + 1;
    }

    ExportFrontMatter {
        format: FrontMatterExportFormat::Yaml,
        fields,
        unsafe_source_range,
    }
}
