use std::ops::Range;

use super::snapshot::{push_bom, strip_bom};
use super::{BomKind, CoreError, CoreResult, LineEndingKind, LineEndingMap, TextChange};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextBuffer {
    logical_text: String,
    line_endings: LineEndingMap,
}

impl TextBuffer {
    pub(crate) fn from_source_bytes(bytes: &[u8], bom: BomKind) -> CoreResult<Self> {
        let content = strip_bom(bytes, bom);
        let source = std::str::from_utf8(content).map_err(|_| CoreError::UnsupportedEncoding)?;
        let (logical_text, endings) = normalize_source_text(source);
        Ok(Self {
            logical_text,
            line_endings: LineEndingMap::from_kinds(endings),
        })
    }

    pub fn from_logical_text(
        logical_text: impl Into<String>,
        dominant: LineEndingKind,
    ) -> CoreResult<Self> {
        let logical_text = logical_text.into();
        if logical_text.contains('\r') {
            return Err(CoreError::InvalidLogicalLineEnding);
        }
        let count = logical_text.bytes().filter(|byte| *byte == b'\n').count();
        let dominant = match dominant {
            LineEndingKind::Mixed => LineEndingKind::Lf,
            concrete => concrete,
        };
        let line_endings = if count == 0 {
            LineEndingMap::empty(dominant)
        } else {
            LineEndingMap::from_kinds(vec![dominant; count])
        };
        Ok(Self {
            logical_text,
            line_endings,
        })
    }

    pub fn logical_text(&self) -> &str {
        &self.logical_text
    }

    pub fn line_endings(&self) -> &LineEndingMap {
        &self.line_endings
    }

    pub fn len_bytes(&self) -> usize {
        self.logical_text.len()
    }

    pub fn slice(&self, range: Range<usize>) -> CoreResult<&str> {
        if !self.is_char_boundary(range.start) || !self.is_char_boundary(range.end) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        self.logical_text.get(range).ok_or(CoreError::InvalidRange)
    }

    pub fn chunks(&self, range: Range<usize>) -> CoreResult<impl Iterator<Item = &str>> {
        let chunk = self.slice(range)?;
        Ok(std::iter::once(chunk))
    }

    pub(crate) fn replace(&mut self, range: Range<usize>, replacement: &str) -> CoreResult<()> {
        self.validate_range(range.clone())?;
        let start_boundary = count_newlines_before(&self.logical_text, range.start);
        let end_boundary = count_newlines_before(&self.logical_text, range.end);
        let (replacement_logical, replacement_eols) = normalize_replacement_text(replacement);
        let replacement_endings =
            self.resolve_replacement_endings(start_boundary, end_boundary, &replacement_eols);

        self.logical_text.replace_range(range, &replacement_logical);
        self.line_endings =
            self.line_endings
                .replace_range(start_boundary, end_boundary, &replacement_endings);
        Ok(())
    }

    pub(crate) fn apply_changes(&mut self, changes: &[TextChange]) -> CoreResult<()> {
        for change in changes.iter().rev() {
            self.replace(
                change.range.start.0..change.range.end.0,
                &change.replacement,
            )?;
        }
        Ok(())
    }

    pub fn to_source_bytes(&self, bom: BomKind) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.logical_text.len() + 3);
        push_bom(&mut out, bom);

        let mut boundary = 0;
        let bytes = self.logical_text.as_bytes();
        let mut segment_start = 0;
        for (idx, byte) in bytes.iter().enumerate() {
            if *byte == b'\n' {
                out.extend_from_slice(&bytes[segment_start..idx]);
                let kind = self
                    .line_endings
                    .kind_at(boundary)
                    .unwrap_or_else(|| self.line_endings.dominant());
                out.extend_from_slice(kind.as_str().as_bytes());
                boundary += 1;
                segment_start = idx + 1;
            }
        }
        out.extend_from_slice(&bytes[segment_start..]);
        out
    }

    pub fn validate_range(&self, range: Range<usize>) -> CoreResult<()> {
        if range.start > range.end || range.end > self.logical_text.len() {
            return Err(CoreError::InvalidRange);
        }
        if !self.is_char_boundary(range.start) || !self.is_char_boundary(range.end) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        Ok(())
    }

    pub fn is_char_boundary(&self, offset: usize) -> bool {
        self.logical_text.is_char_boundary(offset)
    }

    fn resolve_replacement_endings(
        &self,
        start_boundary: usize,
        end_boundary: usize,
        replacement_eols: &[ReplacementEol],
    ) -> Vec<LineEndingKind> {
        let removed: Vec<_> = (start_boundary..end_boundary)
            .filter_map(|boundary| self.line_endings.kind_at(boundary))
            .collect();
        let right = self.line_endings.kind_at(end_boundary);
        let left = start_boundary
            .checked_sub(1)
            .and_then(|boundary| self.line_endings.kind_at(boundary));
        let dominant = self.line_endings.dominant();

        replacement_eols
            .iter()
            .enumerate()
            .map(|(index, eol)| match eol {
                ReplacementEol::Explicit(kind) => *kind,
                ReplacementEol::Inherit => removed
                    .get(index)
                    .copied()
                    .or_else(|| removed.last().copied())
                    .or(right)
                    .or(left)
                    .unwrap_or(dominant),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReplacementEol {
    Inherit,
    Explicit(LineEndingKind),
}

fn normalize_source_text(source: &str) -> (String, Vec<LineEndingKind>) {
    let bytes = source.as_bytes();
    let mut logical = String::with_capacity(source.len());
    let mut endings = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                logical.push('\n');
                endings.push(LineEndingKind::Crlf);
                i += 2;
            }
            b'\r' => {
                logical.push('\n');
                endings.push(LineEndingKind::Cr);
                i += 1;
            }
            b'\n' => {
                logical.push('\n');
                endings.push(LineEndingKind::Lf);
                i += 1;
            }
            _ => {
                let ch = source[i..].chars().next().expect("valid UTF-8 char");
                logical.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    (logical, endings)
}

fn normalize_replacement_text(source: &str) -> (String, Vec<ReplacementEol>) {
    let bytes = source.as_bytes();
    let mut logical = String::with_capacity(source.len());
    let mut endings = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                logical.push('\n');
                endings.push(ReplacementEol::Explicit(LineEndingKind::Crlf));
                i += 2;
            }
            b'\r' => {
                logical.push('\n');
                endings.push(ReplacementEol::Explicit(LineEndingKind::Cr));
                i += 1;
            }
            b'\n' => {
                logical.push('\n');
                endings.push(ReplacementEol::Inherit);
                i += 1;
            }
            _ => {
                let ch = source[i..].chars().next().expect("valid UTF-8 char");
                logical.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    (logical, endings)
}

fn count_newlines_before(text: &str, offset: usize) -> usize {
    text.as_bytes()[..offset]
        .iter()
        .filter(|byte| **byte == b'\n')
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_logical_buffer_uses_dominant_fallback_without_neighbors() {
        let mut buffer = TextBuffer::from_logical_text("", LineEndingKind::Crlf).unwrap();
        buffer.replace(0..0, "left\nright").unwrap();

        assert_eq!(buffer.to_source_bytes(BomKind::None), b"left\r\nright");
    }
}
