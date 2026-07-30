use std::collections::HashMap;

use super::{
    BlockKind, CoreError, CoreResult, DiagramLanguage, DiagramRenderError, DocumentId,
    DocumentSession, DocumentSizeClass, FrontMatterUnsafeReason, LineRange, Revision, SessionId,
    SourceRange, UiRange,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticsRequest {
    pub session_id: SessionId,
    pub revision: Revision,
    pub request_id: String,
    pub viewport: Option<UiRange>,
    pub missing_assets: Vec<MissingAssetDiagnostic>,
    pub diagram_errors: Vec<DiagramRenderError>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingAssetDiagnostic {
    pub session_id: SessionId,
    pub revision: Revision,
    pub request_id: String,
    pub target: String,
    pub source_range: Option<SourceRange>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticsReport {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub request_id: String,
    pub viewport: Option<UiRange>,
    pub diagnostics: Vec<Diagnostic>,
    pub large_document: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub kind: DiagnosticKind,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub source_range: UiRange,
    pub line_range: Option<LineRange>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiagnosticKind {
    BadLink {
        target: String,
    },
    MissingImage {
        target: String,
    },
    DuplicateHeading {
        title: String,
    },
    FrontMatter {
        reason: FrontMatterUnsafeReason,
    },
    TableStructure,
    DiagramRender {
        language: DiagramLanguage,
        render_request_id: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticSeverity {
    Warning,
    Error,
}

impl DocumentSession {
    pub fn diagnostics(&self, request: DiagnosticsRequest) -> CoreResult<DiagnosticsReport> {
        if request.session_id != self.id {
            return Err(CoreError::SessionMismatch {
                expected: self.id,
                actual: request.session_id,
            });
        }
        if request.revision != self.revision() {
            return Err(CoreError::StaleRevision {
                expected: self.revision(),
                actual: request.revision,
            });
        }
        if let Some(viewport) = request.viewport {
            if viewport.start > viewport.end {
                return Err(CoreError::InvalidRange);
            }
        }

        let outcome = self.parse_index();
        let large_document = outcome.large_document_policy.size_class != DocumentSizeClass::Normal;
        let mut diagnostics = Vec::new();
        collect_link_diagnostics(self, &request.missing_assets, &mut diagnostics)?;
        collect_duplicate_heading_diagnostics(self, &mut diagnostics)?;
        collect_frontmatter_diagnostics(self, &mut diagnostics)?;
        collect_table_diagnostics(self, &mut diagnostics)?;
        collect_diagram_error_diagnostics(self, &request.diagram_errors, &mut diagnostics)?;
        if let Some(viewport) = request.viewport {
            diagnostics.retain(|diagnostic| diagnostic.source_range.intersects(viewport));
        }

        Ok(DiagnosticsReport {
            session_id: self.id,
            document_id: self.document_id,
            revision: self.revision(),
            request_id: request.request_id,
            viewport: request.viewport,
            diagnostics,
            large_document,
        })
    }
}

fn collect_link_diagnostics(
    session: &DocumentSession,
    missing_assets: &[MissingAssetDiagnostic],
    diagnostics: &mut Vec<Diagnostic>,
) -> CoreResult<()> {
    let missing_assets = missing_assets
        .iter()
        .filter(|asset| asset.session_id == session.id)
        .filter(|asset| asset.revision == session.revision())
        .filter(|asset| {
            asset
                .source_range
                .is_none_or(|range| range.revision == session.revision())
        })
        .collect::<Vec<_>>();
    for reference in link_references(session.revision(), session.text().logical_text()) {
        if reference.image
            && missing_assets.iter().any(|asset| {
                asset.target == reference.target
                    && asset
                        .source_range
                        .is_none_or(|range| range == reference.range)
            })
        {
            diagnostics.push(diagnostic_for_source(
                session,
                DiagnosticKind::MissingImage {
                    target: reference.target.clone(),
                },
                DiagnosticSeverity::Error,
                format!("Missing image asset: {}", reference.target),
                reference.range,
                None,
            )?);
        }
        if !reference.image && bad_link_target(&reference.target) {
            diagnostics.push(diagnostic_for_source(
                session,
                DiagnosticKind::BadLink {
                    target: reference.target.clone(),
                },
                DiagnosticSeverity::Warning,
                format!("Bad link target: {}", reference.target),
                reference.range,
                None,
            )?);
        }
    }
    Ok(())
}

fn collect_duplicate_heading_diagnostics(
    session: &DocumentSession,
    diagnostics: &mut Vec<Diagnostic>,
) -> CoreResult<()> {
    let mut seen: HashMap<String, String> = HashMap::new();
    for item in session.parse_index().parse_index.outline {
        let key = item.title.to_lowercase();
        if seen.insert(key, item.title.clone()).is_some() {
            diagnostics.push(diagnostic_for_source(
                session,
                DiagnosticKind::DuplicateHeading {
                    title: item.title.clone(),
                },
                DiagnosticSeverity::Warning,
                format!("Duplicate heading: {}", item.title),
                item.range,
                None,
            )?);
        }
    }
    Ok(())
}

fn collect_frontmatter_diagnostics(
    session: &DocumentSession,
    diagnostics: &mut Vec<Diagnostic>,
) -> CoreResult<()> {
    let Some(model) = session.frontmatter_model() else {
        return Ok(());
    };
    for reason in model.unsafe_reasons {
        diagnostics.push(diagnostic_for_source(
            session,
            DiagnosticKind::FrontMatter {
                reason: reason.clone(),
            },
            DiagnosticSeverity::Warning,
            frontmatter_message(&reason),
            model.range,
            None,
        )?);
    }
    Ok(())
}

fn collect_table_diagnostics(
    session: &DocumentSession,
    diagnostics: &mut Vec<Diagnostic>,
) -> CoreResult<()> {
    let outcome = session.parse_index();
    let text = session.text().logical_text();
    let lines = source_lines(text);
    for span in outcome.style_map.table_spans {
        let Some(next_line) = lines.get(span.line_range.end) else {
            continue;
        };
        if next_line.text.trim().is_empty() || !next_line.text.contains('|') {
            continue;
        }
        let cell_count = next_line.text.trim().split('|').count();
        if cell_count != span.alignments.len() {
            diagnostics.push(diagnostic_for_source(
                session,
                DiagnosticKind::TableStructure,
                DiagnosticSeverity::Warning,
                "Table-like row does not match the table column count".to_string(),
                SourceRange::new(session.revision(), next_line.start, next_line.end),
                Some(LineRange::new(span.line_range.end, span.line_range.end + 1)),
            )?);
        }
    }

    for block in outcome.parse_index.blocks {
        if block.kind == BlockKind::Paragraph {
            let line_count = block.line_range.end.saturating_sub(block.line_range.start);
            let text = &text[block.range.start.0..block.range.end.0];
            if line_count >= 2 && text.contains('|') && text.contains("---") {
                diagnostics.push(diagnostic_for_source(
                    session,
                    DiagnosticKind::TableStructure,
                    DiagnosticSeverity::Warning,
                    "Table-like paragraph is not a valid GFM table".to_string(),
                    block.range,
                    Some(block.line_range),
                )?);
            }
        }
    }
    Ok(())
}

fn collect_diagram_error_diagnostics(
    session: &DocumentSession,
    errors: &[DiagramRenderError],
    diagnostics: &mut Vec<Diagnostic>,
) -> CoreResult<()> {
    for error in errors {
        if error.session_id != session.id
            || error.revision != session.revision()
            || error.source_range.revision != session.revision()
        {
            continue;
        }
        diagnostics.push(diagnostic_for_source(
            session,
            DiagnosticKind::DiagramRender {
                language: error.language,
                render_request_id: error.request_id.clone(),
            },
            DiagnosticSeverity::Error,
            error.message.clone(),
            error.source_range,
            None,
        )?);
    }
    Ok(())
}

fn diagnostic_for_source(
    session: &DocumentSession,
    kind: DiagnosticKind,
    severity: DiagnosticSeverity,
    message: String,
    range: SourceRange,
    line_range: Option<LineRange>,
) -> CoreResult<Diagnostic> {
    Ok(Diagnostic {
        kind,
        severity,
        message,
        source_range: UiRange {
            start: session.utf16_for_byte(range.start)?,
            end: session.utf16_for_byte(range.end)?,
        },
        line_range,
    })
}

fn frontmatter_message(reason: &FrontMatterUnsafeReason) -> String {
    match reason {
        FrontMatterUnsafeReason::DuplicateKey { key } => {
            format!("Duplicate FrontMatter key: {}", key)
        }
        FrontMatterUnsafeReason::AnchorOrAlias => {
            "FrontMatter contains an anchor or alias".to_string()
        }
        FrontMatterUnsafeReason::Tag => "FrontMatter contains a custom YAML tag".to_string(),
        FrontMatterUnsafeReason::MergeKey => "FrontMatter contains a YAML merge key".to_string(),
        FrontMatterUnsafeReason::MultiDocument => {
            "FrontMatter contains multiple YAML documents".to_string()
        }
        FrontMatterUnsafeReason::DamagedSyntax { line } => {
            format!("FrontMatter syntax is damaged at line {}", line)
        }
        FrontMatterUnsafeReason::BlockScalar { key } => {
            format!("FrontMatter key uses a block scalar: {}", key)
        }
        FrontMatterUnsafeReason::NestedMappingTooDeep { key } => {
            format!("FrontMatter mapping is too deeply nested at key: {}", key)
        }
    }
}

#[derive(Debug, Clone)]
struct MarkdownReference {
    image: bool,
    target: String,
    range: SourceRange,
}

fn link_references(revision: Revision, text: &str) -> Vec<MarkdownReference> {
    let mut references = Vec::new();
    let mut cursor = 0;
    while let Some(open_bracket) = text[cursor..].find('[').map(|index| cursor + index) {
        let image = open_bracket > 0 && text.as_bytes()[open_bracket - 1] == b'!';
        let source_start = if image {
            open_bracket - 1
        } else {
            open_bracket
        };
        let text_start = open_bracket + 1;
        let Some(close_bracket) = text[text_start..].find(']').map(|index| text_start + index)
        else {
            break;
        };
        let open_paren = close_bracket + 1;
        if text.as_bytes().get(open_paren) != Some(&b'(') {
            cursor = close_bracket + 1;
            continue;
        }
        let target_start = open_paren + 1;
        let Some(close_paren) = text[target_start..]
            .find(')')
            .map(|index| target_start + index)
        else {
            break;
        };
        references.push(MarkdownReference {
            image,
            target: text[target_start..close_paren].to_string(),
            range: SourceRange::new(revision, source_start, close_paren + 1),
        });
        cursor = close_paren + 1;
    }
    references
}

fn bad_link_target(target: &str) -> bool {
    let trimmed = target.trim();
    trimmed.is_empty()
        || trimmed.len() != target.len()
        || trimmed.to_ascii_lowercase().starts_with("javascript:")
        || trimmed.contains('\0')
}

#[derive(Debug, Clone, Copy)]
struct SourceLine<'a> {
    start: usize,
    end: usize,
    text: &'a str,
}

fn source_lines(text: &str) -> Vec<SourceLine<'_>> {
    let mut lines = Vec::new();
    let mut start = 0;
    for segment in text.split_inclusive('\n') {
        let end = start + segment.trim_end_matches('\n').len();
        lines.push(SourceLine {
            start,
            end,
            text: &text[start..end],
        });
        start += segment.len();
    }
    if start == text.len() {
        return lines;
    }
    lines.push(SourceLine {
        start,
        end: text.len(),
        text: &text[start..],
    });
    lines
}
