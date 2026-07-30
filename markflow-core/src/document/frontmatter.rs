use std::collections::HashSet;

use super::{
    BlockKind, CoreError, CoreResult, DocumentSession, Revision, SessionId, SourceRange,
    TextChange, TextPatch, TransactionId,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrontMatterFormat {
    Yaml,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontMatterModel {
    pub session_id: SessionId,
    pub revision: Revision,
    pub range: SourceRange,
    pub content_range: SourceRange,
    pub closing_line: usize,
    pub format: FrontMatterFormat,
    pub fields: Vec<FrontMatterField>,
    pub trivia: Vec<FrontMatterTrivia>,
    pub structured_edit_safe: bool,
    pub unsafe_reasons: Vec<FrontMatterUnsafeReason>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontMatterField {
    pub key: String,
    pub path: Vec<String>,
    pub value: FrontMatterValue,
    pub span: SourceRange,
    pub key_range: SourceRange,
    pub value_range: SourceRange,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrontMatterValue {
    String(String),
    Number(String),
    Boolean(bool),
    Null,
    DateLike(String),
    Array(Vec<FrontMatterValue>),
    Mapping(Vec<FrontMatterField>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontMatterTrivia {
    pub kind: FrontMatterTriviaKind,
    pub range: SourceRange,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrontMatterTriviaKind {
    BlankLine,
    Comment,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrontMatterUnsafeReason {
    DuplicateKey { key: String },
    AnchorOrAlias,
    Tag,
    MergeKey,
    MultiDocument,
    DamagedSyntax { line: usize },
    BlockScalar { key: String },
    NestedMappingTooDeep { key: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontMatterCommandRequest {
    pub session_id: SessionId,
    pub base_revision: Revision,
    pub transaction_id: TransactionId,
    pub command: FrontMatterCommand,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrontMatterCommand {
    AddField {
        key: String,
        value: FrontMatterValue,
    },
    AddFieldPath {
        path: Vec<String>,
        value: FrontMatterValue,
    },
    DeleteField {
        key: String,
    },
    DeleteFieldPath {
        path: Vec<String>,
    },
    RenameField {
        key: String,
        new_key: String,
    },
    RenameFieldPath {
        path: Vec<String>,
        new_key: String,
    },
    UpdateField {
        key: String,
        value: FrontMatterValue,
    },
    UpdateFieldPath {
        path: Vec<String>,
        value: FrontMatterValue,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontMatterCommandResult {
    pub patch: TextPatch,
}

#[derive(Debug, Clone)]
struct ContentLine<'a> {
    index: usize,
    start: usize,
    full_end: usize,
    text: &'a str,
}

impl DocumentSession {
    pub fn frontmatter_model(&self) -> Option<FrontMatterModel> {
        FrontMatterModel::extract(self)
    }

    pub fn execute_frontmatter_command(
        &self,
        request: FrontMatterCommandRequest,
    ) -> CoreResult<FrontMatterCommandResult> {
        if request.session_id != self.id {
            return Err(CoreError::SessionMismatch {
                expected: self.id,
                actual: request.session_id,
            });
        }
        if request.base_revision != self.revision() {
            return Err(CoreError::StaleRevision {
                expected: self.revision(),
                actual: request.base_revision,
            });
        }

        let Some(model) = self.frontmatter_model() else {
            return Err(CoreError::UnsupportedFrontMatter);
        };
        if !model.structured_edit_safe {
            return Err(CoreError::UnsupportedFrontMatter);
        }

        let change = match request.command {
            FrontMatterCommand::AddField { key, value } => {
                add_field_change(self, &model, &[key], &value)?
            }
            FrontMatterCommand::AddFieldPath { path, value } => {
                add_field_change(self, &model, &path, &value)?
            }
            FrontMatterCommand::DeleteField { key } => delete_field_change(&model, &[key])?,
            FrontMatterCommand::DeleteFieldPath { path } => delete_field_change(&model, &path)?,
            FrontMatterCommand::RenameField { key, new_key } => {
                rename_field_change(&model, &[key], new_key)?
            }
            FrontMatterCommand::RenameFieldPath { path, new_key } => {
                rename_field_change(&model, &path, new_key)?
            }
            FrontMatterCommand::UpdateField { key, value } => {
                update_field_change(&model, &[key], &value)?
            }
            FrontMatterCommand::UpdateFieldPath { path, value } => {
                update_field_change(&model, &path, &value)?
            }
        };

        Ok(FrontMatterCommandResult {
            patch: TextPatch {
                transaction_id: request.transaction_id,
                base_revision: request.base_revision,
                changes: vec![change],
                selection_after: None,
            },
        })
    }
}

impl FrontMatterModel {
    fn extract(session: &DocumentSession) -> Option<Self> {
        let outcome = session.parse_index();
        let block = outcome
            .parse_index
            .blocks
            .iter()
            .find(|block| block.kind == BlockKind::FrontMatter)?;
        let text = session.text().logical_text();
        let closing_line = block.line_range.end.checked_sub(1)?;
        let closing_start = session.line_start(closing_line)?.0;
        let lines = content_lines(
            text,
            block.content_range.start.0,
            block.content_range.end.0,
            closing_start,
        );
        let mut parser = FrontMatterParser {
            session_id: session.id,
            revision: session.revision(),
            content_range: block.content_range,
            fields: Vec::new(),
            trivia: Vec::new(),
            unsafe_reasons: Vec::new(),
            seen_top_keys: HashSet::new(),
            seen_nested_keys: HashSet::new(),
        };
        parser.parse_lines(&lines);
        let unsafe_reasons = dedup_reasons(parser.unsafe_reasons);

        Some(Self {
            session_id: session.id,
            revision: session.revision(),
            range: block.range,
            content_range: block.content_range,
            closing_line,
            format: FrontMatterFormat::Yaml,
            fields: parser.fields,
            trivia: parser.trivia,
            structured_edit_safe: unsafe_reasons.is_empty(),
            unsafe_reasons,
        })
    }
}

struct FrontMatterParser {
    session_id: SessionId,
    revision: Revision,
    content_range: SourceRange,
    fields: Vec<FrontMatterField>,
    trivia: Vec<FrontMatterTrivia>,
    unsafe_reasons: Vec<FrontMatterUnsafeReason>,
    seen_top_keys: HashSet<String>,
    seen_nested_keys: HashSet<String>,
}

impl FrontMatterParser {
    fn parse_lines(&mut self, lines: &[ContentLine<'_>]) {
        let mut i = 0;
        while i < lines.len() {
            let line = &lines[i];
            if self.record_trivia_or_marker(line) {
                i += 1;
                continue;
            }

            let indent = leading_spaces(line.text);
            if indent > 0 {
                self.unsafe_reasons
                    .push(FrontMatterUnsafeReason::DamagedSyntax { line: line.index });
                i += 1;
                continue;
            }

            let Some(parsed) = parse_key_value(line, self.revision, indent) else {
                self.unsafe_reasons
                    .push(FrontMatterUnsafeReason::DamagedSyntax { line: line.index });
                i += 1;
                continue;
            };

            self.check_key(&parsed.key, None);
            self.check_unsafe_tokens(&parsed);

            if parsed.value_source.is_empty() {
                let (mapping, next) = self.parse_nested_mapping(lines, i + 1, &parsed);
                self.fields.push(FrontMatterField {
                    key: parsed.key.clone(),
                    path: vec![parsed.key.clone()],
                    value: FrontMatterValue::Mapping(mapping),
                    span: SourceRange::new(
                        self.revision,
                        parsed.line_start,
                        lines[next - 1].full_end,
                    ),
                    key_range: parsed.key_range,
                    value_range: parsed.value_range,
                });
                i = next;
                continue;
            }

            let value = classify_value(&parsed.key, parsed.value_source, &mut self.unsafe_reasons);
            self.fields.push(FrontMatterField {
                key: parsed.key.clone(),
                path: vec![parsed.key],
                value,
                span: SourceRange::new(self.revision, parsed.line_start, parsed.line_full_end),
                key_range: parsed.key_range,
                value_range: parsed.value_range,
            });
            i += 1;
        }

        let _ = self.session_id;
        let _ = self.content_range;
    }

    fn parse_nested_mapping(
        &mut self,
        lines: &[ContentLine<'_>],
        mut i: usize,
        parent: &ParsedLine,
    ) -> (Vec<FrontMatterField>, usize) {
        self.seen_nested_keys.clear();
        let mut fields = Vec::new();
        while i < lines.len() {
            let line = &lines[i];
            if self.record_trivia_or_marker(line) {
                i += 1;
                continue;
            }

            let indent = leading_spaces(line.text);
            if indent == 0 {
                break;
            }
            let Some(parsed) = parse_key_value(line, self.revision, indent) else {
                self.unsafe_reasons
                    .push(FrontMatterUnsafeReason::DamagedSyntax { line: line.index });
                i += 1;
                continue;
            };
            if parsed.value_source.is_empty() {
                self.unsafe_reasons
                    .push(FrontMatterUnsafeReason::NestedMappingTooDeep {
                        key: parsed.key.clone(),
                    });
            }
            self.check_key(&parsed.key, Some(&parent.key));
            self.check_unsafe_tokens(&parsed);
            let value = classify_value(&parsed.key, parsed.value_source, &mut self.unsafe_reasons);
            fields.push(FrontMatterField {
                key: parsed.key.clone(),
                path: vec![parent.key.clone(), parsed.key],
                value,
                span: SourceRange::new(self.revision, parsed.line_start, parsed.line_full_end),
                key_range: parsed.key_range,
                value_range: parsed.value_range,
            });
            i += 1;
        }
        (fields, i)
    }

    fn record_trivia_or_marker(&mut self, line: &ContentLine<'_>) -> bool {
        let trimmed = line.text.trim();
        if trimmed.is_empty() {
            self.trivia.push(FrontMatterTrivia {
                kind: FrontMatterTriviaKind::BlankLine,
                range: SourceRange::new(self.revision, line.start, line.full_end),
            });
            return true;
        }
        if trimmed.starts_with('#') {
            self.trivia.push(FrontMatterTrivia {
                kind: FrontMatterTriviaKind::Comment,
                range: SourceRange::new(self.revision, line.start, line.full_end),
            });
            return true;
        }
        if matches!(trimmed, "---" | "...") {
            self.unsafe_reasons
                .push(FrontMatterUnsafeReason::MultiDocument);
            return true;
        }
        false
    }

    fn check_key(&mut self, key: &str, parent: Option<&str>) {
        if key == "<<" {
            self.unsafe_reasons.push(FrontMatterUnsafeReason::MergeKey);
        }
        let duplicate = if let Some(parent) = parent {
            !self.seen_nested_keys.insert(format!("{}:{}", parent, key))
        } else {
            !self.seen_top_keys.insert(key.to_string())
        };
        if duplicate {
            self.unsafe_reasons
                .push(FrontMatterUnsafeReason::DuplicateKey {
                    key: key.to_string(),
                });
        }
        if !is_safe_key(key) {
            self.unsafe_reasons
                .push(FrontMatterUnsafeReason::DamagedSyntax { line: 0 });
        }
    }

    fn check_unsafe_tokens(&mut self, parsed: &ParsedLine) {
        let value = parsed.value_source;
        if !is_quoted(value)
            && (value.starts_with('&') || value.starts_with('*') || value.contains(" &"))
        {
            self.unsafe_reasons
                .push(FrontMatterUnsafeReason::AnchorOrAlias);
        }
        if value.starts_with('!') || parsed.key.starts_with('!') {
            self.unsafe_reasons.push(FrontMatterUnsafeReason::Tag);
        }
    }
}

#[derive(Debug)]
struct ParsedLine<'a> {
    key: String,
    value_source: &'a str,
    line_start: usize,
    line_full_end: usize,
    key_range: SourceRange,
    value_range: SourceRange,
}

fn content_lines<'a>(
    text: &'a str,
    content_start: usize,
    content_end: usize,
    closing_start: usize,
) -> Vec<ContentLine<'a>> {
    if content_start >= closing_start {
        return Vec::new();
    }

    let mut lines = Vec::new();
    let mut start = content_start;
    let mut index = 0;
    while start < closing_start {
        let relative_end = text[start..closing_start]
            .find('\n')
            .map(|offset| start + offset)
            .unwrap_or(content_end.min(closing_start));
        let full_end =
            if relative_end < closing_start && text.as_bytes().get(relative_end) == Some(&b'\n') {
                relative_end + 1
            } else {
                relative_end
            };
        let end = relative_end.min(text.len());
        lines.push(ContentLine {
            index,
            start,
            full_end,
            text: &text[start..end],
        });
        index += 1;
        if full_end <= start {
            break;
        }
        start = full_end;
    }
    lines
}

fn parse_key_value<'a>(
    line: &ContentLine<'a>,
    revision: Revision,
    indent: usize,
) -> Option<ParsedLine<'a>> {
    let without_indent = &line.text[indent..];
    let colon = without_indent.find(':')?;
    let raw_key = &without_indent[..colon];
    let key_start_offset = indent + raw_key.len() - raw_key.trim_start().len();
    let key_end_offset = indent + raw_key.trim_end().len();
    let key = raw_key.trim().to_string();
    if key.is_empty() {
        return None;
    }

    let raw_value = &without_indent[colon + 1..];
    let value_start_in_raw = raw_value.len() - raw_value.trim_start().len();
    let logical_value = strip_inline_comment(raw_value.trim_start());
    let value_end_in_raw = value_start_in_raw + logical_value.trim_end().len();
    let value_start = line.start + indent + colon + 1 + value_start_in_raw;
    let value_end = line.start + indent + colon + 1 + value_end_in_raw;

    Some(ParsedLine {
        key,
        value_source: logical_value.trim_end(),
        line_start: line.start,
        line_full_end: line.full_end,
        key_range: SourceRange::new(
            revision,
            line.start + key_start_offset,
            line.start + key_end_offset,
        ),
        value_range: SourceRange::new(revision, value_start, value_end),
    })
}

fn classify_value(
    key: &str,
    source: &str,
    unsafe_reasons: &mut Vec<FrontMatterUnsafeReason>,
) -> FrontMatterValue {
    if matches!(source.chars().next(), Some('|') | Some('>')) {
        unsafe_reasons.push(FrontMatterUnsafeReason::BlockScalar {
            key: key.to_string(),
        });
        return FrontMatterValue::String(source.to_string());
    }
    if source == "null" || source == "~" {
        return FrontMatterValue::Null;
    }
    if source == "true" {
        return FrontMatterValue::Boolean(true);
    }
    if source == "false" {
        return FrontMatterValue::Boolean(false);
    }
    if is_number(source) {
        return FrontMatterValue::Number(source.to_string());
    }
    if is_date_like(source) {
        return FrontMatterValue::DateLike(source.to_string());
    }
    if source.starts_with('[') && source.ends_with(']') {
        return FrontMatterValue::Array(parse_array(source, unsafe_reasons));
    }
    FrontMatterValue::String(unquote(source).to_string())
}

fn add_field_change(
    session: &DocumentSession,
    model: &FrontMatterModel,
    path: &[String],
    value: &FrontMatterValue,
) -> CoreResult<TextChange> {
    if path.len() == 1 {
        let key = &path[0];
        if !is_safe_key(key) || find_field(model, path).is_some() {
            return Err(CoreError::UnsupportedFrontMatter);
        }
        let closing_start = session
            .line_start(model.closing_line)
            .ok_or(CoreError::InvalidRange)?
            .0;
        return Ok(TextChange {
            range: SourceRange::new(model.revision, closing_start, closing_start),
            replacement: format!("{}: {}\n", key, format_value(value)?),
        });
    }

    if path.len() == 2 {
        let parent = find_field(model, &path[..1]).ok_or(CoreError::InvalidRange)?;
        if !is_safe_key(&path[1]) || find_field(model, path).is_some() {
            return Err(CoreError::UnsupportedFrontMatter);
        }
        let FrontMatterValue::Mapping(children) = &parent.value else {
            return Err(CoreError::UnsupportedFrontMatter);
        };
        let insert_at = children
            .last()
            .map(|child| child.span.end.0)
            .unwrap_or(parent.span.end.0);
        return Ok(TextChange {
            range: SourceRange::new(model.revision, insert_at, insert_at),
            replacement: format!("  {}: {}\n", path[1], format_value(value)?),
        });
    }

    Err(CoreError::UnsupportedFrontMatter)
}

fn delete_field_change(model: &FrontMatterModel, path: &[String]) -> CoreResult<TextChange> {
    let field = find_field(model, path).ok_or(CoreError::InvalidRange)?;
    Ok(TextChange {
        range: field.span,
        replacement: String::new(),
    })
}

fn rename_field_change(
    model: &FrontMatterModel,
    path: &[String],
    new_key: String,
) -> CoreResult<TextChange> {
    if !is_safe_key(&new_key) {
        return Err(CoreError::UnsupportedFrontMatter);
    }
    let field = find_field(model, path).ok_or(CoreError::InvalidRange)?;
    let mut new_path = path.to_vec();
    let Some(last) = new_path.last_mut() else {
        return Err(CoreError::UnsupportedFrontMatter);
    };
    *last = new_key.clone();
    if find_field(model, &new_path).is_some() {
        return Err(CoreError::UnsupportedFrontMatter);
    }
    Ok(TextChange {
        range: field.key_range,
        replacement: new_key,
    })
}

fn update_field_change(
    model: &FrontMatterModel,
    path: &[String],
    value: &FrontMatterValue,
) -> CoreResult<TextChange> {
    let field = find_field(model, path).ok_or(CoreError::InvalidRange)?;
    Ok(TextChange {
        range: field.value_range,
        replacement: format_value(value)?,
    })
}

fn parse_array(
    source: &str,
    unsafe_reasons: &mut Vec<FrontMatterUnsafeReason>,
) -> Vec<FrontMatterValue> {
    let inner = &source[1..source.len() - 1];
    if inner.trim().is_empty() {
        return Vec::new();
    }
    split_array_items(inner)
        .into_iter()
        .map(|item| classify_value("", item.trim(), unsafe_reasons))
        .collect()
}

fn split_array_items(source: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let mut start = 0;
    let mut quote = None;
    let mut escaped = false;
    for (idx, ch) in source.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if let Some(active) = quote {
            if ch == active {
                quote = None;
            }
            continue;
        }
        if matches!(ch, '\'' | '"') {
            quote = Some(ch);
            continue;
        }
        if ch == ',' {
            items.push(&source[start..idx]);
            start = idx + 1;
        }
    }
    items.push(&source[start..]);
    items
}

fn format_value(value: &FrontMatterValue) -> CoreResult<String> {
    match value {
        FrontMatterValue::String(value) => Ok(format_string(value)),
        FrontMatterValue::Number(value) => Ok(value.clone()),
        FrontMatterValue::Boolean(value) => Ok(value.to_string()),
        FrontMatterValue::Null => Ok("null".to_string()),
        FrontMatterValue::DateLike(value) => Ok(value.clone()),
        FrontMatterValue::Array(values) => values
            .iter()
            .map(format_value)
            .collect::<CoreResult<Vec<_>>>()
            .map(|items| format!("[{}]", items.join(", "))),
        FrontMatterValue::Mapping(_) => Err(CoreError::UnsupportedFrontMatter),
    }
}

fn format_string(value: &str) -> String {
    if value.is_empty()
        || value.chars().any(char::is_whitespace)
        || matches!(value, "true" | "false" | "null" | "~")
        || is_number(value)
        || is_date_like(value)
    {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn find_field<'a>(model: &'a FrontMatterModel, path: &[String]) -> Option<&'a FrontMatterField> {
    let (head, tail) = path.split_first()?;
    let field = model.fields.iter().find(|field| &field.key == head)?;
    if tail.is_empty() {
        return Some(field);
    }
    find_child_field(field, tail)
}

fn find_child_field<'a>(
    field: &'a FrontMatterField,
    path: &[String],
) -> Option<&'a FrontMatterField> {
    let (head, tail) = path.split_first()?;
    let FrontMatterValue::Mapping(children) = &field.value else {
        return None;
    };
    let child = children.iter().find(|child| &child.key == head)?;
    if tail.is_empty() {
        return Some(child);
    }
    find_child_field(child, tail)
}

fn strip_inline_comment(source: &str) -> &str {
    let mut quote = None;
    let mut escaped = false;
    let mut previous_space = true;
    for (idx, ch) in source.char_indices() {
        if escaped {
            escaped = false;
            previous_space = ch.is_whitespace();
            continue;
        }
        if ch == '\\' {
            escaped = true;
            previous_space = false;
            continue;
        }
        if let Some(active) = quote {
            if ch == active {
                quote = None;
            }
            previous_space = false;
            continue;
        }
        if matches!(ch, '\'' | '"') {
            quote = Some(ch);
            previous_space = false;
            continue;
        }
        if ch == '#' && previous_space {
            return &source[..idx];
        }
        previous_space = ch.is_whitespace();
    }
    source
}

fn is_quoted(source: &str) -> bool {
    if source.len() < 2 {
        return false;
    }
    let bytes = source.as_bytes();
    (bytes[0] == b'"' && bytes[source.len() - 1] == b'"')
        || (bytes[0] == b'\'' && bytes[source.len() - 1] == b'\'')
}

fn leading_spaces(source: &str) -> usize {
    source.bytes().take_while(|byte| *byte == b' ').count()
}

fn is_safe_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
}

fn is_number(source: &str) -> bool {
    if source.is_empty() {
        return false;
    }
    let mut chars = source.chars();
    let first = chars.next().unwrap();
    let rest = if first == '-' { chars.as_str() } else { source };
    !rest.is_empty()
        && rest.chars().all(|ch| ch.is_ascii_digit() || ch == '.')
        && rest.chars().any(|ch| ch.is_ascii_digit())
        && rest.matches('.').count() <= 1
}

fn is_date_like(source: &str) -> bool {
    let bytes = source.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..].iter().all(u8::is_ascii_digit)
}

fn unquote(source: &str) -> &str {
    if source.len() >= 2 {
        let bytes = source.as_bytes();
        if (bytes[0] == b'"' && bytes[source.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[source.len() - 1] == b'\'')
        {
            return &source[1..source.len() - 1];
        }
    }
    source
}

fn dedup_reasons(reasons: Vec<FrontMatterUnsafeReason>) -> Vec<FrontMatterUnsafeReason> {
    let mut out = Vec::new();
    for reason in reasons {
        if !out.contains(&reason) {
            out.push(reason);
        }
    }
    out
}
