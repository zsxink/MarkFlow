use super::{EditOrigin, Revision, Selection, SessionId, TextPatch, TransactionId};

/// User-facing category attached to a history entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistoryLabel {
    /// Plain text input or source-mode patch.
    TextInput,
    /// IME composition committed as one unit.
    Composition,
    /// Semantic edit command such as bold, heading, or list toggle.
    Command,
    /// Programmatic patch that should remain undoable.
    ExternalPatch,
    /// Caller-provided label for future UI integration.
    Custom(String),
}

/// One undoable Core edit transaction for a single document session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
    pub session_id: SessionId,
    pub transaction_id: TransactionId,
    pub origin: EditOrigin,
    pub revision_before: Revision,
    pub revision_after: Revision,
    pub inverse_patch: TextPatch,
    pub label: HistoryLabel,
    pub selection_before: Option<Selection>,
    pub patch: TextPatch,
}

/// Linear undo/redo stack.
///
/// `cursor` points one past the last applied entry. Entries at and after the
/// cursor are redo candidates and are discarded when a new edit is pushed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryStack {
    entries: Vec<HistoryEntry>,
    cursor: usize,
}

impl HistoryStack {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            cursor: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn cursor(&self) -> usize {
        self.cursor
    }

    pub fn can_undo(&self) -> bool {
        self.cursor > 0
    }

    pub fn can_redo(&self) -> bool {
        self.cursor < self.entries.len()
    }

    pub fn push(&mut self, entry: HistoryEntry) {
        self.entries.truncate(self.cursor);
        self.entries.push(entry);
        self.cursor = self.entries.len();
    }

    pub fn peek_undo(&self) -> Option<&HistoryEntry> {
        self.cursor
            .checked_sub(1)
            .and_then(|index| self.entries.get(index))
    }

    pub fn peek_redo(&self) -> Option<&HistoryEntry> {
        self.entries.get(self.cursor)
    }

    pub fn undo(&mut self) -> Option<HistoryEntry> {
        let entry = self.peek_undo()?.clone();
        self.cursor -= 1;
        Some(entry)
    }

    pub fn redo(&mut self) -> Option<HistoryEntry> {
        let entry = self.peek_redo()?.clone();
        self.cursor += 1;
        Some(entry)
    }

    pub(crate) fn mark_undone(&mut self) {
        debug_assert!(self.can_undo());
        self.cursor -= 1;
    }

    pub(crate) fn mark_redone(&mut self) {
        debug_assert!(self.can_redo());
        self.cursor += 1;
    }
}

impl Default for HistoryStack {
    fn default() -> Self {
        Self::new()
    }
}
