//! Lossless document session state machine (task 2.6).
//!
//! One session owns the confirmed text truth for one document:
//!
//! ```text
//! open -> apply(patch) -> snapshot -> prepare_save -> mark_persisted
//!   └--> reload(new bytes) ─┘        └--> close
//! ```
//!
//! All mutations are atomic: a failed apply leaves revision, text, position
//! map and the applied-transaction ledger completely unchanged. `prepare_save`
//! rejects stale revisions and mismatched file identity; it never consults a
//! parser or serializer — the payload is regenerated from the logical text and
//! the per-boundary EOL map.

use std::collections::{HashMap, VecDeque};

use crate::error::{CoreError, CoreResult};
use crate::identity::{ContentHash, FileIdentity};
use crate::line_ending::LineEndingKind;
use crate::patch::{PatchOutcome, TextPatch};
use crate::position_map::PositionMap;
use crate::snapshot::{BomKind, OriginalSnapshot};
use crate::text_buffer::TextBuffer;
use crate::types::{
    BindingGeneration, DocumentId, LogicalByteOffset, Revision, SessionId, TransactionId,
};

/// How many applied-transaction entries are retained for idempotent retry
/// before the oldest is evicted.
pub const TRANSACTION_RETRY_WINDOW_CAPACITY: usize = 256;

/// A confirmed snapshot of the session (used for resync, export, flush barrier).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentSnapshot {
    pub revision: Revision,
    pub logical_text: String,
    pub confirmed_hash: ContentHash,
    pub persisted_revision: Option<Revision>,
    pub original: OriginalSnapshot,
}

/// The save payload for the current confirmed revision. Bytes come from
/// `TextBuffer::to_source_bytes`, never from a parser/serializer.
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

    pub fn len(&self) -> usize {
        self.bytes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }
}

/// Confirmed text hash for the current revision (SHA-256 over the source
/// replay, BOM included).
pub(crate) fn confirmed_hash(text: &TextBuffer, bom: BomKind) -> ContentHash {
    ContentHash::of(&text.to_source_bytes(bom))
}

#[derive(Debug, Clone)]
struct AppliedTransaction {
    fingerprint: u128,
    outcome: PatchOutcome,
}

/// The Core session. Not `Sync` (no interior mutability); P1B wraps it in a
/// `Mutex` inside the registry.
#[derive(Debug)]
pub struct LosslessDocumentSession {
    pub session_id: SessionId,
    pub document_id: DocumentId,
    binding_generation: BindingGeneration,
    revision: Revision,
    original: OriginalSnapshot,
    text: TextBuffer,
    position_map: PositionMap,
    applied_transactions: HashMap<TransactionId, AppliedTransaction>,
    transaction_order: VecDeque<TransactionId>,
    persisted_revision: Option<Revision>,
    closed: bool,
}

impl Clone for LosslessDocumentSession {
    fn clone(&self) -> Self {
        Self {
            session_id: self.session_id,
            document_id: self.document_id,
            binding_generation: self.binding_generation,
            revision: self.revision,
            original: self.original.clone(),
            text: self.text.clone(),
            position_map: self.position_map.clone(),
            applied_transactions: self.applied_transactions.clone(),
            transaction_order: self.transaction_order.clone(),
            persisted_revision: self.persisted_revision,
            closed: self.closed,
        }
    }
}

impl LosslessDocumentSession {
    /// Open a session from raw bytes.
    pub fn open_bytes(
        session_id: SessionId,
        document_id: DocumentId,
        bytes: &[u8],
        default_eol: LineEndingKind,
    ) -> CoreResult<Self> {
        let original = OriginalSnapshot::from_bytes(bytes, default_eol)?;
        let text =
            TextBuffer::from_source_bytes(bytes, original.bom, original.dominant_line_ending())?;
        Ok(Self::from_parts(session_id, document_id, original, text))
    }

    /// Open a session from raw bytes with a caller-provided disk identity.
    pub fn open_bytes_with_identity(
        session_id: SessionId,
        document_id: DocumentId,
        bytes: &[u8],
        default_eol: LineEndingKind,
        file_identity: FileIdentity,
    ) -> CoreResult<Self> {
        let original =
            OriginalSnapshot::from_bytes_with_identity(bytes, default_eol, file_identity)?;
        let text =
            TextBuffer::from_source_bytes(bytes, original.bom, original.dominant_line_ending())?;
        Ok(Self::from_parts(session_id, document_id, original, text))
    }

    fn from_parts(
        session_id: SessionId,
        document_id: DocumentId,
        original: OriginalSnapshot,
        text: TextBuffer,
    ) -> Self {
        let revision = Revision(0);
        let position_map = PositionMap::new(&text, original.bom);
        Self {
            session_id,
            document_id,
            binding_generation: BindingGeneration(0),
            revision,
            original,
            text,
            position_map,
            applied_transactions: HashMap::new(),
            transaction_order: VecDeque::new(),
            // Opening raw bytes establishes both confirmed and persisted
            // revision zero. A fresh session therefore cannot autosave until a
            // confirmed edit changes the revision.
            persisted_revision: Some(revision),
            closed: false,
        }
    }

    // -- lifecycle ---------------------------------------------------------

    pub fn is_closed(&self) -> bool {
        self.closed
    }

    /// Close the session: clears the retry ledger and marks it closed. Further
    /// operations return [`CoreError::SessionClosed`].
    pub fn close(&mut self) {
        self.closed = true;
        self.applied_transactions.clear();
        self.transaction_order.clear();
    }

    /// Reload the session from new disk bytes (same session/document identity).
    /// The retry ledger and edit history are reset and the binding generation
    /// advances, invalidating delayed patches for the former document image.
    pub fn reload(&mut self, bytes: &[u8], default_eol: LineEndingKind) -> CoreResult<()> {
        if self.closed {
            return Err(CoreError::SessionClosed);
        }
        let original = OriginalSnapshot::from_bytes(bytes, default_eol)?;
        let text =
            TextBuffer::from_source_bytes(bytes, original.bom, original.dominant_line_ending())?;
        let next_binding_generation = self
            .binding_generation
            .0
            .checked_add(1)
            .ok_or(CoreError::InternalInvariant("binding generation exhausted"))?;
        self.original = original;
        self.text = text;
        self.revision = Revision(0);
        self.binding_generation = BindingGeneration(next_binding_generation);
        self.position_map = PositionMap::new(&self.text, self.original.bom);
        self.applied_transactions.clear();
        self.transaction_order.clear();
        // Reloaded bytes are the confirmed on-disk state, so the session is
        // clean immediately. Clearing this value made a zero-edit reload look
        // dirty and allowed callers to enter autosave unnecessarily.
        self.persisted_revision = Some(self.revision);
        Ok(())
    }

    // -- accessors ----------------------------------------------------------

    pub fn revision(&self) -> Revision {
        self.revision
    }

    /// Current binding generation. Every TextPatch must carry this value.
    pub fn binding_generation(&self) -> BindingGeneration {
        self.binding_generation
    }

    pub fn text(&self) -> &TextBuffer {
        &self.text
    }

    pub fn original(&self) -> &OriginalSnapshot {
        &self.original
    }

    pub fn position_map(&self) -> &PositionMap {
        &self.position_map
    }

    pub fn persisted_revision(&self) -> Option<Revision> {
        self.persisted_revision
    }

    pub fn is_dirty(&self) -> bool {
        match self.persisted_revision {
            Some(persisted) => self.revision != persisted,
            None => true,
        }
    }

    /// Confirmed hash of the current revision's source replay.
    pub fn confirmed_hash(&self) -> ContentHash {
        confirmed_hash(&self.text, self.original.bom)
    }

    /// A confirmed snapshot for resync / flush / export.
    pub fn snapshot(&self) -> DocumentSnapshot {
        DocumentSnapshot {
            revision: self.revision,
            logical_text: self.text.logical_text().to_string(),
            confirmed_hash: self.confirmed_hash(),
            persisted_revision: self.persisted_revision,
            original: self.original.clone(),
        }
    }

    /// Number of retained applied transactions (retry window occupancy).
    pub fn retained_transaction_count(&self) -> usize {
        self.applied_transactions.len()
    }

    // -- coordinate mapping (facade over PositionMap) ------------------------

    pub fn utf16_for_byte(
        &self,
        offset: crate::types::LogicalByteOffset,
    ) -> CoreResult<crate::types::Utf16Offset> {
        self.position_map.utf16_for_byte(&self.text, offset)
    }

    pub fn byte_for_utf16(
        &self,
        offset: crate::types::Utf16Offset,
    ) -> CoreResult<crate::types::LogicalByteOffset> {
        self.position_map.byte_for_utf16(&self.text, offset)
    }

    pub fn source_byte_for_byte(
        &self,
        offset: crate::types::LogicalByteOffset,
    ) -> CoreResult<crate::types::SourceByteOffset> {
        self.position_map.source_byte_for_byte(&self.text, offset)
    }

    pub fn byte_for_source_byte(
        &self,
        offset: crate::types::SourceByteOffset,
    ) -> CoreResult<crate::types::LogicalByteOffset> {
        self.position_map.byte_for_source_byte(&self.text, offset)
    }

    // -- patching -----------------------------------------------------------

    /// Apply a patch atomically. Idempotent for the same transaction id +
    /// payload; a reused id with a different payload is rejected.
    pub fn apply_patch(&mut self, patch: TextPatch) -> CoreResult<PatchOutcome> {
        if self.closed {
            return Err(CoreError::SessionClosed);
        }

        let fingerprint = patch.fingerprint();
        if let Some(applied) = self.applied_transactions.get(&patch.transaction_id) {
            if applied.fingerprint == fingerprint {
                return Ok(applied.outcome.clone());
            }
            return Err(CoreError::TransactionConflict);
        }

        // Validate against current state; no mutation happens here.
        let normalized = patch.normalize_changes(self)?;

        // Build the next state on locals; fallible steps must not touch self.
        let mut next_text = self.text.clone();
        let changes: Vec<_> = normalized
            .iter()
            .map(|c| {
                (
                    LogicalByteOffset(c.range.start.as_usize())
                        ..LogicalByteOffset(c.range.end.as_usize()),
                    c.inserted_logical_text.clone(),
                    c.inserted_line_endings.clone(),
                )
            })
            .collect();
        next_text.apply_changes(&changes)?;

        let next_revision = Revision(self.revision.0 + 1);
        let selection_after = patch.selection_for_commit(next_revision, &next_text)?;
        let outcome = PatchOutcome {
            revision: next_revision,
            confirmed_hash: confirmed_hash(&next_text, self.original.bom),
            selection_after,
        };

        // All fallible work done — commit.
        self.text = next_text;
        self.revision = next_revision;
        self.position_map = PositionMap::new(&self.text, self.original.bom);
        self.record_applied(patch.transaction_id, fingerprint, outcome.clone());
        Ok(outcome)
    }

    fn record_applied(
        &mut self,
        transaction_id: TransactionId,
        fingerprint: u128,
        outcome: PatchOutcome,
    ) {
        if self.transaction_order.len() == TRANSACTION_RETRY_WINDOW_CAPACITY {
            if let Some(evicted) = self.transaction_order.pop_front() {
                self.applied_transactions.remove(&evicted);
            }
        }
        self.transaction_order.push_back(transaction_id);
        self.applied_transactions.insert(
            transaction_id,
            AppliedTransaction {
                fingerprint,
                outcome,
            },
        );
    }

    // -- save ---------------------------------------------------------------

    /// Produce the save payload for the current confirmed revision.
    ///
    /// Rejects:
    /// - a closed session;
    /// - a stale `expected_revision` (the caller must prepare the exact
    ///   revision it intends to persist);
    /// - a `expected_identity` that does not match the session's known file
    ///   identity (external change → conflict, never overwrite).
    ///
    /// The payload is regenerated from the logical text + EOL provenance, so a
    /// zero-patch session returns the exact original bytes by construction.
    pub fn prepare_save(
        &self,
        expected_revision: Revision,
        expected_identity: &FileIdentity,
    ) -> CoreResult<SavePayload> {
        if self.closed {
            return Err(CoreError::SessionClosed);
        }
        if expected_revision != self.revision {
            return Err(CoreError::StaleRevision {
                expected: self.revision,
                actual: expected_revision,
            });
        }
        if expected_identity != &self.original.file_identity {
            return Err(CoreError::ExternalConflict);
        }
        Ok(SavePayload::new(
            self.text.to_source_bytes(self.original.bom),
        ))
    }

    /// Mark a revision as persisted after a successful write (or after
    /// reconcile confirms the disk already matches). Optionally binds a new
    /// file identity (new mtime after the write).
    pub fn mark_persisted(
        &mut self,
        persisted_revision: Revision,
        new_identity: Option<FileIdentity>,
    ) -> CoreResult<()> {
        if self.closed {
            return Err(CoreError::SessionClosed);
        }
        if persisted_revision > self.revision {
            return Err(CoreError::StaleRevision {
                expected: self.revision,
                actual: persisted_revision,
            });
        }
        self.persisted_revision = Some(persisted_revision);
        if let Some(identity) = new_identity {
            self.original.file_identity = identity;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::line_ending::NewlineEnding;
    use crate::patch::{Selection, TextChange};
    use crate::types::{LogicalByteOffset, SourceRange};

    fn session(bytes: &[u8]) -> LosslessDocumentSession {
        LosslessDocumentSession::open_bytes(SessionId(1), DocumentId(1), bytes, LineEndingKind::Lf)
            .unwrap()
    }

    fn patch(session: &LosslessDocumentSession, txn: u64, changes: Vec<TextChange>) -> TextPatch {
        TextPatch {
            binding_generation: session.binding_generation(),
            session_id: session.session_id,
            document_id: session.document_id,
            transaction_id: TransactionId(txn),
            base_revision: session.revision(),
            changes,
            selection_after: None,
        }
    }

    fn change(start: usize, end: usize, inserted: &str) -> TextChange {
        let eol_count = inserted.bytes().filter(|b| *b == b'\n').count();
        TextChange {
            range: SourceRange::new(LogicalByteOffset(start), LogicalByteOffset(end)),
            inserted_logical_text: inserted.to_string(),
            inserted_line_endings: vec![NewlineEnding::Inherit; eol_count],
        }
    }

    #[test]
    fn open_zero_revision_and_clean() {
        let s = session(b"# T\n\nbody\n");
        assert_eq!(s.revision(), Revision(0));
        assert!(!s.is_closed());
        assert!(!s.is_dirty());
        assert_eq!(s.persisted_revision(), Some(Revision(0)));
        assert_eq!(s.snapshot().revision, Revision(0));
    }

    #[test]
    fn apply_patch_advances_revision() {
        let mut s = session(b"hello");
        let outcome = s
            .apply_patch(patch(&s, 1, vec![change(0, 0, "X")]))
            .unwrap();
        assert_eq!(outcome.revision, Revision(1));
        assert_eq!(s.revision(), Revision(1));
        assert_eq!(s.text().logical_text(), "Xhello");
        assert_eq!(s.confirmed_hash(), ContentHash::of(b"Xhello"));
    }

    #[test]
    fn duplicate_retry_is_idempotent() {
        let mut s = session(b"hello");
        let p = patch(&s, 7, vec![change(0, 5, "world")]);
        let first = s.apply_patch(p.clone()).unwrap();
        let second = s.apply_patch(p).unwrap();
        assert_eq!(first, second);
        assert_eq!(s.revision(), Revision(1));
        assert_eq!(s.text().logical_text(), "world");
    }

    #[test]
    fn duplicate_mismatch_rejected() {
        let mut s = session(b"hello");
        let p1 = patch(&s, 7, vec![change(0, 5, "world")]);
        s.apply_patch(p1).unwrap();
        let p2 = patch(&s, 7, vec![change(0, 5, "moon")]);
        assert_eq!(s.apply_patch(p2), Err(CoreError::TransactionConflict));
        // Nothing changed by the rejected patch.
        assert_eq!(s.revision(), Revision(1));
        assert_eq!(s.text().logical_text(), "world");
    }

    #[test]
    fn stale_revision_rejected_atomically() {
        let mut s = session(b"hello");
        let stale = TextPatch {
            binding_generation: s.binding_generation(),
            session_id: s.session_id,
            document_id: s.document_id,
            transaction_id: TransactionId(9),
            base_revision: Revision(5),
            changes: vec![change(0, 5, "nope")],
            selection_after: None,
        };
        assert_eq!(
            s.apply_patch(stale),
            Err(CoreError::StaleRevision {
                expected: Revision(0),
                actual: Revision(5)
            })
        );
        assert_eq!(s.revision(), Revision(0));
        assert_eq!(s.text().logical_text(), "hello");
    }

    #[test]
    fn closed_session_rejects_all_ops() {
        let mut s = session(b"hello");
        s.close();
        assert!(s.is_closed());
        assert_eq!(
            s.apply_patch(patch(&s, 1, vec![change(0, 0, "X")])),
            Err(CoreError::SessionClosed)
        );
        assert_eq!(
            s.prepare_save(Revision(0), &FileIdentity::from_bytes(b"hello")),
            Err(CoreError::SessionClosed)
        );
        assert!(s.reload(b"new", LineEndingKind::Lf).is_err());
    }

    #[test]
    fn prepare_save_returns_original_bytes_zero_patch() {
        let bytes = b"\xef\xbb\xbf# T\r\n\r\nbody\r\n";
        let identity = FileIdentity::from_bytes(bytes);
        let s = session(bytes);
        let payload = s.prepare_save(Revision(0), &identity).unwrap();
        assert_eq!(payload.as_bytes(), bytes);
        assert_eq!(payload.len(), bytes.len());
    }

    #[test]
    fn prepare_save_rejects_stale_revision_and_conflict() {
        let bytes = b"hello";
        let identity = FileIdentity::from_bytes(bytes);
        let s = session(bytes);
        assert_eq!(
            s.prepare_save(Revision(1), &identity),
            Err(CoreError::StaleRevision {
                expected: Revision(0),
                actual: Revision(1)
            })
        );
        let other = FileIdentity::from_bytes(b"different");
        assert_eq!(
            s.prepare_save(Revision(0), &other),
            Err(CoreError::ExternalConflict)
        );
    }

    #[test]
    fn mark_persisted_clears_dirty_and_binds_identity() {
        let mut s = session(b"hello");
        s.mark_persisted(Revision(0), None).unwrap();
        assert!(!s.is_dirty());
        s.apply_patch(patch(&s, 1, vec![change(0, 0, "X")]))
            .unwrap();
        assert!(s.is_dirty());
        s.mark_persisted(Revision(1), None).unwrap();
        assert!(!s.is_dirty());
        assert_eq!(s.persisted_revision(), Some(Revision(1)));
    }

    #[test]
    fn mark_persisted_rejects_future_revision() {
        let mut s = session(b"hello");
        assert_eq!(
            s.mark_persisted(Revision(3), None),
            Err(CoreError::StaleRevision {
                expected: Revision(0),
                actual: Revision(3)
            })
        );
    }

    #[test]
    fn reload_resets_content_and_revision() {
        let mut s = session(b"hello");
        s.apply_patch(patch(&s, 1, vec![change(0, 0, "X")]))
            .unwrap();
        s.mark_persisted(Revision(1), None).unwrap();
        s.reload(b"fresh\ncontent", LineEndingKind::Lf).unwrap();
        assert_eq!(s.revision(), Revision(0));
        assert_eq!(s.text().logical_text(), "fresh\ncontent");
        assert_eq!(s.persisted_revision(), Some(Revision(0)));
        assert!(!s.is_dirty());
    }

    #[test]
    fn reload_rejects_delayed_patch_from_previous_binding_generation() {
        let mut s = session(b"before");
        let delayed = patch(&s, 7, vec![change(0, 0, "stale-")]);
        let before_generation = s.binding_generation();

        s.reload(b"after", LineEndingKind::Lf).unwrap();

        assert_ne!(s.binding_generation(), before_generation);
        assert_eq!(s.apply_patch(delayed), Err(CoreError::WrongIdentity));
        assert_eq!(s.revision(), Revision(0));
        assert_eq!(s.text().logical_text(), "after");
        assert!(!s.is_dirty());
    }

    #[test]
    fn apply_patch_failure_leaves_everything_unchanged() {
        let mut s = session(b"hello");
        // Overlapping changes must fail and leave the session at revision 0.
        let bad = TextPatch {
            binding_generation: s.binding_generation(),
            session_id: s.session_id,
            document_id: s.document_id,
            transaction_id: TransactionId(3),
            base_revision: Revision(0),
            changes: vec![change(0, 3, "X"), change(2, 5, "Y")],
            selection_after: None,
        };
        assert_eq!(s.apply_patch(bad), Err(CoreError::OverlappingChanges));
        assert_eq!(s.revision(), Revision(0));
        assert_eq!(s.text().logical_text(), "hello");
        assert_eq!(s.retained_transaction_count(), 0);
    }

    #[test]
    fn selection_after_is_committed_with_next_revision() {
        let mut s = session(b"hello");
        let p = TextPatch {
            binding_generation: s.binding_generation(),
            session_id: s.session_id,
            document_id: s.document_id,
            transaction_id: TransactionId(4),
            base_revision: Revision(0),
            changes: vec![change(0, 0, "A")],
            selection_after: Some(Selection {
                anchor: LogicalByteOffset(1),
                head: LogicalByteOffset(1),
                revision: Revision(0),
            }),
        };
        let outcome = s.apply_patch(p).unwrap();
        assert_eq!(outcome.revision, Revision(1));
        let sel = outcome.selection_after.unwrap();
        assert_eq!(sel.anchor, LogicalByteOffset(1));
        assert_eq!(sel.revision, Revision(1));
    }

    #[test]
    fn retry_window_evicts_oldest() {
        let mut s = session(b"x");
        // Fill past the capacity with distinct transactions.
        for i in 0..(TRANSACTION_RETRY_WINDOW_CAPACITY + 10) {
            let p = patch(&s, 1000 + i as u64, vec![change(0, 0, "a")]);
            s.apply_patch(p).unwrap();
        }
        assert_eq!(
            s.retained_transaction_count(),
            TRANSACTION_RETRY_WINDOW_CAPACITY
        );
        // Oldest (1000) evicted; newest (1000+cap+9) retained.
        let evicted = patch(&s, 1000, vec![change(0, 0, "a")]);
        assert!(s.apply_patch(evicted).is_ok());
        let newest = patch(
            &s,
            (1000 + TRANSACTION_RETRY_WINDOW_CAPACITY + 9) as u64,
            vec![change(0, 0, "a")],
        );
        assert!(s.apply_patch(newest).is_err()); // TransactionConflict — still in window
    }
}
