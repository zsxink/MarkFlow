//! Original bytes snapshot captured at open (task 2.2).
//!
//! `OriginalSnapshot` records everything needed to replay the original bytes
//! losslessly and to make later saves never touch untouched regions:
//!
//! - the raw content hash and length (SHA-256 over the exact source bytes);
//! - UTF-8 BOM presence;
//! - the per-boundary EOL map (`line_endings`);
//! - the trailing line-break count (diagnostic/fast-assert only, NOT a
//!   compensating metadata like the old `trailingNewlines`);
//! - the frozen file identity.
//!
//! Design 01 §2 lists `trailing_line_breaks` explicitly as diagnostic only; the
//! real save result comes from `TextBuffer` + boundary provenance.

use serde::{Deserialize, Serialize};

use crate::identity::{ContentHash, FileIdentity};
use crate::line_ending::{LineEndingKind, LineEndingMap};
use crate::types::Revision;

/// UTF-8 BOM bytes.
pub const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

/// Whether the raw file starts with a UTF-8 BOM.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BomKind {
    None,
    Utf8,
}

impl BomKind {
    pub fn width(self) -> usize {
        match self {
            BomKind::None => 0,
            BomKind::Utf8 => UTF8_BOM.len(),
        }
    }
}

/// Concrete encoding of the source bytes (UTF-8, with or without BOM).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EncodingKind {
    Utf8,
    Utf8Bom,
}

/// Immutable snapshot of the original bytes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginalSnapshot {
    /// SHA-256 over the full source bytes (BOM included).
    pub content_hash: ContentHash,
    /// Source byte length (BOM included).
    pub byte_len: u64,
    pub bom: BomKind,
    pub encoding: EncodingKind,
    /// One EOL kind per logical `\n` boundary, in document order.
    pub line_endings: LineEndingMap,
    /// Trailing line-break boundary count. Diagnostic only — never used to
    /// compensate for lost newlines (design 01 §2).
    pub trailing_line_breaks: u32,
    /// Frozen file identity captured at open.
    pub file_identity: FileIdentity,
    /// Resolved document-dominant EOL (frozen at open via `default_eol`).
    pub(crate) dominant_line_ending: LineEndingKind,
}

impl OriginalSnapshot {
    /// Build a snapshot from raw bytes. The optional frozen `default_eol` is
    /// used only to break ties / when the file has no newlines (design 01 §3.6,
    /// §3.7).
    pub fn from_bytes(bytes: &[u8], default_eol: LineEndingKind) -> crate::error::CoreResult<Self> {
        let (bom, content) = if bytes.starts_with(UTF8_BOM) {
            (BomKind::Utf8, &bytes[UTF8_BOM.len()..])
        } else {
            (BomKind::None, bytes)
        };

        let text = std::str::from_utf8(content)
            .map_err(|_| crate::error::CoreError::UnsupportedEncoding)?;

        // Per-boundary scan must not decode the whole text twice for large
        // files; decode once here.
        let (_, line_endings) = scan_line_endings(text);
        let line_endings = LineEndingMap::from_kinds(line_endings);
        let trailing = count_trailing_newlines(text);
        let dominant = dominant_line_ending(line_endings.kinds(), default_eol);

        Ok(Self {
            content_hash: ContentHash::of(bytes),
            byte_len: bytes.len() as u64,
            bom,
            encoding: match bom {
                BomKind::None => EncodingKind::Utf8,
                BomKind::Utf8 => EncodingKind::Utf8Bom,
            },
            line_endings,
            trailing_line_breaks: trailing,
            file_identity: FileIdentity::from_bytes(bytes),
            dominant_line_ending: dominant,
        })
    }

    /// Build a snapshot carrying a caller-provided file identity (real disk
    /// open path in P1B).
    pub fn from_bytes_with_identity(
        bytes: &[u8],
        default_eol: LineEndingKind,
        file_identity: FileIdentity,
    ) -> crate::error::CoreResult<Self> {
        let mut snapshot = Self::from_bytes(bytes, default_eol)?;
        snapshot.file_identity = file_identity;
        Ok(snapshot)
    }

    /// The frozen document-dominant EOL resolved at open.
    pub fn dominant_line_ending(&self) -> LineEndingKind {
        self.dominant_line_ending
    }

    pub fn revision_0() -> Revision {
        Revision(0)
    }
}

/// Normalize source text into logical LF text plus the per-boundary EOL kinds.
/// Returns the logical text (as a `String`) and the boundary kinds.
pub(crate) fn scan_line_endings(text: &str) -> (String, Vec<LineEndingKind>) {
    let bytes = text.as_bytes();
    let mut logical = String::with_capacity(text.len());
    let mut endings = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                logical.push('\n');
                endings.push(LineEndingKind::Crlf);
                i += 2;
            }
            b'\r' => {
                logical.push('\n');
                endings.push(LineEndingKind::Cr);
                i += 1;
            }
            b'\n' => {
                logical.push('\n');
                endings.push(LineEndingKind::Lf);
                i += 1;
            }
            _ => {
                // `text` is already validated UTF-8 by the caller.
                let ch = text[i..].chars().next().expect("valid UTF-8 char");
                logical.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    (logical, endings)
}

fn count_trailing_newlines(text: &str) -> u32 {
    let bytes = text.as_bytes();
    let mut count = 0;
    let mut i = bytes.len();
    while i > 0 {
        if bytes[i - 1] == b'\n' {
            count += 1;
            i -= 1;
            if i > 0 && bytes[i - 1] == b'\r' {
                i -= 1;
            }
        } else if bytes[i - 1] == b'\r' {
            count += 1;
            i -= 1;
        } else {
            break;
        }
    }
    count
}

/// Resolve the document-dominant EOL from the original boundary counts. On a
/// tie, or when the file has no newlines, use the frozen `default_eol`
/// (design 01 §3.6, §3.7).
fn dominant_line_ending(endings: &[LineEndingKind], default_eol: LineEndingKind) -> LineEndingKind {
    let mut lf = 0usize;
    let mut crlf = 0usize;
    let mut cr = 0usize;
    for kind in endings {
        match kind {
            LineEndingKind::Lf => lf += 1,
            LineEndingKind::Crlf => crlf += 1,
            LineEndingKind::Cr => cr += 1,
        }
    }
    if lf == 0 && crlf == 0 && cr == 0 {
        return default_eol;
    }
    let max = lf.max(crlf).max(cr);
    let lf_wins = lf == max && lf > 0;
    let crlf_wins = crlf == max && crlf > 0;
    let cr_wins = cr == max && cr > 0;
    let unique_count = [lf_wins, crlf_wins, cr_wins].iter().filter(|b| **b).count();
    if unique_count != 1 {
        return default_eol;
    }
    if lf_wins {
        LineEndingKind::Lf
    } else if crlf_wins {
        LineEndingKind::Crlf
    } else {
        LineEndingKind::Cr
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_of_empty_and_bom_only() {
        let s = OriginalSnapshot::from_bytes(b"", LineEndingKind::Lf).unwrap();
        assert_eq!(s.byte_len, 0);
        assert_eq!(s.bom, BomKind::None);
        assert_eq!(s.line_endings.len(), 0);
        assert_eq!(s.trailing_line_breaks, 0);
        assert_eq!(s.dominant_line_ending(), LineEndingKind::Lf);

        let s = OriginalSnapshot::from_bytes(UTF8_BOM, LineEndingKind::Lf).unwrap();
        assert_eq!(s.byte_len, 3);
        assert_eq!(s.bom, BomKind::Utf8);
        assert_eq!(s.encoding, EncodingKind::Utf8Bom);
        assert_eq!(s.line_endings.len(), 0);
    }

    #[test]
    fn dominant_resolves_tie_via_default() {
        // Mixed file: 1 LF, 1 CRLF, 1 CR → tie → default.
        let bytes = b"a\nb\r\nc\rd";
        let s = OriginalSnapshot::from_bytes(bytes, LineEndingKind::Crlf).unwrap();
        assert_eq!(s.dominant_line_ending(), LineEndingKind::Crlf);
        assert_eq!(s.trailing_line_breaks, 0);
        assert_eq!(s.line_endings.len(), 3);
    }

    #[test]
    fn dominant_unique_type_wins() {
        let bytes = b"a\nb\nc\nd\n";
        let s = OriginalSnapshot::from_bytes(bytes, LineEndingKind::Crlf).unwrap();
        assert_eq!(s.dominant_line_ending(), LineEndingKind::Lf);
        assert_eq!(s.trailing_line_breaks, 1);
    }

    #[test]
    fn trailing_counts() {
        let s = OriginalSnapshot::from_bytes(b"a\r\n\r\n\r\n", LineEndingKind::Lf).unwrap();
        assert_eq!(s.trailing_line_breaks, 3);
        assert_eq!(s.line_endings.len(), 3);
    }
}
