pub mod error;
pub mod file_identity;
pub mod host;
pub mod registry;
pub mod save;
pub mod session;
pub mod source;

// Re-exports for convenience
pub use file_identity::{ContentFingerprint, FileIdentity};
pub use host::Host;
pub use registry::SessionRegistry;
pub use session::{DocumentCapabilities, DocumentRuntimeState, SessionHandle};
pub use source::{DocumentSource, DocumentSourceKind};
