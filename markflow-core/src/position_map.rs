//! Bidirectional position mapping between UTF-16, logical UTF-8 byte and
//! source byte coordinates (task 2.4).
//!
//! Design 01 §5: offsets that land inside a surrogate pair, a UTF-8
//! continuation byte, a CRLF middle, or the BOM must return a stable error —
//! never truncate to the nearest char boundary and continue.

use crate::error::{CoreError, CoreResult, SourceOffsetError};
use crate::snapshot::BomKind;
use crate::text_buffer::TextBuffer;
use crate::types::{LogicalByteOffset, SourceByteOffset, Utf16Offset};

/// Map over one revision's logical text and its source-byte geometry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PositionMap {
    /// Source byte offset at which each logical line starts (line 0 starts
    /// after the BOM). Rebuilt on every revision.
    line_start_source_bytes: Vec<usize>,
    /// Byte offset (into logical text) at which each line starts.
    line_start_logical_bytes: Vec<usize>,
    bom: BomKind,
    source_len: usize,
    /// Number of lines.
    line_count: usize,
}

impl PositionMap {
    /// Build the map for a revision's text and BOM.
    pub fn new(text: &TextBuffer, bom: BomKind) -> Self {
        let bom_width = bom.width();
        let mut line_start_source_bytes = vec![bom_width];
        let mut line_start_logical_bytes = vec![0usize];
        let mut source_offset = bom_width;
        let mut boundary = 0usize;
        let mut logical_offset = 0usize;
        for byte in text.logical_text().as_bytes() {
            if *byte == b'\n' {
                let kind = text
                    .line_endings()
                    .kind_at(boundary)
                    .unwrap_or_else(|| text.dominant());
                source_offset += kind.width();
                boundary += 1;
                logical_offset += 1;
                line_start_source_bytes.push(source_offset);
                line_start_logical_bytes.push(logical_offset);
            } else {
                source_offset += 1;
                logical_offset += 1;
            }
        }

        let line_count = line_start_logical_bytes.len();
        Self {
            line_start_source_bytes,
            line_start_logical_bytes,
            bom,
            source_len: source_offset,
            line_count,
        }
    }

    pub fn line_count(&self) -> usize {
        self.line_count
    }

    /// UTF-16 code-unit offset ↔ logical UTF-8 byte offset.
    pub fn utf16_for_byte(
        &self,
        text: &TextBuffer,
        offset: LogicalByteOffset,
    ) -> CoreResult<Utf16Offset> {
        validate_logical(text, offset)?;
        let logical = text.logical_text();
        let mut utf16 = 0usize;
        let mut byte = 0usize;
        while byte < offset.as_usize() {
            let ch = logical[byte..].chars().next().expect("valid boundary");
            utf16 += ch.len_utf16();
            byte += ch.len_utf8();
        }
        Ok(Utf16Offset(utf16))
    }

    pub fn byte_for_utf16(
        &self,
        text: &TextBuffer,
        offset: Utf16Offset,
    ) -> CoreResult<LogicalByteOffset> {
        let logical = text.logical_text();
        let mut utf16 = 0usize;
        let mut byte = 0usize;
        while byte < logical.len() {
            // `utf16` is the cumulative count BEFORE this char. If the requested
            // offset is exactly here, it is a valid boundary.
            if utf16 == offset.as_usize() {
                return Ok(LogicalByteOffset(byte));
            }
            let ch = logical[byte..].chars().next().expect("valid UTF-8");
            let ch_utf16 = ch.len_utf16();
            if utf16 + ch_utf16 > offset.as_usize() {
                // The requested offset lands strictly inside this char's
                // surrogate pair.
                return Err(CoreError::InvalidUtf16Boundary);
            }
            utf16 += ch_utf16;
            byte += ch.len_utf8();
        }
        if utf16 == offset.as_usize() {
            Ok(LogicalByteOffset(byte))
        } else {
            Err(CoreError::InvalidUtf16Boundary)
        }
    }

    /// Logical UTF-8 byte offset ↔ source byte offset.
    pub fn source_byte_for_byte(
        &self,
        text: &TextBuffer,
        offset: LogicalByteOffset,
    ) -> CoreResult<SourceByteOffset> {
        text.source_byte_for_logical(self.bom, offset.as_usize())
    }

    pub fn byte_for_source_byte(
        &self,
        text: &TextBuffer,
        offset: SourceByteOffset,
    ) -> CoreResult<LogicalByteOffset> {
        if offset.as_usize() < self.bom.width() {
            return Err(invalid_source(offset, SourceOffsetError::InsideBom));
        }
        if offset.as_usize() > self.source_len {
            return Err(invalid_source(offset, SourceOffsetError::OutOfBounds));
        }

        let line = match self
            .line_start_source_bytes
            .binary_search(&offset.as_usize())
        {
            Ok(line) => line,
            Err(next_line) => next_line.saturating_sub(1),
        };
        let logical_start = self.line_start_logical_bytes[line];
        let content_end_logical = self
            .line_start_logical_bytes
            .get(line + 1)
            .copied()
            .map(|next| next.saturating_sub(1)) // position of the '\n' itself
            .unwrap_or_else(|| text.len_bytes());
        let source_start = self.line_start_source_bytes[line];
        let relative = offset.as_usize() - source_start;
        let content_len = content_end_logical - logical_start;

        if relative <= content_len {
            let logical = logical_start + relative;
            if !text.is_char_boundary(logical) {
                return Err(invalid_source(
                    offset,
                    SourceOffsetError::InvalidUtf8Boundary,
                ));
            }
            return Ok(LogicalByteOffset(logical));
        }

        // Falls inside the CRLF pair: the extra `\r` byte of a CRLF.
        Err(invalid_source(offset, SourceOffsetError::InsideCrlf))
    }
}

fn validate_logical(text: &TextBuffer, offset: LogicalByteOffset) -> CoreResult<()> {
    if offset.as_usize() > text.len_bytes() {
        return Err(CoreError::InvalidRange);
    }
    if !text.is_char_boundary(offset.as_usize()) {
        return Err(CoreError::InvalidUtf8Boundary);
    }
    Ok(())
}

fn invalid_source(offset: SourceByteOffset, reason: SourceOffsetError) -> CoreError {
    CoreError::InvalidSourceOffset { offset, reason }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::line_ending::LineEndingKind;
    use crate::snapshot::OriginalSnapshot;

    fn buffer(bytes: &[u8]) -> TextBuffer {
        let snap = OriginalSnapshot::from_bytes(bytes, LineEndingKind::Lf).unwrap();
        TextBuffer::from_source_bytes(bytes, snap.bom, snap.dominant_line_ending()).unwrap()
    }

    #[test]
    fn utf16_round_trip_with_emoji() {
        // 'A' + 😀 (surrogate pair) + 'é' + CJK
        let text = buffer("A😀é中".as_bytes());
        let map = PositionMap::new(&text, BomKind::None);
        assert_eq!(map.bom, BomKind::None);
        // Byte layout: A(1) 😀(4) é(2) 中(3) = 10 bytes.
        // utf16: A(1) 😀(2) é(1) 中(1) = 5 code units.
        assert_eq!(
            map.utf16_for_byte(&text, LogicalByteOffset(0))
                .unwrap()
                .as_usize(),
            0
        );
        assert_eq!(
            map.utf16_for_byte(&text, LogicalByteOffset(1))
                .unwrap()
                .as_usize(),
            1
        );
        assert_eq!(
            map.utf16_for_byte(&text, LogicalByteOffset(5))
                .unwrap()
                .as_usize(),
            3
        );
        assert_eq!(
            map.utf16_for_byte(&text, LogicalByteOffset(7))
                .unwrap()
                .as_usize(),
            4
        );
        assert_eq!(
            map.utf16_for_byte(&text, LogicalByteOffset(10))
                .unwrap()
                .as_usize(),
            5
        );

        assert_eq!(
            map.byte_for_utf16(&text, Utf16Offset(0))
                .unwrap()
                .as_usize(),
            0
        );
        assert_eq!(
            map.byte_for_utf16(&text, Utf16Offset(1))
                .unwrap()
                .as_usize(),
            1
        );
        assert_eq!(
            map.byte_for_utf16(&text, Utf16Offset(3))
                .unwrap()
                .as_usize(),
            5
        );
        assert_eq!(
            map.byte_for_utf16(&text, Utf16Offset(4))
                .unwrap()
                .as_usize(),
            7
        );
        assert_eq!(
            map.byte_for_utf16(&text, Utf16Offset(5))
                .unwrap()
                .as_usize(),
            10
        );
    }

    #[test]
    fn utf16_inside_surrogate_rejected() {
        let text = buffer("A😀B".as_bytes());
        let map = PositionMap::new(&text, BomKind::None);
        // 😀 occupies utf16 [1,3); utf16 2 falls inside the pair.
        assert_eq!(
            map.byte_for_utf16(&text, Utf16Offset(2)),
            Err(CoreError::InvalidUtf16Boundary)
        );
    }

    #[test]
    fn source_byte_crlf_geometry() {
        // source:  a \r\n b \r\n c
        let bytes = b"a\r\nb\r\nc";
        let text = buffer(bytes);
        let map = PositionMap::new(&text, BomKind::None);
        // logical: a\nb\nc  →  source: a(0) \r\n(1-2) b(3) \r\n(4-5) c(6)
        assert_eq!(
            map.source_byte_for_byte(&text, LogicalByteOffset(0))
                .unwrap()
                .as_usize(),
            0
        );
        // position of logical '\n' (index 1): source index 1 (the CR byte).
        assert_eq!(
            map.source_byte_for_byte(&text, LogicalByteOffset(1))
                .unwrap()
                .as_usize(),
            1
        );
        assert_eq!(
            map.source_byte_for_byte(&text, LogicalByteOffset(2))
                .unwrap()
                .as_usize(),
            3
        );
        assert_eq!(
            map.source_byte_for_byte(&text, LogicalByteOffset(4))
                .unwrap()
                .as_usize(),
            6
        );
        assert_eq!(map.source_len, 7);

        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(0))
                .unwrap()
                .as_usize(),
            0
        );
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(1))
                .unwrap()
                .as_usize(),
            1
        );
        // inside CRLF: source 2 is the '\n' byte.
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(2)),
            Err(invalid_source(
                SourceByteOffset(2),
                SourceOffsetError::InsideCrlf
            ))
        );
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(3))
                .unwrap()
                .as_usize(),
            2
        );
    }

    #[test]
    fn source_byte_bom_geometry() {
        let bytes = b"\xef\xbb\xbf# T\n\nx\n";
        let text = buffer(bytes);
        let map = PositionMap::new(&text, BomKind::Utf8);
        assert_eq!(map.bom, BomKind::Utf8);
        // logical '#' is source byte 3.
        assert_eq!(
            map.source_byte_for_byte(&text, LogicalByteOffset(0))
                .unwrap()
                .as_usize(),
            3
        );
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(0)),
            Err(invalid_source(
                SourceByteOffset(0),
                SourceOffsetError::InsideBom
            ))
        );
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(2)),
            Err(invalid_source(
                SourceByteOffset(2),
                SourceOffsetError::InsideBom
            ))
        );
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(3))
                .unwrap()
                .as_usize(),
            0
        );
    }

    #[test]
    fn source_byte_out_of_bounds() {
        let text = buffer(b"abc");
        let map = PositionMap::new(&text, BomKind::None);
        assert_eq!(map.source_len, 3);
        assert_eq!(
            map.byte_for_source_byte(&text, SourceByteOffset(4)),
            Err(invalid_source(
                SourceByteOffset(4),
                SourceOffsetError::OutOfBounds
            ))
        );
    }
}
