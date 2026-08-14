//! Revision-bound atomic text patches (task 2.5).
//!
//! A `TextPatch` carries one or more changes expressed in the base revision's
//! coordinates, per-newline EOL provenance for inserted text, and an optional
//! selection-after. Applying a patch either succeeds atomically (revision +1,
//! all changes applied) or leaves the session completely unchanged.

use crate::error::{CoreError, CoreResult};
use crate::line_ending::NewlineEnding;
use crate::types::{LogicalByteOffset, Revision, SourceRange, TransactionId};
use serde::{Deserialize, Serialize};

/// Selection expressed in logical byte offsets at a given revision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub anchor: LogicalByteOffset,
    pub head: LogicalByteOffset,
    pub revision: Revision,
}

/// Result of an applied patch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchOutcome {
    pub revision: crate::types::Revision,
    pub confirmed_hash: crate::identity::ContentHash,
    pub selection_after: Option<Selection>,
}

/// One local change in the base revision's coordinates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextChange {
    /// Range in base-revision logical byte offsets.
    pub range: SourceRange<LogicalByteOffset>,
    /// Inserted logical LF text (must not contain `\r`).
    pub inserted_logical_text: String,
    /// One provenance entry per `\n` in `inserted_logical_text`.
    pub inserted_line_endings: Vec<NewlineEnding>,
}

/// An atomic, revision-bound text patch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPatch {
    /// UI binding generation for the document image from which this patch was
    /// produced. Required to reject delayed pre-reload work.
    pub binding_generation: crate::types::BindingGeneration,
    /// Session and document identity of the binding that produced the patch.
    pub session_id: crate::types::SessionId,
    pub document_id: crate::types::DocumentId,
    pub transaction_id: TransactionId,
    pub base_revision: Revision,
    pub changes: Vec<TextChange>,
    pub selection_after: Option<Selection>,
}

impl TextPatch {
    /// Validate the patch against the session's current revision and text.
    /// Returns the changes normalized (sorted by ascending start) if valid.
    ///
    /// Atomicity guarantee: this performs no mutation; if it errors, nothing
    /// has been applied.
    pub(crate) fn normalize_changes(
        &self,
        session: &crate::session::LosslessDocumentSession,
    ) -> CoreResult<Vec<TextChange>> {
        if session.is_closed() {
            return Err(CoreError::SessionClosed);
        }
        if self.binding_generation != session.binding_generation()
            || self.session_id != session.session_id
            || self.document_id != session.document_id
        {
            return Err(CoreError::WrongIdentity);
        }
        if self.base_revision != session.revision() {
            return Err(CoreError::StaleRevision {
                expected: session.revision(),
                actual: self.base_revision,
            });
        }
        if let Some(selection) = &self.selection_after {
            if selection.revision != self.base_revision {
                return Err(CoreError::StaleRevision {
                    expected: self.base_revision,
                    actual: selection.revision,
                });
            }
        }

        let text = session.text();
        let mut changes = self.changes.clone();
        changes.sort_by(|a, b| {
            (
                a.range.start,
                a.range.end,
                a.range
                    .end
                    .as_usize()
                    .saturating_sub(a.range.start.as_usize()),
                a.inserted_logical_text.as_bytes(),
            )
                .cmp(&(
                    b.range.start,
                    b.range.end,
                    b.range
                        .end
                        .as_usize()
                        .saturating_sub(b.range.start.as_usize()),
                    b.inserted_logical_text.as_bytes(),
                ))
        });

        let mut previous_end: Option<usize> = None;
        for change in &changes {
            let start = change.range.start.as_usize();
            let end = change.range.end.as_usize();
            if start > end || end > text.len_bytes() {
                return Err(CoreError::InvalidRange);
            }
            if let Some(previous) = previous_end {
                if start < previous {
                    return Err(CoreError::OverlappingChanges);
                }
            }
            if !text.is_char_boundary(start) || !text.is_char_boundary(end) {
                return Err(CoreError::InvalidUtf8Boundary);
            }
            if change.inserted_logical_text.contains('\r') {
                return Err(CoreError::InvalidLogicalLineEnding);
            }
            let eol_count = change
                .inserted_logical_text
                .bytes()
                .filter(|b| *b == b'\n')
                .count();
            if change.inserted_line_endings.len() != eol_count {
                return Err(CoreError::InvalidEolProvenance {
                    expected: eol_count,
                    actual: change.inserted_line_endings.len(),
                });
            }
            previous_end = Some(end);
        }

        Ok(changes)
    }

    /// Validate the selection-after offsets against the next text.
    pub(crate) fn selection_for_commit(
        &self,
        next_revision: Revision,
        next_text: &crate::text_buffer::TextBuffer,
    ) -> CoreResult<Option<Selection>> {
        self.selection_after
            .as_ref()
            .map(|selection| {
                validate_selection_offset(next_text, selection.anchor)?;
                validate_selection_offset(next_text, selection.head)?;
                Ok(Selection {
                    anchor: selection.anchor,
                    head: selection.head,
                    revision: next_revision,
                })
            })
            .transpose()
    }

    /// Content fingerprint for transaction idempotency. Two patches with the
    /// same transaction id must produce the same fingerprint, or the retry is a
    /// duplicate mismatch (rejected, never blindly re-applied).
    pub(crate) fn fingerprint(&self) -> u128 {
        let mut f = Fingerprint::new();
        f.write_u64(self.binding_generation.0);
        f.write_u64(self.session_id.0);
        f.write_u64(self.document_id.0);
        f.write_u64(self.base_revision.0);
        f.write_u64(self.transaction_id.0);
        let mut changes = self.changes.clone();
        changes.sort_by(|a, b| {
            (
                a.range.start,
                a.range.end,
                a.range
                    .end
                    .as_usize()
                    .saturating_sub(a.range.start.as_usize()),
                a.inserted_logical_text.as_bytes(),
            )
                .cmp(&(
                    b.range.start,
                    b.range.end,
                    b.range
                        .end
                        .as_usize()
                        .saturating_sub(b.range.start.as_usize()),
                    b.inserted_logical_text.as_bytes(),
                ))
        });
        f.write_u64(changes.len() as u64);
        for change in changes {
            f.write_u64(change.range.start.as_usize() as u64);
            f.write_u64(change.range.end.as_usize() as u64);
            f.write_bytes(change.inserted_logical_text.as_bytes());
            f.write_u64(change.inserted_line_endings.len() as u64);
            for prov in change.inserted_line_endings {
                f.write_u8(match prov {
                    NewlineEnding::Inherit => 0,
                    NewlineEnding::ExplicitLf => 1,
                    NewlineEnding::ExplicitCrlf => 2,
                    NewlineEnding::ExplicitCr => 3,
                });
            }
        }
        match &self.selection_after {
            Some(selection) => {
                f.write_u8(1);
                f.write_u64(selection.anchor.as_usize() as u64);
                f.write_u64(selection.head.as_usize() as u64);
                f.write_u64(selection.revision.0);
            }
            None => f.write_u8(0),
        }
        f.finish()
    }
}

fn validate_selection_offset(
    text: &crate::text_buffer::TextBuffer,
    offset: LogicalByteOffset,
) -> CoreResult<()> {
    if offset.as_usize() > text.len_bytes() {
        return Err(CoreError::InvalidRange);
    }
    if !text.is_char_boundary(offset.as_usize()) {
        return Err(CoreError::InvalidUtf8Boundary);
    }
    Ok(())
}

/// FNV-1a-128 fingerprint (matches the draft's fingerprint shape). Used only
/// for idempotency comparison, never as a content hash.
struct Fingerprint(u128);

impl Fingerprint {
    const OFFSET: u128 = 0x6c62_272e_07bb_0142_62b8_2175_6295_c58d;
    const PRIME: u128 = 0x0000_0000_0100_0000_0000_0000_0000_013b;

    fn new() -> Self {
        Self(Self::OFFSET)
    }

    fn write_u8(&mut self, value: u8) {
        self.write(&[value]);
    }

    fn write_u64(&mut self, value: u64) {
        self.write(&value.to_le_bytes());
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        self.write_u64(bytes.len() as u64);
        self.write(bytes);
    }

    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 ^= u128::from(*byte);
            self.0 = self.0.wrapping_mul(Self::PRIME);
        }
    }

    fn finish(self) -> u128 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{BindingGeneration, DocumentId, SessionId};

    fn sel(anchor: usize, head: usize, revision: u64) -> Selection {
        Selection {
            anchor: LogicalByteOffset(anchor),
            head: LogicalByteOffset(head),
            revision: Revision(revision),
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
    fn fingerprint_orders_changes() {
        let a = TextPatch {
            binding_generation: BindingGeneration(0),
            session_id: SessionId(1),
            document_id: DocumentId(1),
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(5, 6, "x"), change(0, 1, "y")],
            selection_after: None,
        };
        let b = TextPatch {
            binding_generation: BindingGeneration(0),
            session_id: SessionId(1),
            document_id: DocumentId(1),
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(0, 1, "y"), change(5, 6, "x")],
            selection_after: None,
        };
        assert_eq!(a.fingerprint(), b.fingerprint());
    }

    #[test]
    fn fingerprint_differs_for_different_payload() {
        let a = TextPatch {
            binding_generation: BindingGeneration(0),
            session_id: SessionId(1),
            document_id: DocumentId(1),
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(0, 1, "x")],
            selection_after: None,
        };
        let b = TextPatch {
            binding_generation: BindingGeneration(0),
            session_id: SessionId(1),
            document_id: DocumentId(1),
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(0, 1, "y")],
            selection_after: None,
        };
        assert_ne!(a.fingerprint(), b.fingerprint());
    }

    #[test]
    fn selection_helpers() {
        assert_eq!(sel(1, 2, 0).anchor, LogicalByteOffset(1));
        assert_eq!(sel(1, 2, 0).revision, Revision(0));
    }
}
