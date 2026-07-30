pub mod error;
pub mod file_identity;
pub mod host;
pub mod host_contract;
pub mod registry;
pub mod save;
pub mod save_coordinator;
pub mod session;
pub mod source;

// Re-exports for convenience
pub use file_identity::{ContentFingerprint, FileIdentity};
pub use host::Host;
pub use host_contract::{
    CapabilityStatus, HostCapabilities, HostCapability, HostErrorCode, HostRequestContext,
    HOST_PROTOCOL_VERSION,
};
pub use registry::SessionRegistry;
pub use session::{DocumentCapabilities, DocumentRuntimeState, SaveLease, SessionHandle};
pub use source::{DocumentSource, DocumentSourceKind};
