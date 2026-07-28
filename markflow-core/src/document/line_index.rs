use super::{ByteOffset, CoreError, CoreResult, Utf16Offset};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LineCol {
    pub line: u32,
    pub column_utf16: u32,
    pub column_utf8: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineIndex {
    line_start_bytes: Vec<usize>,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let mut line_start_bytes = vec![0];
        for (idx, byte) in text.as_bytes().iter().enumerate() {
            if *byte == b'\n' {
                line_start_bytes.push(idx + 1);
            }
        }
        Self { line_start_bytes }
    }

    pub fn line_count(&self) -> usize {
        self.line_start_bytes.len()
    }

    pub fn line_start(&self, line: usize) -> Option<ByteOffset> {
        self.line_start_bytes.get(line).copied().map(ByteOffset)
    }

    pub fn line_col_for_byte(&self, text: &str, offset: ByteOffset) -> CoreResult<LineCol> {
        if offset.0 > text.len() || !text.is_char_boundary(offset.0) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        let line = match self.line_start_bytes.binary_search(&offset.0) {
            Ok(line) => line,
            Err(next) => next.saturating_sub(1),
        };
        let line_start = self.line_start_bytes[line];
        let slice = &text[line_start..offset.0];
        Ok(LineCol {
            line: line as u32,
            column_utf16: utf16_len(slice) as u32,
            column_utf8: slice.len() as u32,
        })
    }

    pub fn byte_for_line_col(&self, text: &str, line_col: LineCol) -> CoreResult<ByteOffset> {
        let line_start = *self
            .line_start_bytes
            .get(line_col.line as usize)
            .ok_or(CoreError::InvalidRange)?;
        let line_end = find_line_end(text, line_start);
        let mut utf16 = 0;
        let target = line_col.column_utf16 as usize;
        for (relative, ch) in text[line_start..line_end].char_indices() {
            if utf16 == target {
                return Ok(ByteOffset(line_start + relative));
            }
            utf16 += ch.len_utf16();
            if utf16 > target {
                return Err(CoreError::InvalidUtf16Boundary);
            }
        }
        if utf16 == target {
            Ok(ByteOffset(line_end))
        } else {
            Err(CoreError::InvalidRange)
        }
    }

    pub fn byte_for_utf16(&self, text: &str, offset: Utf16Offset) -> CoreResult<ByteOffset> {
        let mut utf16 = 0;
        for (byte, ch) in text.char_indices() {
            if utf16 == offset.0 {
                return Ok(ByteOffset(byte));
            }
            utf16 += ch.len_utf16();
            if utf16 > offset.0 {
                return Err(CoreError::InvalidUtf16Boundary);
            }
        }
        if utf16 == offset.0 {
            Ok(ByteOffset(text.len()))
        } else {
            Err(CoreError::InvalidRange)
        }
    }

    pub fn utf16_for_byte(&self, text: &str, offset: ByteOffset) -> CoreResult<Utf16Offset> {
        if offset.0 > text.len() || !text.is_char_boundary(offset.0) {
            return Err(CoreError::InvalidUtf8Boundary);
        }
        Ok(Utf16Offset(utf16_len(&text[..offset.0])))
    }
}

fn utf16_len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

fn find_line_end(text: &str, line_start: usize) -> usize {
    text.as_bytes()[line_start..]
        .iter()
        .position(|byte| *byte == b'\n')
        .map(|relative| line_start + relative)
        .unwrap_or(text.len())
}
