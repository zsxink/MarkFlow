use std::collections::{HashMap, VecDeque};
use std::io::{self, Write};

use super::patch::PayloadFingerprint;
use super::{LineIndex, OriginalSnapshot, PatchOutcome, PositionMap, TextBuffer, TextPatch};

pub const TRANSACTION_RETRY_WINDOW_CAPACITY: usize = 256;

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    UnsupportedEncoding,
    StaleRevision {
        expected: Revision,
        actual: Revision,
    },
    TransactionConflict,
    InvalidRange,
    InvalidLogicalLineEnding,
    OverlappingChanges,
    InvalidUtf8Boundary,
    InvalidUtf16Boundary,
    InvalidSourceOffset {
        offset: SourceByteOffset,
        reason: SourceOffsetError,
    },
    Io(String),
}

pub type CoreResult<T> = Result<T, CoreError>;

impl From<io::Error> for CoreError {
    fn from(value: io::Error) -> Self {
        CoreError::Io(value.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavePayload {
    bytes: Vec<u8>,
}

impl SavePayload {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self { bytes }
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

#[derive(Debug, Clone)]
struct AppliedTransaction {
    fingerprint: PayloadFingerprint,
    outcome: PatchOutcome,
}

#[derive(Debug, Clone)]
/// Owns one coherent text/revision/index snapshot.
///
/// Session state is intentionally not writable outside Core:
///
/// ```compile_fail
/// use markflow_core::{DocumentId, DocumentSession, SessionId};
///
/// let session = DocumentSession::open_bytes(SessionId(1), DocumentId(1), b"text").unwrap();
/// let _ = &session.text;
/// ```
///
/// Direct map conversion is also unavailable; callers use the session facade:
///
/// ```compile_fail
/// use markflow_core::{ByteOffset, DocumentId, DocumentSession, SessionId};
///
/// let session = DocumentSession::open_bytes(SessionId(1), DocumentId(1), b"text").unwrap();
/// let _ = session
///     .position_map()
///     .utf16_for_byte(session.text(), ByteOffset(0));
/// ```
pub struct DocumentSession {
    pub id: SessionId,
    pub document_id: DocumentId,
    revision: Revision,
    original: OriginalSnapshot,
    text: TextBuffer,
    line_index: LineIndex,
    position_map: PositionMap,
    applied_transactions: HashMap<TransactionId, AppliedTransaction>,
    transaction_order: VecDeque<TransactionId>,
}

impl DocumentSession {
    pub fn open_bytes(id: SessionId, document_id: DocumentId, bytes: &[u8]) -> CoreResult<Self> {
        let original = OriginalSnapshot::from_bytes(bytes)?;
        let text = TextBuffer::from_source_bytes(bytes, original.bom)?;
        let revision = Revision(0);
        let line_index = LineIndex::new(text.logical_text());
        let position_map = PositionMap::new(revision, &text, original.bom);

        Ok(Self {
            id,
            document_id,
            revision,
            original,
            text,
            line_index,
            position_map,
            applied_transactions: HashMap::new(),
            transaction_order: VecDeque::new(),
        })
    }

    pub fn revision(&self) -> Revision {
        self.revision
    }

    pub fn original(&self) -> &OriginalSnapshot {
        &self.original
    }

    pub fn text(&self) -> &TextBuffer {
        &self.text
    }

    pub fn line_count(&self) -> usize {
        self.line_index.line_count()
    }

    pub fn line_start(&self, line: usize) -> Option<ByteOffset> {
        self.line_index.line_start(line)
    }

    pub fn position_map(&self) -> &PositionMap {
        &self.position_map
    }

    pub fn utf16_for_byte(&self, offset: ByteOffset) -> CoreResult<Utf16Offset> {
        self.position_map.utf16_for_byte(&self.text, offset)
    }

    pub fn byte_for_utf16(&self, offset: Utf16Offset) -> CoreResult<ByteOffset> {
        self.position_map.byte_for_utf16(&self.text, offset)
    }

    pub fn line_col_for_byte(&self, offset: ByteOffset) -> CoreResult<super::LineCol> {
        self.position_map.line_col_for_byte(&self.text, offset)
    }

    pub fn byte_for_line_col(&self, line_col: super::LineCol) -> CoreResult<ByteOffset> {
        self.position_map.byte_for_line_col(&self.text, line_col)
    }

    pub fn source_byte_for_byte(&self, offset: ByteOffset) -> CoreResult<SourceByteOffset> {
        self.position_map.source_byte_for_byte(&self.text, offset)
    }

    pub fn byte_for_source_byte(&self, offset: SourceByteOffset) -> CoreResult<ByteOffset> {
        self.position_map.byte_for_source_byte(&self.text, offset)
    }

    pub fn save_payload(&self) -> SavePayload {
        SavePayload::new(self.text.to_source_bytes(self.original.bom))
    }

    pub fn write_save_payload<W: Write>(&self, writer: &mut W) -> CoreResult<()> {
        writer.write_all(self.save_payload().as_bytes())?;
        Ok(())
    }

    pub fn retained_transaction_count(&self) -> usize {
        self.applied_transactions.len()
    }

    pub fn apply_patch(&mut self, patch: TextPatch) -> CoreResult<PatchOutcome> {
        let fingerprint = patch.payload_fingerprint();
        if let Some(applied) = self.applied_transactions.get(&patch.transaction_id) {
            if applied.fingerprint == fingerprint {
                return Ok(applied.outcome.clone());
            }
            return Err(CoreError::TransactionConflict);
        }

        let normalized_changes = patch.normalized_changes_against(self)?;
        let mut next_text = self.text.clone();
        next_text.apply_changes(&normalized_changes)?;

        let next_revision = Revision(self.revision.0 + 1);
        let next_line_index = LineIndex::new(next_text.logical_text());
        let next_position_map = PositionMap::new(next_revision, &next_text, self.original.bom);
        let outcome = PatchOutcome {
            revision: next_revision,
            selection_after: patch.selection_for_commit(next_revision, &next_text)?,
        };

        self.text = next_text;
        self.revision = next_revision;
        self.line_index = next_line_index;
        self.position_map = next_position_map;
        if self.transaction_order.len() == TRANSACTION_RETRY_WINDOW_CAPACITY {
            if let Some(evicted) = self.transaction_order.pop_front() {
                self.applied_transactions.remove(&evicted);
            }
        }
        self.transaction_order.push_back(patch.transaction_id);
        self.applied_transactions.insert(
            patch.transaction_id,
            AppliedTransaction {
                fingerprint,
                outcome: outcome.clone(),
            },
        );

        Ok(outcome)
    }
}
