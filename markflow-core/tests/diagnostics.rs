mod common;

use common::{change, open};
use markflow_core::{
    CoreError, DiagnosticKind, DiagnosticSeverity, DiagnosticsRequest, DiagramLanguage,
    DiagramRenderError, MissingAssetDiagnostic, Revision, SourceRange, TextPatch, TransactionId,
    UiRange,
};

fn request(session: &markflow_core::DocumentSession) -> DiagnosticsRequest {
    DiagnosticsRequest {
        session_id: session.id,
        revision: session.revision(),
        request_id: "diag-1".to_string(),
        viewport: None,
        missing_assets: Vec::new(),
        diagram_errors: Vec::new(),
    }
}

#[test]
fn diagnostics_report_bad_links_missing_images_and_duplicate_headings() {
    let session =
        open(b"# Title\n\n[bad](javascript:alert)\n![missing](assets/missing.png)\n\n# Title\n");
    let mut req = request(&session);
    req.missing_assets = vec![MissingAssetDiagnostic {
        session_id: session.id,
        revision: session.revision(),
        request_id: "asset-1".to_string(),
        target: "assets/missing.png".to_string(),
        source_range: None,
    }];

    let report = session.diagnostics(req).unwrap();
    let kinds = report
        .diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.clone())
        .collect::<Vec<_>>();

    assert!(kinds.contains(&DiagnosticKind::BadLink {
        target: "javascript:alert".to_string(),
    }));
    assert!(kinds.contains(&DiagnosticKind::MissingImage {
        target: "assets/missing.png".to_string(),
    }));
    assert!(kinds.contains(&DiagnosticKind::DuplicateHeading {
        title: "Title".to_string(),
    }));
    assert!(report
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error));
}

#[test]
fn diagnostics_report_frontmatter_table_and_matching_diagram_errors() {
    let session = open(
        b"---\ntitle: A\ntitle: B\n---\n\n| A | B |\n| --- | --- |\n| only one |\n\n```mermaid\ngraph TD\n```\n",
    );
    let mut req = request(&session);
    req.diagram_errors = vec![
        DiagramRenderError {
            session_id: markflow_core::SessionId(999),
            revision: session.revision(),
            request_id: "foreign".to_string(),
            language: DiagramLanguage::Mermaid,
            source_range: SourceRange::new(session.revision(), 0, 1),
            message: "must be ignored".to_string(),
        },
        DiagramRenderError {
            session_id: session.id,
            revision: session.revision(),
            request_id: "render-1".to_string(),
            language: DiagramLanguage::Mermaid,
            source_range: SourceRange::new(session.revision(), 59, 86),
            message: "Mermaid parse failed".to_string(),
        },
    ];

    let report = session.diagnostics(req).unwrap();
    assert!(report
        .diagnostics
        .iter()
        .any(|diagnostic| matches!(diagnostic.kind, DiagnosticKind::FrontMatter { .. })));
    assert!(report
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.kind == DiagnosticKind::TableStructure));
    assert!(report.diagnostics.iter().any(|diagnostic| {
        diagnostic.kind
            == DiagnosticKind::DiagramRender {
                language: DiagramLanguage::Mermaid,
                render_request_id: "render-1".to_string(),
            }
            && diagnostic.message == "Mermaid parse failed"
    }));
    assert!(!report
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.message == "must be ignored"));
}

#[test]
fn diagnostics_filter_by_viewport_and_reject_stale_identity() {
    let mut session = open(b"# A\n\n[bad](javascript:x)\n\n# A\n");
    let mut req = request(&session);
    req.viewport = Some(UiRange::new(0, 4));
    let report = session.diagnostics(req).unwrap();
    assert!(report
        .diagnostics
        .iter()
        .all(|diagnostic| diagnostic.source_range.end.0 <= 4));

    session
        .apply_patch(TextPatch {
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(Revision(0), 0, 0, "x")],
            selection_after: None,
        })
        .unwrap();
    let stale = session
        .diagnostics(DiagnosticsRequest {
            session_id: session.id,
            revision: Revision(0),
            request_id: "stale".to_string(),
            viewport: None,
            missing_assets: Vec::new(),
            diagram_errors: Vec::new(),
        })
        .unwrap_err();
    assert!(matches!(stale, CoreError::StaleRevision { .. }));
}

#[test]
fn diagnostics_ignore_stale_or_foreign_host_supplied_inputs() {
    let session = open(b"![missing](assets/missing.png)\n\n```mermaid\ngraph TD\n```\n");
    let report = session
        .diagnostics(DiagnosticsRequest {
            session_id: session.id,
            revision: session.revision(),
            request_id: "diag-host".to_string(),
            viewport: None,
            missing_assets: vec![
                MissingAssetDiagnostic {
                    session_id: markflow_core::SessionId(999),
                    revision: session.revision(),
                    request_id: "foreign-asset".to_string(),
                    target: "assets/missing.png".to_string(),
                    source_range: None,
                },
                MissingAssetDiagnostic {
                    session_id: session.id,
                    revision: Revision(99),
                    request_id: "stale-asset".to_string(),
                    target: "assets/missing.png".to_string(),
                    source_range: None,
                },
            ],
            diagram_errors: vec![DiagramRenderError {
                session_id: session.id,
                revision: session.revision(),
                request_id: "stale-range".to_string(),
                language: DiagramLanguage::Mermaid,
                source_range: SourceRange::new(Revision(99), 0, 10),
                message: "stale diagram range".to_string(),
            }],
        })
        .unwrap();

    assert!(report.diagnostics.iter().all(|diagnostic| {
        !matches!(diagnostic.kind, DiagnosticKind::MissingImage { .. })
            && !matches!(diagnostic.kind, DiagnosticKind::DiagramRender { .. })
    }));
}
