use crate::error::{RuntimeError, RuntimeErrorCode};
use std::collections::{HashMap, HashSet};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Current Host/Bridge protocol version.
///
/// M8B requires every Host-side DTO to carry a protocol version so older
/// clients fail with a stable code instead of receiving best-effort behavior.
pub const HOST_PROTOCOL_VERSION: u32 = 1;

/// Host-side capabilities known to the Runtime protocol.
///
/// These names are intentionally broader than the current narrow filesystem
/// `Host` trait. M8B migrates concrete Tauri commands into these ports
/// incrementally while tests can already exercise the stable contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum HostCapability {
    FileSystem,
    Clipboard,
    Dialogs,
    Windows,
    Notifications,
    Shell,
    Network,
    Render,
    Export,
}

impl HostCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FileSystem => "file_system",
            Self::Clipboard => "clipboard",
            Self::Dialogs => "dialogs",
            Self::Windows => "windows",
            Self::Notifications => "notifications",
            Self::Shell => "shell",
            Self::Network => "network",
            Self::Render => "render",
            Self::Export => "export",
        }
    }

    /// Whether this capability can affect a specific document/session.
    pub fn requires_session(self) -> bool {
        matches!(
            self,
            Self::FileSystem | Self::Network | Self::Render | Self::Export
        )
    }

    /// Whether this capability is scoped to a concrete window/webview.
    pub fn requires_window(self) -> bool {
        matches!(
            self,
            Self::Clipboard
                | Self::Dialogs
                | Self::Windows
                | Self::Notifications
                | Self::Shell
                | Self::Export
        )
    }

    /// Whether result routing must include a confirmed revision.
    pub fn requires_revision(self) -> bool {
        matches!(self, Self::FileSystem | Self::Render | Self::Export)
    }
}

/// Stable Host error codes used by protocol tests and frontend mapping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "SCREAMING_SNAKE_CASE"))]
pub enum HostErrorCode {
    HostProtocolVersionUnsupported,
    HostMissingCapability,
    HostPermissionDenied,
    HostRequestMismatch,
    HostClientMismatch,
    HostWindowMismatch,
    HostSessionMismatch,
    HostStaleSession,
    HostStaleRevision,
    HostRequestCancelled,
    HostTimeout,
    HostWriteFailed,
    ExportCancelled,
    ExportStaleRevision,
    ExportUnsupportedFormat,
    ExportIrUnsupportedBlock,
    ExportHostPermissionDenied,
    ExportTimeout,
    ExportWriteFailed,
}

impl HostErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::HostProtocolVersionUnsupported => "HOST_PROTOCOL_VERSION_UNSUPPORTED",
            Self::HostMissingCapability => "HOST_MISSING_CAPABILITY",
            Self::HostPermissionDenied => "HOST_PERMISSION_DENIED",
            Self::HostRequestMismatch => "HOST_REQUEST_MISMATCH",
            Self::HostClientMismatch => "HOST_CLIENT_MISMATCH",
            Self::HostWindowMismatch => "HOST_WINDOW_MISMATCH",
            Self::HostSessionMismatch => "HOST_SESSION_MISMATCH",
            Self::HostStaleSession => "HOST_STALE_SESSION",
            Self::HostStaleRevision => "HOST_STALE_REVISION",
            Self::HostRequestCancelled => "HOST_REQUEST_CANCELLED",
            Self::HostTimeout => "HOST_TIMEOUT",
            Self::HostWriteFailed => "HOST_WRITE_FAILED",
            Self::ExportCancelled => "EXPORT_CANCELLED",
            Self::ExportStaleRevision => "EXPORT_STALE_REVISION",
            Self::ExportUnsupportedFormat => "EXPORT_UNSUPPORTED_FORMAT",
            Self::ExportIrUnsupportedBlock => "EXPORT_IR_UNSUPPORTED_BLOCK",
            Self::ExportHostPermissionDenied => "EXPORT_HOST_PERMISSION_DENIED",
            Self::ExportTimeout => "EXPORT_TIMEOUT",
            Self::ExportWriteFailed => "EXPORT_WRITE_FAILED",
        }
    }
}

impl std::fmt::Display for HostErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl From<HostErrorCode> for RuntimeError {
    fn from(code: HostErrorCode) -> Self {
        let runtime_code = match code {
            HostErrorCode::HostProtocolVersionUnsupported => {
                RuntimeErrorCode::ProtocolVersionUnsupported
            }
            HostErrorCode::HostRequestCancelled | HostErrorCode::ExportCancelled => {
                RuntimeErrorCode::Cancelled
            }
            HostErrorCode::HostStaleSession => RuntimeErrorCode::SessionNotFound,
            HostErrorCode::HostSessionMismatch
            | HostErrorCode::HostWindowMismatch
            | HostErrorCode::HostRequestMismatch
            | HostErrorCode::HostClientMismatch => RuntimeErrorCode::SessionMismatch,
            HostErrorCode::HostStaleRevision | HostErrorCode::ExportStaleRevision => {
                RuntimeErrorCode::RevisionMismatch
            }
            HostErrorCode::HostPermissionDenied
            | HostErrorCode::ExportHostPermissionDenied
            | HostErrorCode::HostMissingCapability
            | HostErrorCode::ExportUnsupportedFormat
            | HostErrorCode::ExportIrUnsupportedBlock
            | HostErrorCode::HostTimeout
            | HostErrorCode::ExportTimeout
            | HostErrorCode::HostWriteFailed
            | HostErrorCode::ExportWriteFailed => RuntimeErrorCode::Internal,
        };
        RuntimeError::new(runtime_code, code.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct HostRequestContext {
    pub protocol_version: u32,
    pub request_id: String,
    pub client_id: String,
    pub window_label: Option<String>,
    pub session_id: Option<u64>,
    pub document_id: Option<u64>,
    pub base_revision: Option<u64>,
    pub capability: HostCapability,
}

impl HostRequestContext {
    pub fn validate_protocol(&self) -> Result<(), HostErrorCode> {
        if self.protocol_version == HOST_PROTOCOL_VERSION {
            Ok(())
        } else {
            Err(HostErrorCode::HostProtocolVersionUnsupported)
        }
    }

    pub fn validate_required_scope(&self) -> Result<(), HostErrorCode> {
        self.validate_protocol()?;
        if self.capability.requires_session() && self.session_id.is_none() {
            return Err(HostErrorCode::HostSessionMismatch);
        }
        if self.capability.requires_window() && self.window_label.is_none() {
            return Err(HostErrorCode::HostWindowMismatch);
        }
        if self.capability.requires_revision() && self.base_revision.is_none() {
            return Err(HostErrorCode::HostStaleRevision);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum CapabilityStatus {
    Available,
    Missing,
    PermissionDenied,
    UserDenied,
    TemporarilyUnavailable,
    UnsupportedPlatform,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct HostCapabilities {
    pub protocol_version: u32,
    pub capabilities: Vec<(HostCapability, CapabilityStatus)>,
}

impl HostCapabilities {
    pub fn status(&self, capability: HostCapability) -> CapabilityStatus {
        self.capabilities
            .iter()
            .find_map(|(candidate, status)| (*candidate == capability).then_some(*status))
            .unwrap_or(CapabilityStatus::Missing)
    }
}

/// A deterministic non-Tauri Host harness for protocol tests.
///
/// It does not perform real side effects. Its purpose is to prove that Runtime
/// workflows can validate Host request routing without depending on Tauri
/// window state, current editor DOM, or active path globals.
#[derive(Debug, Clone)]
pub struct MockHostHarness {
    capability_status: HashMap<HostCapability, CapabilityStatus>,
    windows: HashSet<String>,
    sessions: HashMap<u64, u64>,
    cancelled_requests: HashSet<String>,
}

impl MockHostHarness {
    pub fn new(capabilities: impl IntoIterator<Item = HostCapability>) -> Self {
        Self {
            capability_status: capabilities
                .into_iter()
                .map(|capability| (capability, CapabilityStatus::Available))
                .collect(),
            windows: HashSet::new(),
            sessions: HashMap::new(),
            cancelled_requests: HashSet::new(),
        }
    }

    pub fn set_capability_status(&mut self, capability: HostCapability, status: CapabilityStatus) {
        self.capability_status.insert(capability, status);
    }

    pub fn register_window(&mut self, label: impl Into<String>) {
        self.windows.insert(label.into());
    }

    pub fn register_session(&mut self, session_id: u64) {
        self.register_session_revision(session_id, 0);
    }

    pub fn register_session_revision(&mut self, session_id: u64, revision: u64) {
        self.sessions.insert(session_id, revision);
    }

    pub fn cancel_request(&mut self, request_id: impl Into<String>) {
        self.cancelled_requests.insert(request_id.into());
    }

    pub fn capabilities(&self) -> HostCapabilities {
        let all = [
            HostCapability::FileSystem,
            HostCapability::Clipboard,
            HostCapability::Dialogs,
            HostCapability::Windows,
            HostCapability::Notifications,
            HostCapability::Shell,
            HostCapability::Network,
            HostCapability::Render,
            HostCapability::Export,
        ];
        HostCapabilities {
            protocol_version: HOST_PROTOCOL_VERSION,
            capabilities: all
                .into_iter()
                .map(|capability| {
                    let status = self
                        .capability_status
                        .get(&capability)
                        .copied()
                        .unwrap_or(CapabilityStatus::Missing);
                    (capability, status)
                })
                .collect(),
        }
    }

    pub fn validate(&self, context: &HostRequestContext) -> Result<(), HostErrorCode> {
        context.validate_required_scope()?;
        match self
            .capability_status
            .get(&context.capability)
            .copied()
            .unwrap_or(CapabilityStatus::Missing)
        {
            CapabilityStatus::Available => {}
            CapabilityStatus::PermissionDenied | CapabilityStatus::UserDenied => {
                return Err(match context.capability {
                    HostCapability::Export => HostErrorCode::ExportHostPermissionDenied,
                    _ => HostErrorCode::HostPermissionDenied,
                });
            }
            CapabilityStatus::Missing
            | CapabilityStatus::TemporarilyUnavailable
            | CapabilityStatus::UnsupportedPlatform => {
                return Err(HostErrorCode::HostMissingCapability)
            }
        }
        if self.cancelled_requests.contains(&context.request_id) {
            return Err(match context.capability {
                HostCapability::Export => HostErrorCode::ExportCancelled,
                _ => HostErrorCode::HostRequestCancelled,
            });
        }
        if let Some(window_label) = &context.window_label {
            if !self.windows.contains(window_label) {
                return Err(HostErrorCode::HostWindowMismatch);
            }
        }
        if let Some(session_id) = context.session_id {
            match self.sessions.get(&session_id) {
                Some(revision) => {
                    if context
                        .base_revision
                        .is_some_and(|base_revision| base_revision != *revision)
                    {
                        return Err(match context.capability {
                            HostCapability::Export => HostErrorCode::ExportStaleRevision,
                            _ => HostErrorCode::HostStaleRevision,
                        });
                    }
                }
                None => return Err(HostErrorCode::HostStaleSession),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(capability: HostCapability) -> HostRequestContext {
        HostRequestContext {
            protocol_version: HOST_PROTOCOL_VERSION,
            request_id: "req-1".into(),
            client_id: "client-a".into(),
            window_label: Some("main".into()),
            session_id: Some(42),
            document_id: Some(7),
            base_revision: Some(3),
            capability,
        }
    }

    #[test]
    fn host_contract_serializes_stable_error_codes() {
        let json = serde_json::to_string(&HostErrorCode::ExportStaleRevision).unwrap();
        assert_eq!(json, "\"EXPORT_STALE_REVISION\"");
        let roundtrip: HostErrorCode = serde_json::from_str(&json).unwrap();
        assert_eq!(roundtrip, HostErrorCode::ExportStaleRevision);
    }

    #[test]
    fn host_contract_exports_stable_failure_code_registry() {
        let codes = [
            HostErrorCode::ExportCancelled,
            HostErrorCode::ExportStaleRevision,
            HostErrorCode::ExportUnsupportedFormat,
            HostErrorCode::ExportHostPermissionDenied,
            HostErrorCode::ExportTimeout,
            HostErrorCode::ExportWriteFailed,
        ];

        let serialized: Vec<String> = codes
            .iter()
            .map(|code| serde_json::to_string(code).unwrap())
            .collect();

        assert_eq!(
            serialized,
            vec![
                "\"EXPORT_CANCELLED\"",
                "\"EXPORT_STALE_REVISION\"",
                "\"EXPORT_UNSUPPORTED_FORMAT\"",
                "\"EXPORT_HOST_PERMISSION_DENIED\"",
                "\"EXPORT_TIMEOUT\"",
                "\"EXPORT_WRITE_FAILED\"",
            ]
        );
    }

    #[test]
    fn host_contract_serializes_request_context_and_capabilities() {
        let request = context(HostCapability::Export);
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"protocol_version\":1"));
        assert!(json.contains("\"request_id\":\"req-1\""));
        assert!(json.contains("\"client_id\":\"client-a\""));
        assert!(json.contains("\"window_label\":\"main\""));
        assert!(json.contains("\"session_id\":42"));
        assert!(json.contains("\"document_id\":7"));
        assert!(json.contains("\"base_revision\":3"));
        assert!(json.contains("\"capability\":\"export\""));
        let roundtrip: HostRequestContext = serde_json::from_str(&json).unwrap();
        assert_eq!(roundtrip, request);

        let capabilities = HostCapabilities {
            protocol_version: HOST_PROTOCOL_VERSION,
            capabilities: vec![
                (HostCapability::FileSystem, CapabilityStatus::Available),
                (
                    HostCapability::Clipboard,
                    CapabilityStatus::PermissionDenied,
                ),
            ],
        };
        let json = serde_json::to_string(&capabilities).unwrap();
        assert!(json.contains("\"file_system\""));
        assert!(json.contains("\"permission_denied\""));
        let roundtrip: HostCapabilities = serde_json::from_str(&json).unwrap();
        assert_eq!(roundtrip, capabilities);
    }

    #[test]
    fn host_context_rejects_unsupported_protocol() {
        let mut request = context(HostCapability::FileSystem);
        request.protocol_version = HOST_PROTOCOL_VERSION + 1;
        assert_eq!(
            request.validate_required_scope(),
            Err(HostErrorCode::HostProtocolVersionUnsupported)
        );
    }

    #[test]
    fn host_context_enforces_required_session_window_and_revision() {
        let mut export = context(HostCapability::Export);
        export.session_id = None;
        assert_eq!(
            export.validate_required_scope(),
            Err(HostErrorCode::HostSessionMismatch)
        );

        let mut dialog = context(HostCapability::Dialogs);
        dialog.window_label = None;
        assert_eq!(
            dialog.validate_required_scope(),
            Err(HostErrorCode::HostWindowMismatch)
        );

        let mut render = context(HostCapability::Render);
        render.base_revision = None;
        assert_eq!(
            render.validate_required_scope(),
            Err(HostErrorCode::HostStaleRevision)
        );
    }

    #[test]
    fn mock_harness_reports_missing_capability() {
        let mut host = MockHostHarness::new([HostCapability::FileSystem]);
        host.register_window("main");
        host.register_session(42);

        assert_eq!(
            host.validate(&context(HostCapability::Export)),
            Err(HostErrorCode::HostMissingCapability)
        );
    }

    #[test]
    fn mock_harness_reports_window_mismatch_stale_session_and_cancellation() {
        let mut host = MockHostHarness::new([HostCapability::Export]);
        host.register_window("main");
        host.register_session_revision(42, 3);

        let mut wrong_window = context(HostCapability::Export);
        wrong_window.window_label = Some("secondary".into());
        assert_eq!(
            host.validate(&wrong_window),
            Err(HostErrorCode::HostWindowMismatch)
        );

        let mut stale_session = context(HostCapability::Export);
        stale_session.session_id = Some(99);
        assert_eq!(
            host.validate(&stale_session),
            Err(HostErrorCode::HostStaleSession)
        );

        host.cancel_request("req-1");
        assert_eq!(
            host.validate(&context(HostCapability::Export)),
            Err(HostErrorCode::ExportCancelled)
        );
    }

    #[test]
    fn mock_harness_reports_permission_denied_and_stale_revision() {
        let mut host = MockHostHarness::new([HostCapability::Clipboard, HostCapability::Export]);
        host.register_window("main");
        host.register_session_revision(42, 3);
        host.set_capability_status(
            HostCapability::Clipboard,
            CapabilityStatus::PermissionDenied,
        );
        host.set_capability_status(HostCapability::Export, CapabilityStatus::PermissionDenied);

        assert_eq!(
            host.validate(&context(HostCapability::Clipboard)),
            Err(HostErrorCode::HostPermissionDenied)
        );
        assert_eq!(
            host.validate(&context(HostCapability::Export)),
            Err(HostErrorCode::ExportHostPermissionDenied)
        );

        host.set_capability_status(HostCapability::Export, CapabilityStatus::Available);
        let mut stale_revision = context(HostCapability::Export);
        stale_revision.base_revision = Some(2);
        assert_eq!(
            host.validate(&stale_revision),
            Err(HostErrorCode::ExportStaleRevision)
        );
    }

    #[test]
    fn mock_harness_capability_matrix_is_explicit() {
        let host = MockHostHarness::new([HostCapability::FileSystem, HostCapability::Dialogs]);
        let matrix = host.capabilities();
        assert_eq!(matrix.protocol_version, HOST_PROTOCOL_VERSION);
        assert_eq!(
            matrix.status(HostCapability::FileSystem),
            CapabilityStatus::Available
        );
        assert_eq!(
            matrix.status(HostCapability::Export),
            CapabilityStatus::Missing
        );
    }
}
