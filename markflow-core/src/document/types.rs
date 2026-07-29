//! Core ID and offset types for the document kernel.
//!
//! These types are extracted from session.rs to be shared across
//! the document module and parse_index submodule without circular imports.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SessionId(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct DocumentId(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Revision(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TransactionId(pub u64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ByteOffset(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Utf16Offset(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SourceByteOffset(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceOffsetError {
    InsideBom,
    InsideCrlf,
    OutOfBounds,
    InvalidUtf8Boundary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceRange {
    pub revision: Revision,
    pub start: ByteOffset,
    pub end: ByteOffset,
}

impl SourceRange {
    pub fn new(revision: Revision, start: usize, end: usize) -> Self {
        Self {
            revision,
            start: ByteOffset(start),
            end: ByteOffset(end),
        }
    }
}
