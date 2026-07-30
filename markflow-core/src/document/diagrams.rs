use super::{
    BlockId, BlockKind, ByteOffset, CoreError, CoreResult, DocumentId, DocumentSession,
    DocumentSizeClass, Revision, SessionId, SourceRange, UiRange,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagramTargetsRequest {
    pub session_id: SessionId,
    pub revision: Revision,
    pub request_id: String,
    pub viewport: Option<UiRange>,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagramTargets {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub request_id: String,
    pub viewport: Option<UiRange>,
    pub targets: Vec<DiagramRenderTarget>,
    pub disabled: bool,
    pub large_document: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagramRenderTarget {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub request_id: String,
    pub block_id: BlockId,
    pub language: DiagramLanguage,
    pub block_source_range: SourceRange,
    pub content_source_range: SourceRange,
    pub block_ui_range: UiRange,
    pub content_ui_range: UiRange,
    pub source: String,
    pub fallback_reason: Option<DiagramFallbackReason>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagramLanguage {
    Mermaid,
    PlantUml,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagramFallbackReason {
    EmptySource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagramRenderError {
    pub session_id: SessionId,
    pub revision: Revision,
    pub request_id: String,
    pub language: DiagramLanguage,
    pub source_range: SourceRange,
    pub message: String,
}

impl DocumentSession {
    pub fn diagram_render_targets(
        &self,
        request: DiagramTargetsRequest,
    ) -> CoreResult<DiagramTargets> {
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
            validate_viewport(viewport)?;
        }

        let outcome = self.parse_index();
        let large_document = outcome.large_document_policy.size_class != DocumentSizeClass::Normal;
        let targets = if request.enabled {
            outcome
                .parse_index
                .blocks
                .iter()
                .filter(|block| block.kind == BlockKind::CodeFence)
                .filter(|block| match request.viewport {
                    Some(viewport) => source_intersects_ui(self, block.range, viewport)
                        .ok()
                        .unwrap_or(false),
                    None => true,
                })
                .filter_map(|block| diagram_target_for_block(self, block, &request.request_id))
                .collect::<CoreResult<Vec<_>>>()?
        } else {
            Vec::new()
        };

        Ok(DiagramTargets {
            session_id: self.id,
            document_id: self.document_id,
            revision: self.revision(),
            request_id: request.request_id,
            viewport: request.viewport,
            targets,
            disabled: !request.enabled,
            large_document,
        })
    }
}

fn validate_viewport(viewport: UiRange) -> CoreResult<()> {
    if viewport.start > viewport.end {
        return Err(CoreError::InvalidRange);
    }
    Ok(())
}

fn source_intersects_ui(
    session: &DocumentSession,
    range: SourceRange,
    viewport: UiRange,
) -> CoreResult<bool> {
    let ui_range = ui_range_for_source(session, range)?;
    Ok(ui_range.intersects(viewport))
}

fn diagram_target_for_block(
    session: &DocumentSession,
    block: &super::BlockNode,
    request_id: &str,
) -> Option<CoreResult<DiagramRenderTarget>> {
    let text = session.text().logical_text();
    let opening = opening_fence_line(text, block.range.start, block.content_range.start);
    let language = diagram_language(opening?)?;
    let source = text[block.content_range.start.0..block.content_range.end.0].to_string();
    let fallback_reason = source
        .trim()
        .is_empty()
        .then_some(DiagramFallbackReason::EmptySource);

    Some(
        ui_range_for_source(session, block.range).and_then(|source_range| {
            ui_range_for_source(session, block.content_range).map(|content_range| {
                DiagramRenderTarget {
                    session_id: session.id,
                    document_id: session.document_id,
                    revision: session.revision(),
                    request_id: request_id.to_string(),
                    block_id: block.id,
                    language,
                    block_source_range: block.range,
                    content_source_range: block.content_range,
                    block_ui_range: source_range,
                    content_ui_range: content_range,
                    source,
                    fallback_reason,
                }
            })
        }),
    )
}

fn opening_fence_line(text: &str, start: ByteOffset, content_start: ByteOffset) -> Option<&str> {
    let end = content_start.0.min(text.len());
    let line = text.get(start.0..end)?.lines().next()?;
    Some(line)
}

fn diagram_language(opening_line: &str) -> Option<DiagramLanguage> {
    let trimmed = opening_line.trim_start();
    let marker = trimmed.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }
    let marker_len = trimmed.chars().take_while(|ch| *ch == marker).count();
    let info = trimmed[marker_len..].trim();
    let language = info.split_whitespace().next()?.to_ascii_lowercase();
    match language.as_str() {
        "mermaid" => Some(DiagramLanguage::Mermaid),
        "plantuml" | "puml" => Some(DiagramLanguage::PlantUml),
        _ => None,
    }
}

fn ui_range_for_source(session: &DocumentSession, range: SourceRange) -> CoreResult<UiRange> {
    Ok(UiRange {
        start: session.utf16_for_byte(range.start)?,
        end: session.utf16_for_byte(range.end)?,
    })
}
