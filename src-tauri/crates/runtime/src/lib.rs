pub mod document_service;
pub mod error;
pub mod file_identity;
pub mod host;
pub mod registry;
pub mod save;
pub mod save_coordinator;
pub mod session;
pub mod source;

// Re-exports for convenience
pub use file_identity::{ContentFingerprint, FileIdentity};
pub use host::Host;
pub use registry::SessionRegistry;
pub use session::{DocumentCapabilities, DocumentRuntimeState, SaveLease, SessionHandle};
pub use source::{DocumentSource, DocumentSourceKind};
