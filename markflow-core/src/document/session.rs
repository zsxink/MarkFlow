use std::collections::{HashMap, VecDeque};
use std::io::{self, Write};
use std::sync::RwLock;

use super::patch::PayloadFingerprint;
use super::types::{
    ByteOffset, DocumentId, Revision, SessionId, SourceByteOffset, SourceOffsetError,
    TransactionId, Utf16Offset,
};
use super::{
    EditOrigin, HistoryEntry, HistoryLabel, HistoryStack, LineIndex, OriginalSnapshot, ParseIndex,
    PatchOutcome, PositionMap, ScanOutcome, TextBuffer, TextPatch,
};

pub const TRANSACTION_RETRY_WINDOW_CAPACITY: usize = 256;

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

#[derive(Debug)]
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
    parse_index_cache: RwLock<Option<ScanOutcome>>,
    history: HistoryStack,
    applied_transactions: HashMap<TransactionId, AppliedTransaction>,
    transaction_order: VecDeque<TransactionId>,
}

impl Clone for DocumentSession {
    fn clone(&self) -> Self {
        Self {
            id: self.id,
            document_id: self.document_id,
            revision: self.revision,
            original: self.original.clone(),
            text: self.text.clone(),
            line_index: self.line_index.clone(),
            position_map: self.position_map.clone(),
            parse_index_cache: RwLock::new(self.read_cache().clone()),
            history: self.history.clone(),
            applied_transactions: self.applied_transactions.clone(),
            transaction_order: self.transaction_order.clone(),
        }
    }
}

impl DocumentSession {
    pub fn open_bytes(id: SessionId, document_id: DocumentId, bytes: &[u8]) -> CoreResult<Self> {
        let original = OriginalSnapshot::from_bytes(bytes)?;
        let text = TextBuffer::from_source_bytes(bytes, original.bom())?;
        let revision = Revision(0);
        let line_index = LineIndex::new(text.logical_text());
        let position_map = PositionMap::new(revision, &text, original.bom());

        Ok(Self {
            id,
            document_id,
            revision,
            original,
            text,
            line_index,
            position_map,
            parse_index_cache: RwLock::new(None),
            history: HistoryStack::new(),
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

    pub fn parse_index(&self) -> ScanOutcome {
        if let Some(cached) = self.read_cache().as_ref() {
            if cached.parse_index.revision == self.revision {
                return cached.clone();
            }
        }

        let outcome = ParseIndex::scan_with_document_bytes(
            self.revision,
            self.text.logical_text(),
            self.original.dominant_line_ending(),
            self.original.byte_len(),
        );
        *self.write_cache() = Some(outcome.clone());
        outcome
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
        SavePayload::new(self.text.to_source_bytes(self.original.bom()))
    }

    pub fn write_save_payload<W: Write>(&self, writer: &mut W) -> CoreResult<()> {
        writer.write_all(self.save_payload().as_bytes())?;
        Ok(())
    }

    pub fn retained_transaction_count(&self) -> usize {
        self.applied_transactions.len()
    }

    pub fn history_len(&self) -> usize {
        self.history.len()
    }

    pub fn history_cursor(&self) -> usize {
        self.history.cursor()
    }

    pub fn can_undo(&self) -> bool {
        self.history.can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.history.can_redo()
    }

    pub fn apply_patch(&mut self, patch: TextPatch) -> CoreResult<PatchOutcome> {
        self.apply_patch_internal(
            patch,
            Some(HistoryMeta {
                origin: EditOrigin::User,
                label: HistoryLabel::TextInput,
                selection_before: None,
            }),
        )
    }

    pub fn apply_patch_with_history(
        &mut self,
        patch: TextPatch,
        origin: EditOrigin,
        label: HistoryLabel,
        selection_before: Option<super::Selection>,
    ) -> CoreResult<PatchOutcome> {
        self.apply_patch_internal(
            patch,
            Some(HistoryMeta {
                origin,
                label,
                selection_before,
            }),
        )
    }

    pub fn undo(&mut self, transaction_id: TransactionId) -> CoreResult<Option<PatchOutcome>> {
        if let Some(applied) = self.applied_transactions.get(&transaction_id) {
            return Ok(Some(applied.outcome.clone()));
        }

        let Some(entry) = self.history.peek_undo().cloned() else {
            return Ok(None);
        };
        let patch = rebase_patch(entry.inverse_patch, self.revision, transaction_id);
        let outcome = self.apply_patch_internal(patch, None)?;
        self.history.mark_undone();
        Ok(Some(outcome))
    }

    pub fn redo(&mut self, transaction_id: TransactionId) -> CoreResult<Option<PatchOutcome>> {
        if let Some(applied) = self.applied_transactions.get(&transaction_id) {
            return Ok(Some(applied.outcome.clone()));
        }

        let Some(entry) = self.history.peek_redo().cloned() else {
            return Ok(None);
        };
        let patch = rebase_patch(entry.patch, self.revision, transaction_id);
        let outcome = self.apply_patch_internal(patch, None)?;
        self.history.mark_redone();
        Ok(Some(outcome))
    }

    fn apply_patch_internal(
        &mut self,
        patch: TextPatch,
        history_meta: Option<HistoryMeta>,
    ) -> CoreResult<PatchOutcome> {
        let fingerprint = patch.payload_fingerprint();
        if let Some(applied) = self.applied_transactions.get(&patch.transaction_id) {
            if applied.fingerprint == fingerprint {
                return Ok(applied.outcome.clone());
            }
            return Err(CoreError::TransactionConflict);
        }

        let normalized_changes = patch.normalized_changes_against(self)?;
        let inverse_changes =
            inverse_changes_for(self.revision, self.text.logical_text(), &normalized_changes);
        let mut next_text = self.text.clone();
        next_text.apply_changes(&normalized_changes)?;

        let next_revision = Revision(self.revision.0 + 1);
        let next_line_index = LineIndex::new(next_text.logical_text());
        let next_position_map = PositionMap::new(next_revision, &next_text, self.original.bom());
        let outcome = PatchOutcome {
            revision: next_revision,
            selection_after: patch.selection_for_commit(next_revision, &next_text)?,
        };
        let history_entry = history_meta.map(|meta| HistoryEntry {
            session_id: self.id,
            transaction_id: patch.transaction_id,
            origin: meta.origin,
            revision_before: self.revision,
            revision_after: next_revision,
            inverse_patch: TextPatch {
                transaction_id: patch.transaction_id,
                base_revision: next_revision,
                changes: inverse_changes,
                selection_after: meta.selection_before.clone(),
            },
            label: meta.label,
            selection_before: meta.selection_before,
            patch: TextPatch {
                transaction_id: patch.transaction_id,
                base_revision: self.revision,
                changes: normalized_changes,
                selection_after: patch.selection_after.clone(),
            },
        });

        self.text = next_text;
        self.revision = next_revision;
        self.line_index = next_line_index;
        self.position_map = next_position_map;
        *self.write_cache() = None;
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
        if let Some(entry) = history_entry {
            self.history.push(entry);
        }

        Ok(outcome)
    }

    fn read_cache(&self) -> std::sync::RwLockReadGuard<'_, Option<ScanOutcome>> {
        self.parse_index_cache
            .read()
            .expect("parse index cache lock poisoned")
    }

    fn write_cache(&self) -> std::sync::RwLockWriteGuard<'_, Option<ScanOutcome>> {
        self.parse_index_cache
            .write()
            .expect("parse index cache lock poisoned")
    }
}

struct HistoryMeta {
    origin: EditOrigin,
    label: HistoryLabel,
    selection_before: Option<super::Selection>,
}

fn inverse_changes_for(
    revision_after: Revision,
    before_text: &str,
    changes: &[super::TextChange],
) -> Vec<super::TextChange> {
    let mut inverse = Vec::with_capacity(changes.len());
    let mut delta: isize = 0;

    for change in changes {
        let original = before_text[change.range.start.0..change.range.end.0].to_string();
        let start_after = change.range.start.0.saturating_add_signed(delta);
        let end_after = start_after + change.replacement.len();
        inverse.push(super::TextChange {
            range: super::SourceRange::new(revision_after, start_after, end_after),
            replacement: original,
        });
        delta += change.replacement.len() as isize
            - (change.range.end.0 - change.range.start.0) as isize;
    }

    inverse
}

fn rebase_patch(
    patch: TextPatch,
    base_revision: Revision,
    transaction_id: TransactionId,
) -> TextPatch {
    TextPatch {
        transaction_id,
        base_revision,
        changes: patch
            .changes
            .into_iter()
            .map(|change| super::TextChange {
                range: super::SourceRange {
                    revision: base_revision,
                    start: change.range.start,
                    end: change.range.end,
                },
                replacement: change.replacement,
            })
            .collect(),
        selection_after: patch.selection_after.map(|selection| super::Selection {
            revision: base_revision,
            ..selection
        }),
    }
}
