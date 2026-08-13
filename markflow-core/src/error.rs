//! Stable Core error types and error-code taxonomy.
//!
//! The frontend must branch on the stable string code returned by [`CoreError::code`],
//! never on the English message (design 02 §8). Every code has at least one
//! triggering test; the mapping is recorded in the P1A validation report.

use std::fmt;

use crate::types::SourceByteOffset;

/// Why a source-byte position is invalid.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SourceOffsetError {
    /// Offset falls inside the UTF-8 BOM.
    InsideBom,
    /// Offset falls inside a CRLF boundary (on the `\n` byte of the pair).
    InsideCrlf,
    /// Offset is beyond the end of the source bytes.
    OutOfBounds,
    /// Offset lands on a non-character boundary of the logical UTF-8 text.
    InvalidUtf8Boundary,
}

/// Core error taxonomy. The set mirrors the bridge error-code requirements
/// from design 02 §8 (invalid encoding, invalid boundary, invalid EOL
/// provenance, stale revision, duplicate mismatch, external conflict, session
/// missing, I/O, internal invariant) plus the Core-specific range errors.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    /// Bytes are not valid UTF-8 (after stripping an optional BOM). The
    /// session is refused; bytes are never replacement-decoded and overwritten.
    UnsupportedEncoding,
    /// The patch/save references a revision that is not the current one.
    StaleRevision {
        expected: crate::types::Revision,
        actual: crate::types::Revision,
    },
    /// Save identity does not match the session's frozen file identity.
    ExternalConflict,
    /// A range is out of bounds or start > end.
    InvalidRange,
    /// Inserted logical text contains `\r`; logical text must be LF-only.
    InvalidLogicalLineEnding,
    /// `inserted_line_endings` count does not equal the number of `\n` in
    /// `inserted_logical_text`.
    InvalidEolProvenance { expected: usize, actual: usize },
    /// Changes in one atomic patch overlap.
    OverlappingChanges,
    /// A logical UTF-8 byte offset is not on a character boundary.
    InvalidUtf8Boundary,
    /// A UTF-16 offset falls inside a surrogate pair.
    InvalidUtf16Boundary,
    /// A source-byte offset is invalid; see [`SourceOffsetError`].
    InvalidSourceOffset {
        offset: SourceByteOffset,
        reason: SourceOffsetError,
    },
    /// Same transaction id replayed with a different payload.
    TransactionConflict,
    /// Operation attempted on a closed session.
    SessionClosed,
    /// Internal invariant violated (a programming error, not user input).
    InternalInvariant(&'static str),
    /// Filesystem/I/O error (surfaced for forward compatibility; Core itself
    /// performs no I/O in P1A).
    Io(String),
}

/// Result alias for Core operations.
pub type CoreResult<T> = Result<T, CoreError>;

impl CoreError {
    /// Stable, frontend-branchable error code.
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::UnsupportedEncoding => "invalid-encoding",
            CoreError::StaleRevision { .. } => "stale-revision",
            CoreError::ExternalConflict => "external-conflict",
            CoreError::InvalidRange => "invalid-range",
            CoreError::InvalidLogicalLineEnding => "invalid-logical-line-ending",
            CoreError::InvalidEolProvenance { .. } => "invalid-eol-provenance",
            CoreError::OverlappingChanges => "overlapping-changes",
            CoreError::InvalidUtf8Boundary
            | CoreError::InvalidUtf16Boundary
            | CoreError::InvalidSourceOffset { .. } => "invalid-boundary",
            CoreError::TransactionConflict => "duplicate-mismatch",
            CoreError::SessionClosed => "session-missing",
            CoreError::InternalInvariant(_) => "internal-invariant",
            CoreError::Io(_) => "io",
        }
    }
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::UnsupportedEncoding => write!(f, "invalid UTF-8 encoding"),
            CoreError::StaleRevision { expected, actual } => {
                write!(
                    f,
                    "stale revision: expected {expected:?}, actual {actual:?}"
                )
            }
            CoreError::ExternalConflict => write!(f, "file identity conflict"),
            CoreError::InvalidRange => write!(f, "invalid range"),
            CoreError::InvalidLogicalLineEnding => {
                write!(f, "logical text contains CR line ending")
            }
            CoreError::InvalidEolProvenance { expected, actual } => {
                write!(
                    f,
                    "EOL provenance count mismatch: expected {expected}, actual {actual}"
                )
            }
            CoreError::OverlappingChanges => write!(f, "overlapping changes in patch"),
            CoreError::InvalidUtf8Boundary => write!(f, "offset not on UTF-8 char boundary"),
            CoreError::InvalidUtf16Boundary => write!(f, "offset falls inside a surrogate pair"),
            CoreError::InvalidSourceOffset { offset, reason } => {
                write!(f, "invalid source offset {offset:?}: {reason:?}")
            }
            CoreError::TransactionConflict => {
                write!(f, "transaction id reused with a different payload")
            }
            CoreError::SessionClosed => write!(f, "session is closed"),
            CoreError::InternalInvariant(msg) => write!(f, "internal invariant: {msg}"),
            CoreError::Io(msg) => write!(f, "I/O error: {msg}"),
        }
    }
}

impl std::error::Error for CoreError {}

impl From<std::io::Error> for CoreError {
    fn from(value: std::io::Error) -> Self {
        CoreError::Io(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Revision;

    #[test]
    fn error_codes_are_stable_and_mapped() {
        let cases = [
            (CoreError::UnsupportedEncoding, "invalid-encoding"),
            (
                CoreError::StaleRevision {
                    expected: Revision(0),
                    actual: Revision(1),
                },
                "stale-revision",
            ),
            (CoreError::ExternalConflict, "external-conflict"),
            (CoreError::InvalidRange, "invalid-range"),
            (
                CoreError::InvalidLogicalLineEnding,
                "invalid-logical-line-ending",
            ),
            (
                CoreError::InvalidEolProvenance {
                    expected: 1,
                    actual: 0,
                },
                "invalid-eol-provenance",
            ),
            (CoreError::OverlappingChanges, "overlapping-changes"),
            (CoreError::InvalidUtf8Boundary, "invalid-boundary"),
            (CoreError::InvalidUtf16Boundary, "invalid-boundary"),
            (
                CoreError::InvalidSourceOffset {
                    offset: SourceByteOffset(0),
                    reason: SourceOffsetError::InsideBom,
                },
                "invalid-boundary",
            ),
            (CoreError::TransactionConflict, "duplicate-mismatch"),
            (CoreError::SessionClosed, "session-missing"),
            (CoreError::InternalInvariant("x"), "internal-invariant"),
            (CoreError::Io("x".into()), "io"),
        ];
        for (err, expected) in cases {
            assert_eq!(err.code(), expected, "mapping for {err:?}");
        }
    }
}
