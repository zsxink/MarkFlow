//! EOL kinds, patch newline provenance, and the per-boundary line-ending map.

use serde::{Deserialize, Serialize};

/// A concrete line-ending kind. Every logical `\n` boundary maps to exactly one
/// of these. There is deliberately no `Mixed` variant: a per-boundary kind is
/// always concrete, and document-dominant ties resolve to the frozen default
/// (design 01 §3.6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum LineEndingKind {
    #[serde(rename = "lf")]
    Lf,
    #[serde(rename = "crlf")]
    Crlf,
    #[serde(rename = "cr")]
    Cr,
}

impl LineEndingKind {
    /// The source byte representation of this EOL.
    pub fn as_bytes(self) -> &'static [u8] {
        match self {
            LineEndingKind::Lf => b"\n",
            LineEndingKind::Crlf => b"\r\n",
            LineEndingKind::Cr => b"\r",
        }
    }

    /// Width in source bytes.
    pub fn width(self) -> usize {
        self.as_bytes().len()
    }
}

/// Provenance carried by each `\n` inside `inserted_logical_text`.
///
/// - `Inherit`: resolve via the fixed order (design 01 §3.4): same-ordinal
///   replaced boundary → right surviving neighbor → left surviving neighbor →
///   document-dominant EOL → frozen default EOL.
/// - `Explicit*`: paste/drop read the raw payload before CodeMirror
///   normalization and annotate each original CRLF/CR/LF explicitly.
///
/// `inserted_line_endings.len()` must equal the number of `\n` in the inserted
/// logical text; a mismatch is rejected atomically.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NewlineEnding {
    Inherit,
    #[serde(rename = "lf")]
    ExplicitLf,
    #[serde(rename = "crlf")]
    ExplicitCrlf,
    #[serde(rename = "cr")]
    ExplicitCr,
}

impl NewlineEnding {
    /// If this provenance is explicit, return the concrete kind.
    pub fn explicit_kind(self) -> Option<LineEndingKind> {
        match self {
            NewlineEnding::Inherit => None,
            NewlineEnding::ExplicitLf => Some(LineEndingKind::Lf),
            NewlineEnding::ExplicitCrlf => Some(LineEndingKind::Crlf),
            NewlineEnding::ExplicitCr => Some(LineEndingKind::Cr),
        }
    }
}

/// Per-boundary line-ending map over the logical LF text.
///
/// `kinds[i]` is the EOL kind of the i-th logical `\n` (in document order).
/// A Vec-backed map gives O(1) `kind_at`, which keeps `to_source_bytes`
/// linear even for files whose EOLs alternate on every line (a run-length
/// encoding would degrade to O(n²) there).
///
/// Serializes as a JSON array of kinds (`["lf","crlf",...]`).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LineEndingMap {
    kinds: Vec<LineEndingKind>,
}

impl LineEndingMap {
    /// An empty map (no logical newlines).
    pub fn empty() -> Self {
        Self { kinds: Vec::new() }
    }

    pub fn from_kinds(kinds: Vec<LineEndingKind>) -> Self {
        Self { kinds }
    }

    pub fn len(&self) -> usize {
        self.kinds.len()
    }

    pub fn is_empty(&self) -> bool {
        self.kinds.is_empty()
    }

    /// Kind of the boundary at `boundary_index`, if any.
    pub fn kind_at(&self, boundary_index: usize) -> Option<LineEndingKind> {
        self.kinds.get(boundary_index).copied()
    }

    /// All kinds, in document order.
    pub fn kinds(&self) -> &[LineEndingKind] {
        &self.kinds
    }

    /// Replace boundaries `[start_boundary, end_boundary)` with `replacement`.
    pub fn replace_range(
        &self,
        start_boundary: usize,
        end_boundary: usize,
        replacement: &[LineEndingKind],
    ) -> Self {
        let mut out = Vec::with_capacity(
            self.kinds
                .len()
                .saturating_sub(end_boundary - start_boundary)
                + replacement.len(),
        );
        out.extend_from_slice(&self.kinds[..start_boundary]);
        out.extend_from_slice(replacement);
        out.extend_from_slice(&self.kinds[end_boundary..]);
        Self { kinds: out }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_at_and_replace() {
        let map = LineEndingMap::from_kinds(vec![
            LineEndingKind::Lf,
            LineEndingKind::Crlf,
            LineEndingKind::Cr,
        ]);
        assert_eq!(map.len(), 3);
        assert_eq!(map.kind_at(0), Some(LineEndingKind::Lf));
        assert_eq!(map.kind_at(2), Some(LineEndingKind::Cr));
        assert_eq!(map.kind_at(3), None);

        let replaced = map.replace_range(1, 2, &[LineEndingKind::Lf, LineEndingKind::Lf]);
        assert_eq!(
            replaced.kinds(),
            &[
                LineEndingKind::Lf,
                LineEndingKind::Lf,
                LineEndingKind::Lf,
                LineEndingKind::Cr,
            ]
        );
    }

    #[test]
    fn serde_provenance() {
        assert_eq!(
            serde_json::to_string(&NewlineEnding::ExplicitCrlf).unwrap(),
            "\"crlf\""
        );
        assert_eq!(
            serde_json::to_string(&NewlineEnding::Inherit).unwrap(),
            "\"inherit\""
        );
        let back: NewlineEnding = serde_json::from_str("\"cr\"").unwrap();
        assert_eq!(back, NewlineEnding::ExplicitCr);
    }

    #[test]
    fn eol_widths() {
        assert_eq!(LineEndingKind::Lf.width(), 1);
        assert_eq!(LineEndingKind::Crlf.width(), 2);
        assert_eq!(LineEndingKind::Cr.width(), 1);
    }
}
