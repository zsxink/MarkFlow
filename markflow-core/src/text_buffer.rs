//! Logical LF text buffer with per-boundary EOL provenance (task 2.3).
//!
//! The editor always sees LF logical text. `to_source_bytes` restores the
//! original EOL/BOM bytes for untouched boundaries and resolves new newlines
//! via explicit paste provenance or the fixed inherit order.

use std::ops::Range;

use crate::error::{CoreError, CoreResult};
use crate::line_ending::{LineEndingKind, LineEndingMap, NewlineEnding};
use crate::snapshot::{scan_line_endings, BomKind, UTF8_BOM};
use crate::types::{LogicalByteOffset, SourceByteOffset};

/// Logical LF text plus the per-boundary line-ending map and the frozen
/// document-dominant EOL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextBuffer {
    logical_text: String,
    line_endings: LineEndingMap,
    /// Frozen at open (design 01 §3.6/§3.7); used only as the final inherit
    /// fallback, never as a compensation mechanism.
    dominant: LineEndingKind,
}

impl TextBuffer {
    /// Build from raw source bytes. `dominant` is the frozen document-dominant
    /// EOL resolved by [`OriginalSnapshot::from_bytes`].
    pub(crate) fn from_source_bytes(
        bytes: &[u8],
        bom: BomKind,
        dominant: LineEndingKind,
    ) -> CoreResult<Self> {
        let content = strip_bom(bytes, bom);
        let source = std::str::from_utf8(content).map_err(|_| CoreError::UnsupportedEncoding)?;
        let (logical_text, endings) = scan_line_endings(source);
        Ok(Self {
            logical_text,
            line_endings: LineEndingMap::from_kinds(endings),
            dominant,
        })
    }

    /// Build from logical LF text and a dominant EOL for new newlines. Used for
    /// new-file / Save As / tests.
    pub fn from_logical_text(
        logical_text: impl Into<String>,
        dominant: LineEndingKind,
    ) -> CoreResult<Self> {
        let logical_text = logical_text.into();
        if logical_text.contains('\r') {
            return Err(CoreError::InvalidLogicalLineEnding);
        }
        let count = logical_text.bytes().filter(|b| *b == b'\n').count();
        let line_endings = if count == 0 {
            LineEndingMap::empty()
        } else {
            LineEndingMap::from_kinds(vec![dominant; count])
        };
        Ok(Self {
            logical_text,
            line_endings,
            dominant,
        })
    }

    /// The logical LF text (BOM never appears here).
    pub fn logical_text(&self) -> &str {
        &self.logical_text
    }

    /// The per-boundary EOL map.
    pub fn line_endings(&self) -> &LineEndingMap {
        &self.line_endings
    }

    /// The frozen document-dominant EOL.
    pub fn dominant(&self) -> LineEndingKind {
        self.dominant
    }

    /// Logical text length in bytes.
    pub fn len_bytes(&self) -> usize {
        self.logical_text.len()
    }

    pub fn is_empty(&self) -> bool {
        self.logical_text.is_empty()
    }

    /// Number of logical newline boundaries.
    pub fn boundary_count(&self) -> usize {
        self.line_endings.len()
    }

    /// Is `offset` a char boundary of the logical text?
    pub(crate) fn is_char_boundary(&self, offset: usize) -> bool {
        self.logical_text.is_char_boundary(offset)
    }

    pub(crate) fn validate_range(&self, range: &Range<usize>) -> CoreResult<()> {
        if range.start > range.end || range.end > self.logical_text.len() {
            return Err(CoreError::InvalidRange);
        }
        if !self.is_char_boundary(range.start) || !self.is_char_boundary(range.end) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        Ok(())
    }

    /// Apply a list of changes atomically. The changes must be non-overlapping
    /// and sorted; application is in reverse so earlier ranges keep their
    /// original coordinates (the patch module guarantees this ordering).
    pub(crate) fn apply_changes(
        &mut self,
        changes: &[(Range<LogicalByteOffset>, String, Vec<NewlineEnding>)],
    ) -> CoreResult<()> {
        for (range, replacement, provenance) in changes.iter().rev() {
            self.replace(
                range.start.as_usize()..range.end.as_usize(),
                replacement,
                provenance,
            )?;
        }
        Ok(())
    }

    /// Replace one logical range. `provenance` supplies one `NewlineEnding` per
    /// `\n` in `replacement` (length already validated by the patch layer).
    fn replace(
        &mut self,
        range: Range<usize>,
        replacement: &str,
        provenance: &[NewlineEnding],
    ) -> CoreResult<()> {
        self.validate_range(&range)?;
        if replacement.contains('\r') {
            return Err(CoreError::InvalidLogicalLineEnding);
        }
        let start_boundary = count_newlines_before(&self.logical_text, range.start);
        let end_boundary = count_newlines_before(&self.logical_text, range.end);
        let replacement_eol_count = replacement.bytes().filter(|b| *b == b'\n').count();
        if provenance.len() != replacement_eol_count {
            return Err(CoreError::InvalidEolProvenance {
                expected: replacement_eol_count,
                actual: provenance.len(),
            });
        }

        let replacement_endings =
            self.resolve_replacement_endings(start_boundary, end_boundary, provenance);

        self.logical_text.replace_range(range, replacement);
        self.line_endings =
            self.line_endings
                .replace_range(start_boundary, end_boundary, &replacement_endings);
        Ok(())
    }

    /// Resolve each replacement newline's concrete EOL kind.
    ///
    /// Fixed order per design 01 §3.4 and §3.5:
    /// explicit provenance wins; otherwise `Inherit` consumes same-ordinal
    /// replaced boundary first, then the right surviving neighbor, then the
    /// left surviving neighbor, then the document-dominant EOL, then the frozen
    /// default EOL. This module never swaps the right/left precedence.
    fn resolve_replacement_endings(
        &self,
        start_boundary: usize,
        end_boundary: usize,
        provenance: &[NewlineEnding],
    ) -> Vec<LineEndingKind> {
        let removed: Vec<_> = (start_boundary..end_boundary)
            .filter_map(|b| self.line_endings.kind_at(b))
            .collect();
        let right = self.line_endings.kind_at(end_boundary);
        let left = start_boundary
            .checked_sub(1)
            .and_then(|b| self.line_endings.kind_at(b));
        let dominant = self.dominant;

        let mut removed_cursor = 0usize;
        let mut consumed_replaced = false;
        provenance
            .iter()
            .map(|prov| {
                if let Some(kind) = prov.explicit_kind() {
                    return kind;
                }
                // Inherit: consume same-ordinal replaced boundary first.
                if removed_cursor < removed.len() {
                    let kind = removed[removed_cursor];
                    removed_cursor += 1;
                    return kind;
                }
                // Exhausted replaced boundaries: follow the fixed neighbor
                // order; the same resolution holds for the entire overflow.
                if !consumed_replaced {
                    consumed_replaced = true;
                    if let Some(right) = right {
                        return right;
                    }
                    if let Some(left) = left {
                        return left;
                    }
                    return dominant;
                }
                dominant
            })
            .collect()
    }

    /// Replay the full source bytes (BOM + original/provenance EOLs).
    pub fn to_source_bytes(&self, bom: BomKind) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.logical_text.len() + 3);
        push_bom(&mut out, bom);

        let bytes = self.logical_text.as_bytes();
        let mut boundary = 0usize;
        let mut segment_start = 0usize;
        for (idx, byte) in bytes.iter().enumerate() {
            if *byte == b'\n' {
                out.extend_from_slice(&bytes[segment_start..idx]);
                let kind = self.line_endings.kind_at(boundary).unwrap_or(self.dominant);
                out.extend_from_slice(kind.as_bytes());
                boundary += 1;
                segment_start = idx + 1;
            }
        }
        out.extend_from_slice(&bytes[segment_start..]);
        out
    }

    /// Source byte offset of a logical byte offset, for PositionMap.
    pub(crate) fn source_byte_for_logical(
        &self,
        bom: BomKind,
        offset: usize,
    ) -> CoreResult<SourceByteOffset> {
        if offset > self.logical_text.len() || !self.is_char_boundary(offset) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        let mut boundary = 0usize;
        let mut source = bom.width();
        let bytes = self.logical_text.as_bytes();
        for (idx, byte) in bytes.iter().enumerate() {
            if idx == offset {
                return Ok(SourceByteOffset(source));
            }
            if *byte == b'\n' {
                let kind = self.line_endings.kind_at(boundary).unwrap_or(self.dominant);
                source += kind.width();
                boundary += 1;
            } else {
                source += 1;
            }
        }
        Ok(SourceByteOffset(source))
    }
}

pub(crate) fn strip_bom(bytes: &[u8], bom: BomKind) -> &[u8] {
    match bom {
        BomKind::None => bytes,
        BomKind::Utf8 => &bytes[UTF8_BOM.len()..],
    }
}

pub(crate) fn push_bom(bytes: &mut Vec<u8>, bom: BomKind) {
    if bom == BomKind::Utf8 {
        bytes.extend_from_slice(UTF8_BOM);
    }
}

fn count_newlines_before(text: &str, offset: usize) -> usize {
    text.as_bytes()[..offset]
        .iter()
        .filter(|b| **b == b'\n')
        .count()
}
