use super::{
    BomKind, ByteOffset, CoreError, CoreResult, LineCol, LineIndex, Revision, SourceByteOffset,
    SourceOffsetError, TextBuffer, Utf16Offset,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PositionMap {
    revision: Revision,
    line_index: LineIndex,
    line_start_source_bytes: Vec<usize>,
    bom_width: usize,
    source_len: usize,
}

impl PositionMap {
    pub(crate) fn new(revision: Revision, text: &TextBuffer, bom: BomKind) -> Self {
        let bom_width = match bom {
            BomKind::None => 0,
            BomKind::Utf8 => 3,
        };
        let mut line_start_source_bytes = vec![bom_width];
        let mut source_offset = line_start_source_bytes[0];
        let mut boundary = 0;
        for byte in text.logical_text().as_bytes() {
            if *byte == b'\n' {
                let kind = text
                    .line_endings()
                    .kind_at(boundary)
                    .unwrap_or_else(|| text.line_endings().dominant());
                source_offset += kind.width();
                line_start_source_bytes.push(source_offset);
                boundary += 1;
            } else {
                source_offset += 1;
            }
        }

        Self {
            revision,
            line_index: LineIndex::new(text.logical_text()),
            line_start_source_bytes,
            bom_width,
            source_len: source_offset,
        }
    }

    pub fn revision(&self) -> Revision {
        self.revision
    }

    pub(crate) fn utf16_for_byte(
        &self,
        text: &TextBuffer,
        offset: ByteOffset,
    ) -> CoreResult<Utf16Offset> {
        self.line_index.utf16_for_byte(text.logical_text(), offset)
    }

    pub(crate) fn byte_for_utf16(
        &self,
        text: &TextBuffer,
        offset: Utf16Offset,
    ) -> CoreResult<ByteOffset> {
        self.line_index.byte_for_utf16(text.logical_text(), offset)
    }

    pub(crate) fn line_col_for_byte(
        &self,
        text: &TextBuffer,
        offset: ByteOffset,
    ) -> CoreResult<LineCol> {
        self.line_index
            .line_col_for_byte(text.logical_text(), offset)
    }

    pub(crate) fn byte_for_line_col(
        &self,
        text: &TextBuffer,
        line_col: LineCol,
    ) -> CoreResult<ByteOffset> {
        self.line_index
            .byte_for_line_col(text.logical_text(), line_col)
    }

    pub(crate) fn source_byte_for_byte(
        &self,
        text: &TextBuffer,
        offset: ByteOffset,
    ) -> CoreResult<SourceByteOffset> {
        if offset.0 > text.logical_text().len() || !text.logical_text().is_char_boundary(offset.0) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        let line_col = self
            .line_index
            .line_col_for_byte(text.logical_text(), offset)?;
        let line_start_source = self.line_start_source_bytes[line_col.line as usize];
        Ok(SourceByteOffset(
            line_start_source + usize::try_from(line_col.column_utf8).unwrap_or(usize::MAX),
        ))
    }

    pub(crate) fn byte_for_source_byte(
        &self,
        text: &TextBuffer,
        offset: SourceByteOffset,
    ) -> CoreResult<ByteOffset> {
        if offset.0 < self.bom_width {
            return Err(invalid_source(offset, SourceOffsetError::InsideBom));
        }
        if offset.0 > self.source_len {
            return Err(invalid_source(offset, SourceOffsetError::OutOfBounds));
        }

        let line = match self.line_start_source_bytes.binary_search(&offset.0) {
            Ok(line) => {
                return self
                    .line_index
                    .line_start(line)
                    .ok_or_else(|| invalid_source(offset, SourceOffsetError::OutOfBounds));
            }
            Err(next_line) => next_line.saturating_sub(1),
        };
        let logical_start = self
            .line_index
            .line_start(line)
            .ok_or_else(|| invalid_source(offset, SourceOffsetError::OutOfBounds))?
            .0;
        let logical_next = self.line_index.line_start(line + 1).map(|value| value.0);
        let logical_content_end = logical_next
            .map(|next| next.saturating_sub(1))
            .unwrap_or_else(|| text.logical_text().len());
        let source_start = self.line_start_source_bytes[line];
        let relative = offset.0 - source_start;
        let content_len = logical_content_end - logical_start;

        if relative <= content_len {
            let logical = logical_start + relative;
            if !text.logical_text().is_char_boundary(logical) {
                return Err(invalid_source(
                    offset,
                    SourceOffsetError::InvalidUtf8Boundary,
                ));
            }
            return Ok(ByteOffset(logical));
        }

        Err(invalid_source(offset, SourceOffsetError::InsideCrlf))
    }
}

fn invalid_source(offset: SourceByteOffset, reason: SourceOffsetError) -> CoreError {
    CoreError::InvalidSourceOffset { offset, reason }
}
