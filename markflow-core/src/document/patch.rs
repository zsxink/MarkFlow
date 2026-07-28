use super::{
    ByteOffset, CoreError, CoreResult, DocumentSession, Revision, SourceRange, TextBuffer,
    TransactionId,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Selection {
    pub anchor: ByteOffset,
    pub head: ByteOffset,
    pub revision: Revision,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextChange {
    pub range: SourceRange,
    pub replacement: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextPatch {
    pub transaction_id: TransactionId,
    pub base_revision: Revision,
    pub changes: Vec<TextChange>,
    pub selection_after: Option<Selection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatchOutcome {
    pub revision: Revision,
    pub selection_after: Option<Selection>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PayloadFingerprint(u128);

impl TextPatch {
    pub fn validate_against(&self, session: &DocumentSession) -> CoreResult<()> {
        self.normalized_changes_against(session).map(|_| ())
    }

    pub(crate) fn normalized_changes_against(
        &self,
        session: &DocumentSession,
    ) -> CoreResult<Vec<TextChange>> {
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

        let mut changes = self.changes.clone();
        sort_changes(&mut changes);
        let mut previous_end = None;
        for change in &changes {
            if change.range.revision != session.revision() {
                return Err(CoreError::StaleRevision {
                    expected: session.revision(),
                    actual: change.range.revision,
                });
            }

            let start = change.range.start.0;
            let end = change.range.end.0;
            if start > end || end > session.text().len_bytes() {
                return Err(CoreError::InvalidRange);
            }
            if let Some(previous) = previous_end {
                if start < previous {
                    return Err(CoreError::OverlappingChanges);
                }
            }
            if !session.text().is_char_boundary(start) || !session.text().is_char_boundary(end) {
                return Err(CoreError::InvalidUtf8Boundary);
            }
            let start_utf16 = session.utf16_for_byte(change.range.start)?;
            let end_utf16 = session.utf16_for_byte(change.range.end)?;
            session.byte_for_utf16(start_utf16)?;
            session.byte_for_utf16(end_utf16)?;
            previous_end = Some(end);
        }

        Ok(changes)
    }

    pub(crate) fn selection_for_commit(
        &self,
        next_revision: Revision,
        next_text: &TextBuffer,
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

    pub(crate) fn payload_fingerprint(&self) -> PayloadFingerprint {
        let mut changes = self.changes.clone();
        sort_changes(&mut changes);

        let mut fingerprint = Fingerprint128::new();
        fingerprint.write_u64(self.base_revision.0);
        fingerprint.write_usize(changes.len());
        for change in changes {
            fingerprint.write_u64(change.range.revision.0);
            fingerprint.write_usize(change.range.start.0);
            fingerprint.write_usize(change.range.end.0);
            fingerprint.write_bytes(change.replacement.as_bytes());
        }
        match &self.selection_after {
            Some(selection) => {
                fingerprint.write_u8(1);
                fingerprint.write_usize(selection.anchor.0);
                fingerprint.write_usize(selection.head.0);
                fingerprint.write_u64(selection.revision.0);
            }
            None => fingerprint.write_u8(0),
        }
        PayloadFingerprint(fingerprint.finish())
    }
}

fn sort_changes(changes: &mut [TextChange]) {
    changes.sort_by(|left, right| {
        (
            left.range.start,
            left.range.end,
            left.range.revision,
            left.replacement.as_bytes(),
        )
            .cmp(&(
                right.range.start,
                right.range.end,
                right.range.revision,
                right.replacement.as_bytes(),
            ))
    });
}

fn validate_selection_offset(text: &TextBuffer, offset: ByteOffset) -> CoreResult<()> {
    if offset.0 > text.len_bytes() {
        return Err(CoreError::InvalidRange);
    }
    if !text.is_char_boundary(offset.0) {
        return Err(CoreError::InvalidUtf8Boundary);
    }
    Ok(())
}

struct Fingerprint128(u128);

impl Fingerprint128 {
    const OFFSET: u128 = 0x6c62272e07bb014262b821756295c58d;
    const PRIME: u128 = 0x0000000001000000000000000000013b;

    fn new() -> Self {
        Self(Self::OFFSET)
    }

    fn write_u8(&mut self, value: u8) {
        self.write(&[value]);
    }

    fn write_u64(&mut self, value: u64) {
        self.write(&value.to_le_bytes());
    }

    fn write_usize(&mut self, value: usize) {
        self.write_u64(value as u64);
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        self.write_usize(bytes.len());
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
