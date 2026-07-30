mod common;

use common::{make_identity, MockHost};
use markflow_core::{
    DiagnosticKind, DiagnosticsRequest, DocumentId, DocumentSession, ExportBlockKind,
    ExportOptions, ExportRequest, Revision, SearchOptions, SearchPage, SearchRequest, SessionId,
};
use markflow_runtime::file_identity::FileIdentity;
use markflow_runtime::host_contract::{
    HostCapability, HostRequestContext, MockHostHarness, HOST_PROTOCOL_VERSION,
};
use markflow_runtime::registry::{with_session_state, SessionRegistry};
use markflow_runtime::save::save_document;
use markflow_runtime::session::ClientId;
use markflow_runtime::source::DocumentSource;
use std::path::PathBuf;

fn open_session(session_id: SessionId, document_id: DocumentId, bytes: &[u8]) -> DocumentSession {
    DocumentSession::open_bytes(session_id, document_id, bytes).expect("open session")
}

fn create_harness_session(
    registry: &SessionRegistry,
    path: &str,
    bytes: &'static [u8],
) -> SessionId {
    registry
        .create(
            ClientId("non-tauri-client".into()),
            "main".into(),
            DocumentSource::new_file(PathBuf::from(path)),
            FileIdentity::empty(),
            |sid, did| Ok(open_session(sid, did, bytes)),
        )
        .expect("create runtime session")
}

fn create_harness_session_with_identity(
    registry: &SessionRegistry,
    path: &str,
    bytes: &'static [u8],
    identity: FileIdentity,
) -> SessionId {
    registry
        .create(
            ClientId("non-tauri-client".into()),
            "main".into(),
            DocumentSource::new_file(PathBuf::from(path)),
            identity,
            |sid, did| Ok(open_session(sid, did, bytes)),
        )
        .expect("create runtime session")
}

fn export_context(
    session_id: SessionId,
    document_id: DocumentId,
    revision: Revision,
    request_id: &str,
) -> HostRequestContext {
    HostRequestContext {
        protocol_version: HOST_PROTOCOL_VERSION,
        request_id: request_id.into(),
        client_id: "non-tauri-client".into(),
        window_label: Some("main".into()),
        session_id: Some(session_id.0),
        document_id: Some(document_id.0),
        base_revision: Some(revision.0),
        capability: HostCapability::Export,
    }
}

fn render_html_from_export_ir(blocks: &[markflow_core::ExportBlock]) -> String {
    let mut html = String::new();
    for block in blocks {
        match &block.kind {
            ExportBlockKind::Heading { level, title } => {
                html.push_str(&format!("<h{level}>{}</h{level}>\n", html_escape(title)));
            }
            ExportBlockKind::Paragraph => {
                html.push_str(&format!("<p>{}</p>\n", html_escape(block.source.trim())));
            }
            ExportBlockKind::Image { alt, target, .. } => {
                html.push_str(&format!(
                    "<img src=\"{}\" alt=\"{}\">\n",
                    html_escape(target),
                    html_escape(alt)
                ));
            }
            _ => {
                html.push_str(&format!("<pre>{}</pre>\n", html_escape(&block.source)));
            }
        }
    }
    html
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[test]
fn non_tauri_harness_inspects_markdown_through_runtime_session() {
    let registry = SessionRegistry::new();
    let session_id = create_harness_session(&registry, "/tmp/inspect.md", b"# Title\n\nbody\n");

    let inspected = with_session_state(&registry, session_id, |state| {
        Ok((
            state.core.id,
            state.core.document_id,
            state.core.revision(),
            state.core.text().logical_text().to_string(),
        ))
    })
    .expect("inspect session");

    assert_eq!(inspected.0, session_id);
    assert_eq!(inspected.2, Revision(0));
    assert_eq!(inspected.3, "# Title\n\nbody\n");
}

#[test]
fn non_tauri_harness_searches_using_runtime_session_revision() {
    let registry = SessionRegistry::new();
    let session_id = create_harness_session(&registry, "/tmp/search.md", b"alpha beta alpha\n");

    let result = with_session_state(&registry, session_id, |state| {
        state
            .core
            .search(SearchRequest {
                session_id,
                revision: state.core.revision(),
                query_id: "search-1".into(),
                query: "alpha".into(),
                options: SearchOptions {
                    case_sensitive: false,
                    whole_word: false,
                },
                page: SearchPage::default(),
            })
            .map_err(markflow_runtime::error::RuntimeError::from)
    })
    .expect("search session");

    assert_eq!(result.session_id, session_id);
    assert_eq!(result.revision, Revision(0));
    assert_eq!(result.query_id, "search-1");
    assert_eq!(result.matches.len(), 2);
}

#[test]
fn non_tauri_harness_reports_diagnostics_using_runtime_session_revision() {
    let registry = SessionRegistry::new();
    let session_id = create_harness_session(
        &registry,
        "/tmp/diagnostics.md",
        b"# Same\n\n# Same\n\n[bad](javascript:alert(1))\n",
    );

    let report = with_session_state(&registry, session_id, |state| {
        state
            .core
            .diagnostics(DiagnosticsRequest {
                session_id,
                revision: state.core.revision(),
                request_id: "diag-1".into(),
                viewport: None,
                missing_assets: vec![],
                diagram_errors: vec![],
            })
            .map_err(markflow_runtime::error::RuntimeError::from)
    })
    .expect("diagnostics session");

    assert_eq!(report.session_id, session_id);
    assert_eq!(report.revision, Revision(0));
    assert!(report
        .diagnostics
        .iter()
        .any(|diagnostic| matches!(diagnostic.kind, DiagnosticKind::DuplicateHeading { .. })));
    assert!(report
        .diagnostics
        .iter()
        .any(|diagnostic| matches!(diagnostic.kind, DiagnosticKind::BadLink { .. })));
}

#[test]
fn non_tauri_harness_exports_html_from_export_ir_through_mock_host() {
    let registry = SessionRegistry::new();
    let session_id = create_harness_session(
        &registry,
        "/tmp/export.md",
        b"# Title\n\nparagraph\n\n![alt](img.png)\n",
    );

    let export_document = with_session_state(&registry, session_id, |state| {
        state
            .core
            .build_export_document(ExportRequest {
                session_id,
                revision: state.core.revision(),
                export_request_id: "export-1".into(),
                options: ExportOptions {
                    include_diagnostics: true,
                },
            })
            .map_err(markflow_runtime::error::RuntimeError::from)
    })
    .expect("export IR");

    let mut host = MockHostHarness::new([HostCapability::Export]);
    host.register_window("main");
    host.register_session_revision(session_id.0, export_document.base_revision);
    host.validate(&export_context(
        session_id,
        DocumentId(export_document.document_id),
        Revision(export_document.base_revision),
        &export_document.export_request_id,
    ))
    .expect("mock Host export context");

    let html = render_html_from_export_ir(&export_document.blocks);
    assert!(html.contains("<h1>Title</h1>"));
    assert!(html.contains("<p>paragraph</p>"));
    assert!(html.contains("<img src=\"img.png\" alt=\"alt\">"));
}

#[test]
fn non_tauri_harness_keeps_same_path_export_bound_to_initiating_session() {
    let registry = SessionRegistry::new();
    let path = "/tmp/shared-export.md";
    let session_a = create_harness_session(&registry, path, b"# A\n\nsession A\n");
    let session_b = create_harness_session(&registry, path, b"# B\n\nsession B\n");

    let export_a = with_session_state(&registry, session_a, |state| {
        state
            .core
            .build_export_document(ExportRequest {
                session_id: session_a,
                revision: state.core.revision(),
                export_request_id: "export-a".into(),
                options: ExportOptions {
                    include_diagnostics: true,
                },
            })
            .map_err(markflow_runtime::error::RuntimeError::from)
    })
    .expect("export A");

    let export_b = with_session_state(&registry, session_b, |state| {
        state
            .core
            .build_export_document(ExportRequest {
                session_id: session_b,
                revision: state.core.revision(),
                export_request_id: "export-b".into(),
                options: ExportOptions {
                    include_diagnostics: true,
                },
            })
            .map_err(markflow_runtime::error::RuntimeError::from)
    })
    .expect("export B");

    assert_eq!(registry.list_by_path(path).len(), 2);
    assert_eq!(export_a.session_id, session_a.0);
    assert_eq!(export_b.session_id, session_b.0);
    assert!(render_html_from_export_ir(&export_a.blocks).contains("session A"));
    assert!(render_html_from_export_ir(&export_b.blocks).contains("session B"));
}

#[test]
fn non_tauri_harness_detects_same_path_save_conflict() {
    let registry = SessionRegistry::new();
    let path = "/tmp/shared-save.md";
    let identity_a = make_identity(10, "hash-a", 1);
    let identity_b = make_identity(11, "hash-b", 2);
    let session_a =
        create_harness_session_with_identity(&registry, path, b"session A\n", identity_a.clone());
    let session_b =
        create_harness_session_with_identity(&registry, path, b"session B\n", identity_b);
    let host = MockHost::new(Ok(identity_a.clone()), Ok(identity_a));

    let err = save_document(&registry, session_b, &host).unwrap_err();

    assert_eq!(registry.list_by_path(path).len(), 2);
    assert_eq!(
        err.code,
        markflow_runtime::error::RuntimeErrorCode::Conflict
    );
    assert!(registry.exists(session_a));
    assert!(registry.exists(session_b));
}
