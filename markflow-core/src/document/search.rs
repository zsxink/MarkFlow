use super::{
    ByteOffset, CoreError, CoreResult, DocumentId, DocumentSession, DocumentSizeClass, Revision,
    Selection, SessionId, SourceRange, TextChange, TextPatch, TransactionId, UiRange,
};

pub const SEARCH_DEFAULT_PAGE_SIZE: usize = 100;
pub const SEARCH_MAX_PAGE_SIZE: usize = 1000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchRequest {
    pub session_id: SessionId,
    pub revision: Revision,
    pub query_id: String,
    pub query: String,
    pub options: SearchOptions,
    pub page: SearchPage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub whole_word: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchPage {
    pub cursor: ByteOffset,
    pub limit: usize,
}

impl Default for SearchPage {
    fn default() -> Self {
        Self {
            cursor: ByteOffset(0),
            limit: SEARCH_DEFAULT_PAGE_SIZE,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub query_id: String,
    pub matches: Vec<SearchMatch>,
    pub next_cursor: Option<ByteOffset>,
    pub paged: bool,
    pub large_document: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchMatch {
    pub index: usize,
    pub source_range: SourceRange,
    pub ui_range: UiRange,
    pub selection: Selection,
    pub preview: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplacePreviewRequest {
    pub session_id: SessionId,
    pub base_revision: Revision,
    pub transaction_id: TransactionId,
    pub query_id: String,
    pub query: String,
    pub replacement: String,
    pub options: SearchOptions,
    pub scope: ReplaceScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplaceScope {
    First,
    All,
    Range(SourceRange),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplacePreview {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    pub revision: Revision,
    pub query_id: String,
    pub replacements: Vec<SearchMatch>,
    pub patch: TextPatch,
}

impl DocumentSession {
    pub fn search(&self, request: SearchRequest) -> CoreResult<SearchResult> {
        validate_search_identity(self, request.session_id, request.revision)?;
        validate_cursor(self, request.page.cursor)?;

        let outcome = self.parse_index();
        let large_document = outcome.large_document_policy.size_class != DocumentSizeClass::Normal;
        let mut matches = Vec::new();
        let mut next_cursor = None;
        if !request.query.is_empty() {
            let limit = request.page.limit.clamp(1, SEARCH_MAX_PAGE_SIZE);
            let found = find_matches(
                self.text().logical_text(),
                &request.query,
                request.options,
                request.page.cursor.0,
                Some(limit),
            );
            next_cursor = found.next_cursor;
            matches = found
                .ranges
                .into_iter()
                .enumerate()
                .map(|(index, (start, end))| {
                    build_search_match(self, index, request.revision, start, end)
                })
                .collect::<CoreResult<Vec<_>>>()?;
        }

        Ok(SearchResult {
            session_id: self.id,
            document_id: self.document_id,
            revision: self.revision(),
            query_id: request.query_id,
            matches,
            next_cursor,
            paged: large_document || next_cursor.is_some(),
            large_document,
        })
    }

    pub fn preview_search_replace(
        &self,
        request: ReplacePreviewRequest,
    ) -> CoreResult<ReplacePreview> {
        validate_search_identity(self, request.session_id, request.base_revision)?;

        let mut ranges = Vec::new();
        if !request.query.is_empty() {
            ranges = match request.scope {
                ReplaceScope::First => {
                    find_matches(
                        self.text().logical_text(),
                        &request.query,
                        request.options,
                        0,
                        Some(1),
                    )
                    .ranges
                }
                ReplaceScope::All => {
                    find_matches(
                        self.text().logical_text(),
                        &request.query,
                        request.options,
                        0,
                        None,
                    )
                    .ranges
                }
                ReplaceScope::Range(range) => {
                    validate_replace_range(self, range)?;
                    if range_matches_query(
                        self.text().logical_text(),
                        range.start.0,
                        range.end.0,
                        &request.query,
                        request.options,
                    ) {
                        vec![(range.start.0, range.end.0)]
                    } else {
                        Vec::new()
                    }
                }
            };
        }

        let replacements = ranges
            .iter()
            .copied()
            .enumerate()
            .map(|(index, (start, end))| {
                build_search_match(self, index, request.base_revision, start, end)
            })
            .collect::<CoreResult<Vec<_>>>()?;
        let selection_after = match (request.scope, ranges.first().copied()) {
            (ReplaceScope::First | ReplaceScope::Range(_), Some((start, _))) => {
                let head = ByteOffset(start + request.replacement.len());
                Some(Selection {
                    anchor: head,
                    head,
                    revision: request.base_revision,
                })
            }
            _ => None,
        };
        let changes = ranges
            .into_iter()
            .map(|(start, end)| TextChange {
                range: SourceRange::new(request.base_revision, start, end),
                replacement: request.replacement.clone(),
            })
            .collect();
        let patch = TextPatch {
            transaction_id: request.transaction_id,
            base_revision: request.base_revision,
            changes,
            selection_after,
        };
        patch.validate_against(self)?;

        Ok(ReplacePreview {
            session_id: self.id,
            document_id: self.document_id,
            revision: self.revision(),
            query_id: request.query_id,
            replacements,
            patch,
        })
    }
}

fn validate_search_identity(
    session: &DocumentSession,
    session_id: SessionId,
    revision: Revision,
) -> CoreResult<()> {
    if session_id != session.id {
        return Err(CoreError::SessionMismatch {
            expected: session.id,
            actual: session_id,
        });
    }
    if revision != session.revision() {
        return Err(CoreError::StaleRevision {
            expected: session.revision(),
            actual: revision,
        });
    }
    Ok(())
}

fn validate_cursor(session: &DocumentSession, cursor: ByteOffset) -> CoreResult<()> {
    if cursor.0 > session.text().len_bytes() {
        return Err(CoreError::InvalidRange);
    }
    if !session.text().is_char_boundary(cursor.0) {
        return Err(CoreError::InvalidUtf8Boundary);
    }
    Ok(())
}

fn validate_replace_range(session: &DocumentSession, range: SourceRange) -> CoreResult<()> {
    if range.revision != session.revision() {
        return Err(CoreError::StaleRevision {
            expected: session.revision(),
            actual: range.revision,
        });
    }
    if range.start > range.end || range.end.0 > session.text().len_bytes() {
        return Err(CoreError::InvalidRange);
    }
    if !session.text().is_char_boundary(range.start.0)
        || !session.text().is_char_boundary(range.end.0)
    {
        return Err(CoreError::InvalidUtf8Boundary);
    }
    Ok(())
}

struct FoundMatches {
    ranges: Vec<(usize, usize)>,
    next_cursor: Option<ByteOffset>,
}

fn find_matches(
    text: &str,
    query: &str,
    options: SearchOptions,
    cursor: usize,
    limit: Option<usize>,
) -> FoundMatches {
    let mut ranges = Vec::new();
    let mut search_from = cursor;
    let limit = limit.unwrap_or(usize::MAX);

    while search_from <= text.len() {
        let Some((start, end)) = find_next_match(text, query, options, search_from) else {
            return FoundMatches {
                ranges,
                next_cursor: None,
            };
        };
        if ranges.len() == limit {
            return FoundMatches {
                ranges,
                next_cursor: Some(ByteOffset(start)),
            };
        }
        ranges.push((start, end));
        search_from = end.max(start + 1);
    }

    FoundMatches {
        ranges,
        next_cursor: None,
    }
}

fn find_next_match(
    text: &str,
    query: &str,
    options: SearchOptions,
    cursor: usize,
) -> Option<(usize, usize)> {
    if options.case_sensitive {
        let mut search_from = cursor;
        while let Some(found) = text[search_from..].find(query) {
            let start = search_from + found;
            let end = start + query.len();
            if !options.whole_word || is_whole_word(text, start, end) {
                return Some((start, end));
            }
            search_from = end.max(start + 1);
        }
        return None;
    }

    let text_chars: Vec<_> = text.char_indices().collect();
    let query_chars: Vec<_> = query
        .chars()
        .map(|ch| ch.to_lowercase().to_string())
        .collect();
    if query_chars.is_empty() {
        return None;
    }

    for index in 0..text_chars.len() {
        let start = text_chars[index].0;
        if start < cursor || index + query_chars.len() > text_chars.len() {
            continue;
        }
        let matches = query_chars.iter().enumerate().all(|(offset, query_ch)| {
            text_chars[index + offset].1.to_lowercase().to_string() == *query_ch
        });
        if !matches {
            continue;
        }
        let end = text_chars
            .get(index + query_chars.len())
            .map(|(byte, _)| *byte)
            .unwrap_or(text.len());
        if !options.whole_word || is_whole_word(text, start, end) {
            return Some((start, end));
        }
    }
    None
}

fn range_matches_query(
    text: &str,
    start: usize,
    end: usize,
    query: &str,
    options: SearchOptions,
) -> bool {
    if start > end || end > text.len() {
        return false;
    }
    let candidate = &text[start..end];
    let text_matches = if options.case_sensitive {
        candidate == query
    } else {
        candidate.to_lowercase() == query.to_lowercase()
    };
    text_matches && (!options.whole_word || is_whole_word(text, start, end))
}

fn is_whole_word(text: &str, start: usize, end: usize) -> bool {
    let previous = text[..start].chars().next_back();
    let next = text[end..].chars().next();
    !previous.is_some_and(is_word_char) && !next.is_some_and(is_word_char)
}

fn is_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

fn build_search_match(
    session: &DocumentSession,
    index: usize,
    revision: Revision,
    start: usize,
    end: usize,
) -> CoreResult<SearchMatch> {
    let source_range = SourceRange::new(revision, start, end);
    let ui_range = UiRange {
        start: session.utf16_for_byte(ByteOffset(start))?,
        end: session.utf16_for_byte(ByteOffset(end))?,
    };
    let preview = preview_around(session.text().logical_text(), start, end);
    Ok(SearchMatch {
        index,
        source_range,
        ui_range,
        selection: Selection {
            anchor: ByteOffset(start),
            head: ByteOffset(end),
            revision,
        },
        preview,
    })
}

fn preview_around(text: &str, start: usize, end: usize) -> String {
    const CONTEXT_CHARS: usize = 24;
    let prefix_start = text[..start]
        .char_indices()
        .rev()
        .nth(CONTEXT_CHARS)
        .map(|(index, _)| index)
        .unwrap_or(0);
    let suffix_end = text[end..]
        .char_indices()
        .nth(CONTEXT_CHARS)
        .map(|(index, ch)| end + index + ch.len_utf8())
        .unwrap_or(text.len());
    text[prefix_start..suffix_end].to_string()
}
