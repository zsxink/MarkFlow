use thiserror::Error;

/// Stable runtime error codes for the Bridge protocol.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RuntimeErrorCode {
    RevisionMismatch,
    InvalidRange,
    InvalidUtf16Boundary,
    TransactionConflict,
    UnsupportedEncoding,
    PendingQueueFull,
    SaveFlushTimeout,
    Conflict,
    Cancelled,
    SessionNotFound,
    ProtocolVersionUnsupported,
    Internal,
}

impl RuntimeErrorCode {
    /// Human-readable static description for logging.
    pub fn as_str(&self) -> &'static str {
        match self {
            RuntimeErrorCode::RevisionMismatch => "REVISION_MISMATCH",
            RuntimeErrorCode::InvalidRange => "INVALID_RANGE",
            RuntimeErrorCode::InvalidUtf16Boundary => "INVALID_UTF16_BOUNDARY",
            RuntimeErrorCode::TransactionConflict => "TRANSACTION_CONFLICT",
            RuntimeErrorCode::UnsupportedEncoding => "UNSUPPORTED_ENCODING",
            RuntimeErrorCode::PendingQueueFull => "PENDING_QUEUE_FULL",
            RuntimeErrorCode::SaveFlushTimeout => "SAVE_FLUSH_TIMEOUT",
            RuntimeErrorCode::Conflict => "CONFLICT",
            RuntimeErrorCode::Cancelled => "CANCELLED",
            RuntimeErrorCode::SessionNotFound => "SESSION_NOT_FOUND",
            RuntimeErrorCode::ProtocolVersionUnsupported => "PROTOCOL_VERSION_UNSUPPORTED",
            RuntimeErrorCode::Internal => "INTERNAL",
        }
    }
}

impl std::fmt::Display for RuntimeErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Runtime error with a stable error code and optional detail.
#[derive(Debug, Clone, Error)]
pub struct RuntimeError {
    pub code: RuntimeErrorCode,
    pub detail: String,
}

impl RuntimeError {
    pub fn new(code: RuntimeErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn session_not_found() -> Self {
        Self::new(RuntimeErrorCode::SessionNotFound, "Session not found")
    }

    pub fn conflict(detail: impl Into<String>) -> Self {
        Self::new(RuntimeErrorCode::Conflict, detail)
    }

    pub fn revision_mismatch(detail: impl Into<String>) -> Self {
        Self::new(RuntimeErrorCode::RevisionMismatch, detail)
    }

    pub fn internal(detail: impl Into<String>) -> Self {
        Self::new(RuntimeErrorCode::Internal, detail)
    }

    pub fn cancelled() -> Self {
        Self::new(RuntimeErrorCode::Cancelled, "Operation cancelled")
    }
}

impl std::fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.detail)
    }
}

/// Map core errors to runtime error codes.
impl From<markflow_core::CoreError> for RuntimeError {
    fn from(e: markflow_core::CoreError) -> Self {
        match e {
            markflow_core::CoreError::StaleRevision { .. } => {
                RuntimeError::revision_mismatch("Stale revision")
            }
            markflow_core::CoreError::InvalidRange => {
                RuntimeError::new(RuntimeErrorCode::InvalidRange, "Invalid document range")
            }
            markflow_core::CoreError::InvalidUtf16Boundary => RuntimeError::new(
                RuntimeErrorCode::InvalidUtf16Boundary,
                "Invalid UTF-16 boundary",
            ),
            markflow_core::CoreError::TransactionConflict => RuntimeError::new(
                RuntimeErrorCode::TransactionConflict,
                "Transaction conflict",
            ),
            markflow_core::CoreError::UnsupportedEncoding => RuntimeError::new(
                RuntimeErrorCode::UnsupportedEncoding,
                "Unsupported encoding",
            ),
            markflow_core::CoreError::InvalidUtf8Boundary
            | markflow_core::CoreError::InvalidSourceOffset { .. }
            | markflow_core::CoreError::InvalidLogicalLineEnding
            | markflow_core::CoreError::OverlappingChanges
            | markflow_core::CoreError::Io(_) => {
                RuntimeError::internal(format!("Core error: {:?}", e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_code_as_str_returns_correct_strings() {
        let cases = [
            (RuntimeErrorCode::RevisionMismatch, "REVISION_MISMATCH"),
            (RuntimeErrorCode::InvalidRange, "INVALID_RANGE"),
            (
                RuntimeErrorCode::InvalidUtf16Boundary,
                "INVALID_UTF16_BOUNDARY",
            ),
            (
                RuntimeErrorCode::TransactionConflict,
                "TRANSACTION_CONFLICT",
            ),
            (
                RuntimeErrorCode::UnsupportedEncoding,
                "UNSUPPORTED_ENCODING",
            ),
            (RuntimeErrorCode::PendingQueueFull, "PENDING_QUEUE_FULL"),
            (RuntimeErrorCode::SaveFlushTimeout, "SAVE_FLUSH_TIMEOUT"),
            (RuntimeErrorCode::Conflict, "CONFLICT"),
            (RuntimeErrorCode::Cancelled, "CANCELLED"),
            (RuntimeErrorCode::SessionNotFound, "SESSION_NOT_FOUND"),
            (
                RuntimeErrorCode::ProtocolVersionUnsupported,
                "PROTOCOL_VERSION_UNSUPPORTED",
            ),
            (RuntimeErrorCode::Internal, "INTERNAL"),
        ];
        for (code, expected) in &cases {
            assert_eq!(code.as_str(), *expected, "Mismatch for {:?}", code);
        }
    }

    #[test]
    fn runtime_error_display_shows_code_and_detail() {
        let err = RuntimeError::new(RuntimeErrorCode::Conflict, "test");
        assert_eq!(format!("{}", err), "[CONFLICT] test");
    }

    #[test]
    fn runtime_error_from_core_error_maps_correctly() {
        use markflow_core::CoreError;

        // Explicit mapping
        let e: RuntimeError = CoreError::StaleRevision {
            expected: markflow_core::Revision(1),
            actual: markflow_core::Revision(2),
        }
        .into();
        assert_eq!(e.code, RuntimeErrorCode::RevisionMismatch);

        let e: RuntimeError = CoreError::InvalidRange.into();
        assert_eq!(e.code, RuntimeErrorCode::InvalidRange);

        let e: RuntimeError = CoreError::InvalidUtf16Boundary.into();
        assert_eq!(e.code, RuntimeErrorCode::InvalidUtf16Boundary);

        let e: RuntimeError = CoreError::TransactionConflict.into();
        assert_eq!(e.code, RuntimeErrorCode::TransactionConflict);

        let e: RuntimeError = CoreError::UnsupportedEncoding.into();
        assert_eq!(e.code, RuntimeErrorCode::UnsupportedEncoding);

        // Mapped to Internal
        let e: RuntimeError = CoreError::InvalidUtf8Boundary.into();
        assert_eq!(e.code, RuntimeErrorCode::Internal);

        let e: RuntimeError = CoreError::InvalidSourceOffset {
            offset: markflow_core::SourceByteOffset(5),
            reason: markflow_core::SourceOffsetError::OutOfBounds,
        }
        .into();
        assert_eq!(e.code, RuntimeErrorCode::Internal);
    }
}
