//! Semantic edit commands for the MarkFlow Core.
//!
//! Each typed command (ToggleStrong, SetHeading, etc.) reads the current
//! document session, determines the semantic transformation needed, and
//! produces a [`TextPatch`]. The caller applies it via
//! [`DocumentSession::apply_patch`].
//!
//! All commands operate in terms of byte offsets on the *logical* text
//! (CRLF/LF/CR already normalised to `\n`). The Bridge layer is
//! responsible for converting UTF-16 selections received from the UI
//! into the byte offsets used here.

use super::{
    ByteOffset, CoreResult, DocumentSession, Revision, Selection, SourceRange, TextChange,
    TextPatch, TransactionId,
};

// ---------------------------------------------------------------------------
// Enums & structs
// ---------------------------------------------------------------------------

/// Identifies the origin of an edit for history grouping.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditOrigin {
    /// Direct user action (toolbar click, keyboard shortcut).
    User,
    /// IME / composition commit.
    Composition,
    /// Programmatic command dispatch.
    Command,
    /// Undo operation.
    Undo,
    /// Redo operation.
    Redo,
}

/// The kind of list to toggle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListKind {
    /// Unordered list with `-` markers.
    Unordered,
    /// Ordered list with `1.` markers.
    Ordered,
}

/// A semantic edit command carrying the user's selection or position.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditCommand {
    /// Toggle bold (`**`) on the selection.
    ToggleStrong { selection: Selection },
    /// Toggle italic (`*`) on the selection.
    ToggleEmphasis { selection: Selection },
    /// Toggle strikethrough (`~~`) on the selection.
    ToggleStrikethrough { selection: Selection },
    /// Toggle inline code (`` ` ``) on the selection.
    ToggleInlineCode { selection: Selection },
    /// Set heading level (1..=6) on the line at the selection anchor.
    /// Toggles to paragraph if the line is already at this level.
    SetHeading { selection: Selection, level: u8 },
    /// Toggle blockquote on the line(s) covered by the selection.
    ToggleBlockQuote { selection: Selection },
    /// Toggle list on the line(s) covered by the selection.
    ToggleList {
        selection: Selection,
        kind: ListKind,
    },
    /// Insert a code fence at the given byte position.
    InsertCodeFence {
        position: ByteOffset,
        language: Option<String>,
    },
    /// Replace the selection with a Markdown link.
    InsertLink {
        selection: Selection,
        href: String,
        title: Option<String>,
    },
    /// Insert a Markdown image at the given byte position.
    InsertImage {
        position: ByteOffset,
        reference: String,
        alt: Option<String>,
    },
}

/// A request to execute an edit command, sent from the UI/Toolbar layer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditCommandRequest {
    pub session_id: super::SessionId,
    pub transaction_id: TransactionId,
    pub base_revision: Revision,
    pub command: EditCommand,
}

/// The result of executing an edit command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandResult {
    pub session_id: super::SessionId,
    pub patch: TextPatch,
    pub selection_after: Selection,
    pub affected_ranges: Vec<SourceRange>,
}

// ---------------------------------------------------------------------------
// Marker constants
// ---------------------------------------------------------------------------

const BOLD: &str = "**";
const EMPHASIS: &str = "*";
const STRIKETHROUGH: &str = "~~";
const CODE: &str = "`";
const FENCE: &str = "```";

// ---------------------------------------------------------------------------
// Execution dispatch
// ---------------------------------------------------------------------------

impl EditCommand {
    /// Execute this command against the given session, producing a `TextPatch`.
    ///
    /// This is a **read-only** operation: it inspects the session to determine
    /// what transformation is needed and returns the patch. The caller is
    /// responsible for applying it via `session.apply_patch()`.
    pub fn execute(&self, session: &DocumentSession) -> CoreResult<TextPatch> {
        self.execute_with_transaction(session, TransactionId(0))
    }

    /// Execute this command using the caller-provided transaction id.
    pub fn execute_with_transaction(
        &self,
        session: &DocumentSession,
        transaction_id: TransactionId,
    ) -> CoreResult<TextPatch> {
        let tx = transaction_id;
        let rev = session.revision();

        match self {
            EditCommand::ToggleStrong { selection } => {
                toggle_inline(session, selection, BOLD, tx, rev)
            }
            EditCommand::ToggleEmphasis { selection } => {
                toggle_inline(session, selection, EMPHASIS, tx, rev)
            }
            EditCommand::ToggleStrikethrough { selection } => {
                toggle_inline(session, selection, STRIKETHROUGH, tx, rev)
            }
            EditCommand::ToggleInlineCode { selection } => {
                toggle_inline(session, selection, CODE, tx, rev)
            }
            EditCommand::SetHeading { selection, level } => {
                set_heading(session, selection, *level, tx, rev)
            }
            EditCommand::ToggleBlockQuote { selection } => {
                toggle_block_quote(session, selection, tx, rev)
            }
            EditCommand::ToggleList { selection, kind } => {
                toggle_list(session, selection, *kind, tx, rev)
            }
            EditCommand::InsertCodeFence { position, language } => {
                insert_code_fence(session, *position, language.as_deref(), tx, rev)
            }
            EditCommand::InsertLink {
                selection,
                href,
                title,
            } => insert_link(session, selection, href, title.as_deref(), tx, rev),
            EditCommand::InsertImage {
                position,
                reference,
                alt,
            } => insert_image(session, *position, reference, alt.as_deref(), tx, rev),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Normalise a selection so start ≤ end regardless of anchor/head direction.
fn normalise(sel: &Selection) -> (ByteOffset, ByteOffset) {
    if sel.anchor <= sel.head {
        (sel.anchor, sel.head)
    } else {
        (sel.head, sel.anchor)
    }
}

/// Find the byte range of the line containing `offset`.
fn line_range(text: &str, offset: usize) -> (usize, usize) {
    let line_start = text[..offset].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_end = text[offset..]
        .find('\n')
        .map(|i| offset + i)
        .unwrap_or(text.len());
    (line_start, line_end)
}

/// Find the combined range that spans from the line containing `start`
/// to the line containing `end`.
fn lines_range(text: &str, start: usize, end: usize) -> (usize, usize) {
    let l0 = line_range(text, start).0;
    let l1 = line_range(text, end).1;
    (l0, l1)
}

fn strip_ordered_list_marker(line: &str) -> Option<&str> {
    let marker_end = line
        .char_indices()
        .find_map(|(index, ch)| (!ch.is_ascii_digit()).then_some(index))?;
    if marker_end == 0 {
        return None;
    }

    let rest = &line[marker_end..];
    rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") "))
}

// ---------------------------------------------------------------------------
// Inline toggle
// ---------------------------------------------------------------------------

/// Toggle an inline formatting marker (`**`, `*`, `~~`, `` ` ``) on the
/// selected text.
fn toggle_inline(
    session: &DocumentSession,
    selection: &Selection,
    marker: &str,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    let (start, end) = normalise(selection);
    let mlen = marker.len();
    let logical = session.text().logical_text();

    if start == end {
        // No selection — insert marker pair with cursor between them.
        let replacement = format!("{marker}{marker}");
        let cursor_pos = ByteOffset(start.0 + mlen);
        return Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, start.0, start.0),
                replacement,
            }],
            selection_after: Some(Selection {
                anchor: cursor_pos,
                head: cursor_pos,
                revision: rev,
            }),
        });
    }

    let text = &logical[start.0..end.0];

    // Check whether the selection is already wrapped by the marker.
    let is_wrapped = start.0 >= mlen
        && end.0 + mlen <= logical.len()
        && logical.is_char_boundary(start.0 - mlen)
        && logical.is_char_boundary(end.0 + mlen)
        && &logical[start.0 - mlen..start.0] == marker
        && &logical[end.0..end.0 + mlen] == marker;

    if is_wrapped {
        // Unwrap: expand the range to include the markers, replace with just the inner text.
        let unwrapped_start = ByteOffset(start.0 - mlen);
        let unwrapped_end = ByteOffset(end.0 + mlen);
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, unwrapped_start.0, unwrapped_end.0),
                replacement: text.to_string(),
            }],
            selection_after: Some(Selection {
                anchor: unwrapped_start,
                head: ByteOffset(unwrapped_start.0 + text.len()),
                revision: rev,
            }),
        })
    } else {
        // Wrap the selection text with the marker.
        let replacement = format!("{marker}{text}{marker}");
        let new_end = ByteOffset(start.0 + replacement.len());
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, start.0, end.0),
                replacement,
            }],
            selection_after: Some(Selection {
                anchor: start,
                head: new_end,
                revision: rev,
            }),
        })
    }
}

// ---------------------------------------------------------------------------
// Block commands
// ---------------------------------------------------------------------------

/// Set or unset a heading on the line containing the selection anchor.
///
/// If the line is already a heading of the requested `level`, the heading
/// is removed (toggled off). If it is a heading of a different level, the
/// level is changed. Otherwise a new heading prefix is prepended.
fn set_heading(
    session: &DocumentSession,
    selection: &Selection,
    level: u8,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    if !(1..=6).contains(&level) {
        return Err(super::CoreError::InvalidRange);
    }

    let (anchor, _) = normalise(selection);
    let logical = session.text().logical_text();
    let (line_start, line_end) = line_range(logical, anchor.0);
    let content = &logical[line_start..line_end];

    // Count leading `#` characters.
    let hash_count = content.bytes().take_while(|b| *b == b'#').count();

    // Check for a valid heading: hashes followed by a space.
    let is_heading =
        hash_count > 0 && hash_count <= 6 && content.as_bytes().get(hash_count) == Some(&b' ');

    if is_heading {
        let current_level = hash_count as u8;
        if current_level == level {
            // Same level → toggle off: strip `#` prefix.
            let new_content = content[hash_count + 1..].to_string();
            let new_end = line_start + new_content.len();
            Ok(TextPatch {
                transaction_id: tx,
                base_revision: rev,
                changes: vec![TextChange {
                    range: SourceRange::new(rev, line_start, line_end),
                    replacement: new_content,
                }],
                selection_after: Some(Selection {
                    anchor: ByteOffset(line_start),
                    head: ByteOffset(new_end),
                    revision: rev,
                }),
            })
        } else {
            // Different level — replace prefix.
            let prefix = "#".repeat(level as usize);
            let new_line = format!("{} {}", prefix, &content[hash_count + 1..]);
            let new_end = line_start + new_line.len();
            Ok(TextPatch {
                transaction_id: tx,
                base_revision: rev,
                changes: vec![TextChange {
                    range: SourceRange::new(rev, line_start, line_end),
                    replacement: new_line,
                }],
                selection_after: Some(Selection {
                    anchor: ByteOffset(line_start),
                    head: ByteOffset(new_end),
                    revision: rev,
                }),
            })
        }
    } else {
        // Not a heading — prepend `#{level} `.
        let prefix = "#".repeat(level as usize);
        let new_line = format!("{} {}", prefix, content);
        let new_end = line_start + new_line.len();
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, line_start, line_end),
                replacement: new_line,
            }],
            selection_after: Some(Selection {
                anchor: ByteOffset(line_start),
                head: ByteOffset(new_end),
                revision: rev,
            }),
        })
    }
}

/// Toggle blockquote on the line(s) covered by the selection.
///
/// If all non-empty lines are quoted, unquote them. Otherwise quote them.
fn toggle_block_quote(
    session: &DocumentSession,
    selection: &Selection,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    let (start, end) = normalise(selection);
    let logical = session.text().logical_text();
    let (block_start, block_end) = lines_range(logical, start.0, end.0);
    let block_text = &logical[block_start..block_end];

    let lines: Vec<&str> = block_text.split('\n').collect();
    let all_quoted = lines
        .iter()
        .all(|l| l.starts_with("> ") || *l == ">" || l.is_empty());
    let has_content = lines.iter().any(|l| !l.is_empty());

    if all_quoted && has_content {
        // Unquote: strip leading `> ` or `>` from each line.
        let unquoted: Vec<String> = lines
            .iter()
            .map(|l| {
                if let Some(stripped) = l.strip_prefix("> ") {
                    stripped.to_string()
                } else if let Some(stripped) = l.strip_prefix('>') {
                    stripped.to_string()
                } else {
                    l.to_string()
                }
            })
            .collect();
        let replacement = unquoted.join("\n");
        let new_end = block_start + replacement.len();
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, block_start, block_end),
                replacement,
            }],
            selection_after: Some(Selection {
                anchor: ByteOffset(block_start),
                head: ByteOffset(new_end),
                revision: rev,
            }),
        })
    } else {
        // Quote: prepend `> ` to each non-empty line.
        let quoted: Vec<String> = lines
            .iter()
            .map(|l| {
                if l.is_empty() {
                    "> ".to_string()
                } else {
                    format!("> {}", l)
                }
            })
            .collect();
        let replacement = quoted.join("\n");
        let new_end = block_start + replacement.len();
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, block_start, block_end),
                replacement,
            }],
            selection_after: Some(Selection {
                anchor: ByteOffset(block_start),
                head: ByteOffset(new_end),
                revision: rev,
            }),
        })
    }
}

/// Toggle list on the line(s) covered by the selection.
///
/// If all lines start with a list marker, strip them (un-list).
/// Otherwise prepend the requested `kind` marker.
fn toggle_list(
    session: &DocumentSession,
    selection: &Selection,
    kind: ListKind,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    let (start, end) = normalise(selection);
    let logical = session.text().logical_text();
    let (block_start, block_end) = lines_range(logical, start.0, end.0);
    let block_text = &logical[block_start..block_end];

    let marker = match kind {
        ListKind::Unordered => "- ",
        ListKind::Ordered => "1. ",
    };

    let lines: Vec<&str> = block_text.split('\n').collect();
    let is_listed = lines.iter().all(|l| {
        l.is_empty()
            || l.starts_with("- ")
            || l.starts_with("* ")
            || l.starts_with("+ ")
            || strip_ordered_list_marker(l).is_some()
    });

    if is_listed {
        // Strip markers from all lines.
        let unlisted: Vec<String> = lines
            .iter()
            .map(|l| {
                if l.len() >= 2
                    && (l.starts_with("- ") || l.starts_with("* ") || l.starts_with("+ "))
                {
                    l[2..].to_string()
                } else if let Some(stripped) = strip_ordered_list_marker(l) {
                    stripped.to_string()
                } else {
                    l.to_string()
                }
            })
            .collect();
        let replacement = unlisted.join("\n");
        let new_end = block_start + replacement.len();
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, block_start, block_end),
                replacement,
            }],
            selection_after: Some(Selection {
                anchor: ByteOffset(block_start),
                head: ByteOffset(new_end),
                revision: rev,
            }),
        })
    } else {
        // Prepend marker to each line.
        let listed: Vec<String> = lines.iter().map(|l| format!("{}{}", marker, l)).collect();
        let replacement = listed.join("\n");
        let new_end = block_start + replacement.len();
        Ok(TextPatch {
            transaction_id: tx,
            base_revision: rev,
            changes: vec![TextChange {
                range: SourceRange::new(rev, block_start, block_end),
                replacement,
            }],
            selection_after: Some(Selection {
                anchor: ByteOffset(block_start),
                head: ByteOffset(new_end),
                revision: rev,
            }),
        })
    }
}

// ---------------------------------------------------------------------------
// Insertion commands
// ---------------------------------------------------------------------------

/// Insert a code fence at the given byte position.
fn insert_code_fence(
    _session: &DocumentSession,
    position: ByteOffset,
    language: Option<&str>,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    let lang = language.unwrap_or("");
    let fence_len = FENCE.len();
    let fence_text = if lang.is_empty() {
        format!("{fence}\n\n{fence}", fence = FENCE)
    } else {
        format!("{fence}{lang}\n\n{fence}", fence = FENCE)
    };

    // Place cursor on the blank line inside the fence.
    // position.0 + fence_len + lang.len() + 1  gives the byte offset
    // of the second `\n` (the blank line inside the fence).
    let cursor_pos = ByteOffset(position.0 + fence_len + lang.len() + 1);

    Ok(TextPatch {
        transaction_id: tx,
        base_revision: rev,
        changes: vec![TextChange {
            range: SourceRange::new(rev, position.0, position.0),
            replacement: fence_text,
        }],
        selection_after: Some(Selection {
            anchor: cursor_pos,
            head: cursor_pos,
            revision: rev,
        }),
    })
}

/// Replace the selection with a Markdown link.
fn insert_link(
    session: &DocumentSession,
    selection: &Selection,
    href: &str,
    title: Option<&str>,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    let (start, end) = normalise(selection);
    let text = if start == end {
        String::new()
    } else {
        session
            .text()
            .logical_text()
            .get(start.0..end.0)
            .unwrap_or("")
            .to_string()
    };

    let link_text = match title {
        Some(t) => format!("[{text}]({href} \"{t}\")"),
        None => format!("[{text}]({href})"),
    };

    let cursor_pos = ByteOffset(start.0 + link_text.len());

    Ok(TextPatch {
        transaction_id: tx,
        base_revision: rev,
        changes: vec![TextChange {
            range: SourceRange::new(rev, start.0, end.0),
            replacement: link_text,
        }],
        selection_after: Some(Selection {
            anchor: cursor_pos,
            head: cursor_pos,
            revision: rev,
        }),
    })
}

/// Insert a Markdown image at the given byte position.
fn insert_image(
    _session: &DocumentSession,
    position: ByteOffset,
    reference: &str,
    alt: Option<&str>,
    tx: TransactionId,
    rev: Revision,
) -> CoreResult<TextPatch> {
    let img_text = match alt {
        Some(a) => format!("![{a}]({reference})"),
        None => format!("![]({reference})"),
    };

    let cursor_pos = ByteOffset(position.0 + img_text.len());

    Ok(TextPatch {
        transaction_id: tx,
        base_revision: rev,
        changes: vec![TextChange {
            range: SourceRange::new(rev, position.0, position.0),
            replacement: img_text,
        }],
        selection_after: Some(Selection {
            anchor: cursor_pos,
            head: cursor_pos,
            revision: rev,
        }),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{
        types::{DocumentId, Revision, SessionId},
        ByteOffset, DocumentSession, Selection,
    };

    fn session(text: &str) -> DocumentSession {
        DocumentSession::open_bytes(SessionId(1), DocumentId(1), text.as_bytes()).unwrap()
    }

    fn sel(start: usize, end: usize) -> Selection {
        Selection {
            anchor: ByteOffset(start),
            head: ByteOffset(end),
            revision: Revision(0),
        }
    }

    fn apply(session: &mut DocumentSession, cmd: EditCommand) -> TextPatch {
        let patch = cmd.execute(session).unwrap();
        let outcome = session.apply_patch(patch.clone()).unwrap();
        assert_eq!(outcome.revision, session.revision());
        patch
    }

    // ── ToggleStrong ──────────────────────────────────────────────

    #[test]
    fn test_toggle_strong_wraps_selection() {
        let mut s = session("hello world");
        apply(
            &mut s,
            EditCommand::ToggleStrong {
                selection: sel(0, 5),
            },
        );
        assert_eq!(s.text().logical_text(), "**hello** world");
    }

    #[test]
    fn test_toggle_strong_unwraps() {
        let mut s = session("**hello** world");
        apply(
            &mut s,
            EditCommand::ToggleStrong {
                selection: sel(2, 7),
            },
        );
        assert_eq!(s.text().logical_text(), "hello world");
    }

    #[test]
    fn test_toggle_strong_empty_selection_inserts_paired_markers() {
        let mut s = session("hello world");
        apply(
            &mut s,
            EditCommand::ToggleStrong {
                selection: sel(6, 6),
            },
        );
        assert_eq!(s.text().logical_text(), "hello ****world");
    }

    // ── ToggleEmphasis ────────────────────────────────────────────

    #[test]
    fn test_toggle_emphasis_wraps() {
        let mut s = session("hello world");
        apply(
            &mut s,
            EditCommand::ToggleEmphasis {
                selection: sel(6, 11),
            },
        );
        assert_eq!(s.text().logical_text(), "hello *world*");
    }

    #[test]
    fn test_toggle_emphasis_unwraps() {
        let mut s = session("hello *world*");
        apply(
            &mut s,
            EditCommand::ToggleEmphasis {
                selection: sel(7, 12),
            },
        );
        assert_eq!(s.text().logical_text(), "hello world");
    }

    // ── ToggleStrikethrough ───────────────────────────────────────

    #[test]
    fn test_toggle_strikethrough_wraps() {
        let mut s = session("hello world");
        apply(
            &mut s,
            EditCommand::ToggleStrikethrough {
                selection: sel(0, 5),
            },
        );
        assert_eq!(s.text().logical_text(), "~~hello~~ world");
    }

    #[test]
    fn test_toggle_strikethrough_unwraps() {
        let mut s = session("~~hello~~ world");
        apply(
            &mut s,
            EditCommand::ToggleStrikethrough {
                selection: sel(2, 7),
            },
        );
        assert_eq!(s.text().logical_text(), "hello world");
    }

    // ── ToggleInlineCode ───────────────────────────────────────────

    #[test]
    fn test_toggle_inline_code_wraps() {
        let mut s = session("select this");
        apply(
            &mut s,
            EditCommand::ToggleInlineCode {
                selection: sel(0, 6),
            },
        );
        assert_eq!(s.text().logical_text(), "`select` this");
    }

    #[test]
    fn test_toggle_inline_code_unwraps() {
        let mut s = session("`select` this");
        apply(
            &mut s,
            EditCommand::ToggleInlineCode {
                selection: sel(1, 7),
            },
        );
        assert_eq!(s.text().logical_text(), "select this");
    }

    // ── SetHeading ────────────────────────────────────────────────

    #[test]
    fn test_set_heading_adds_prefix() {
        let mut s = session("Hello");
        apply(
            &mut s,
            EditCommand::SetHeading {
                selection: sel(0, 0),
                level: 1,
            },
        );
        assert_eq!(s.text().logical_text(), "# Hello");
    }

    #[test]
    fn test_set_heading_toggle_off_same_level() {
        let mut s = session("# Hello");
        apply(
            &mut s,
            EditCommand::SetHeading {
                selection: sel(2, 2),
                level: 1,
            },
        );
        assert_eq!(s.text().logical_text(), "Hello");
    }

    #[test]
    fn test_set_heading_changes_level() {
        let mut s = session("# Hello");
        apply(
            &mut s,
            EditCommand::SetHeading {
                selection: sel(2, 2),
                level: 2,
            },
        );
        assert_eq!(s.text().logical_text(), "## Hello");
    }

    #[test]
    fn test_set_heading_rejects_invalid_level() {
        let s = session("Hello");
        let result = EditCommand::SetHeading {
            selection: sel(0, 0),
            level: 7,
        }
        .execute(&s);
        assert!(result.is_err());
    }

    // ── ToggleBlockQuote ──────────────────────────────────────────

    #[test]
    fn test_toggle_block_quote_on_plain_line() {
        let mut s = session("Hello");
        apply(
            &mut s,
            EditCommand::ToggleBlockQuote {
                selection: sel(0, 5),
            },
        );
        assert_eq!(s.text().logical_text(), "> Hello");
    }

    #[test]
    fn test_toggle_block_quote_removes_from_quoted_line() {
        let mut s = session("> Hello");
        apply(
            &mut s,
            EditCommand::ToggleBlockQuote {
                selection: sel(2, 7),
            },
        );
        assert_eq!(s.text().logical_text(), "Hello");
    }

    #[test]
    fn test_toggle_block_quote_quotes_multiple_lines() {
        let mut s = session("line1\nline2");
        apply(
            &mut s,
            EditCommand::ToggleBlockQuote {
                selection: sel(0, 11),
            },
        );
        assert_eq!(s.text().logical_text(), "> line1\n> line2");
    }

    #[test]
    fn test_toggle_block_quote_unquotes_multiple_lines() {
        let mut s = session("> line1\n> line2");
        apply(
            &mut s,
            EditCommand::ToggleBlockQuote {
                selection: sel(3, 15),
            },
        );
        assert_eq!(s.text().logical_text(), "line1\nline2");
    }

    // ── ToggleList ────────────────────────────────────────────────

    #[test]
    fn test_toggle_unordered_list() {
        let mut s = session("Hello");
        apply(
            &mut s,
            EditCommand::ToggleList {
                selection: sel(0, 5),
                kind: ListKind::Unordered,
            },
        );
        assert_eq!(s.text().logical_text(), "- Hello");
    }

    #[test]
    fn test_toggle_unordered_list_removes() {
        let mut s = session("- Hello");
        apply(
            &mut s,
            EditCommand::ToggleList {
                selection: sel(2, 7),
                kind: ListKind::Unordered,
            },
        );
        assert_eq!(s.text().logical_text(), "Hello");
    }

    #[test]
    fn test_toggle_ordered_list() {
        let mut s = session("Hello");
        apply(
            &mut s,
            EditCommand::ToggleList {
                selection: sel(0, 5),
                kind: ListKind::Ordered,
            },
        );
        assert_eq!(s.text().logical_text(), "1. Hello");
    }

    #[test]
    fn test_toggle_ordered_list_removes() {
        let mut s = session("1. Hello");
        apply(
            &mut s,
            EditCommand::ToggleList {
                selection: sel(3, 8),
                kind: ListKind::Ordered,
            },
        );
        assert_eq!(s.text().logical_text(), "Hello");
    }

    #[test]
    fn test_toggle_ordered_list_removes_paren_multi_digit_marker() {
        let mut s = session("12) Hello");
        apply(
            &mut s,
            EditCommand::ToggleList {
                selection: sel(4, 9),
                kind: ListKind::Ordered,
            },
        );
        assert_eq!(s.text().logical_text(), "Hello");
    }

    // ── InsertCodeFence ───────────────────────────────────────────

    #[test]
    fn test_insert_code_fence_no_language() {
        let mut s = session("Hello");
        apply(
            &mut s,
            EditCommand::InsertCodeFence {
                position: ByteOffset(5),
                language: None,
            },
        );
        assert_eq!(s.text().logical_text(), "Hello```\n\n```");
    }

    #[test]
    fn test_insert_code_fence_with_language() {
        let mut s = session("Hello");
        apply(
            &mut s,
            EditCommand::InsertCodeFence {
                position: ByteOffset(0),
                language: Some("rust".to_string()),
            },
        );
        assert_eq!(s.text().logical_text(), "```rust\n\n```Hello");
    }

    // ── InsertLink ────────────────────────────────────────────────

    #[test]
    fn test_insert_link_replaces_selection() {
        let mut s = session("click here for more");
        apply(
            &mut s,
            EditCommand::InsertLink {
                selection: sel(0, 5),
                href: "https://example.com".to_string(),
                title: None,
            },
        );
        assert_eq!(
            s.text().logical_text(),
            "[click](https://example.com) here for more"
        );
    }

    #[test]
    fn test_insert_link_with_title() {
        let mut s = session("example");
        apply(
            &mut s,
            EditCommand::InsertLink {
                selection: sel(0, 7),
                href: "https://example.com".to_string(),
                title: Some("Example Site".to_string()),
            },
        );
        assert_eq!(
            s.text().logical_text(),
            "[example](https://example.com \"Example Site\")"
        );
    }

    // ── InsertImage ───────────────────────────────────────────────

    #[test]
    fn test_insert_image_with_alt() {
        let mut s = session("some text");
        apply(
            &mut s,
            EditCommand::InsertImage {
                position: ByteOffset(0),
                reference: "cat.png".to_string(),
                alt: Some("A cat".to_string()),
            },
        );
        assert_eq!(s.text().logical_text(), "![A cat](cat.png)some text");
    }

    #[test]
    fn test_insert_image_no_alt() {
        let mut s = session("text");
        apply(
            &mut s,
            EditCommand::InsertImage {
                position: ByteOffset(4),
                reference: "img.png".to_string(),
                alt: None,
            },
        );
        assert_eq!(s.text().logical_text(), "text![](img.png)");
    }

    // ── Cross-line multi-block behaviour ──────────────────────────

    #[test]
    fn test_toggle_list_mixed_wraps_all_lines() {
        let mut s = session("alpha\nbeta\ngamma");
        apply(
            &mut s,
            EditCommand::ToggleList {
                selection: sel(0, 16),
                kind: ListKind::Unordered,
            },
        );
        assert_eq!(s.text().logical_text(), "- alpha\n- beta\n- gamma");
    }

    #[test]
    fn test_toggle_block_quote_mixed_unquotes_only() {
        let mut s = session("> a\nb\n> c");
        apply(
            &mut s,
            EditCommand::ToggleBlockQuote {
                // select all three lines
                selection: sel(0, 9),
            },
        );
        // Since not all lines are quoted (`b`), this should quote everything
        assert_eq!(s.text().logical_text(), "> > a\n> b\n> > c");
    }
}
