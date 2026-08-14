//! Core ID and offset types.
//!
//! Design 01 §4 forbids passing a bare `number` across layers as a text
//! position. Each coordinate system gets a dedicated newtype so that mixing
//! them is a compile error:
//!
//! - [`Utf16Offset`] — CodeMirror / UI coordinate (UTF-16 code units).
//! - [`LogicalByteOffset`] — byte offset into the logical LF text (BOM stripped).
//! - [`SourceByteOffset`] — byte offset into the raw source bytes (BOM + original
//!   EOL widths included).
//!
//! DTOs carry the coordinate system in the field name (e.g. `from_utf16` /
//! `to_utf16`), per design 01 §4.

use std::fmt;

use serde::{Deserialize, Serialize};

/// Opaque session id. P1B registry assigns it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SessionId(pub u64);

/// Opaque document id.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct DocumentId(pub u64);

/// Generation of the UI binding which owns a document session. Reloading a
/// document advances this value so delayed work from the previous binding
/// cannot be accepted by the new document contents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct BindingGeneration(pub u64);

/// Revision of the confirmed logical text. Starts at 0 on open; every applied
/// patch increments it by exactly 1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Revision(pub u64);

/// Opaque transaction id used for idempotent retry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TransactionId(pub u64);

/// UTF-16 code-unit offset. The UI / CodeMirror coordinate. Always relative to
/// the logical text (BOM is never visible to the editor).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Utf16Offset(pub usize);

/// Byte offset into the logical LF text (UTF-8, BOM stripped).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct LogicalByteOffset(pub usize);

/// Byte offset into the raw source bytes (BOM and original EOL widths included).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SourceByteOffset(pub usize);

impl Utf16Offset {
    pub fn as_usize(self) -> usize {
        self.0
    }
}

impl LogicalByteOffset {
    pub fn as_usize(self) -> usize {
        self.0
    }
}

impl SourceByteOffset {
    pub fn as_usize(self) -> usize {
        self.0
    }
}

impl fmt::Display for Utf16Offset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "utf16:{}", self.0)
    }
}

impl fmt::Display for LogicalByteOffset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "logical:{}", self.0)
    }
}

impl fmt::Display for SourceByteOffset {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "source:{}", self.0)
    }
}

/// A half-open range in one explicit coordinate system, per design 01 §4.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SourceRange<T> {
    pub start: T,
    pub end: T,
}

impl<T> SourceRange<T> {
    pub fn new(start: T, end: T) -> Self {
        Self { start, end }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offset_newtypes_are_distinct() {
        // These two values are numerically equal but must not be interchangeable.
        let a: Utf16Offset = Utf16Offset(1);
        let b: LogicalByteOffset = LogicalByteOffset(1);
        assert_eq!(a.as_usize(), b.as_usize());
        assert_ne!(format!("{a}"), format!("{b}"));
    }

    #[test]
    fn source_range_serde_round_trip() {
        let range = SourceRange::new(LogicalByteOffset(2), LogicalByteOffset(5));
        let json = serde_json::to_string(&range).unwrap();
        let back: SourceRange<LogicalByteOffset> = serde_json::from_str(&json).unwrap();
        assert_eq!(range, back);
    }
}
