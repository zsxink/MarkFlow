mod common;

use common::{change, open};
use markflow_core::{
    CoreError, DiagramFallbackReason, DiagramLanguage, DiagramTargetsRequest, Revision, TextPatch,
    TransactionId, UiRange,
};

#[test]
fn diagram_targets_extract_mermaid_and_plantuml_with_identity() {
    let session = open(
        b"```mermaid\ngraph TD\nA-->B\n```\n\n```puml\n@startuml\nAlice -> Bob\n@enduml\n```\n",
    );

    let targets = session
        .diagram_render_targets(DiagramTargetsRequest {
            session_id: session.id,
            revision: session.revision(),
            request_id: "diagram-1".to_string(),
            viewport: None,
            enabled: true,
        })
        .unwrap();

    assert_eq!(targets.session_id, session.id);
    assert_eq!(targets.request_id, "diagram-1");
    assert_eq!(targets.targets.len(), 2);
    assert_eq!(targets.targets[0].language, DiagramLanguage::Mermaid);
    assert_eq!(targets.targets[0].source, "graph TD\nA-->B");
    assert_eq!(targets.targets[0].request_id, "diagram-1");
    assert_eq!(
        targets.targets[0].block_source_range.revision,
        session.revision()
    );
    assert_eq!(
        targets.targets[0].content_source_range.revision,
        session.revision()
    );
    assert!(targets.targets[0].block_ui_range.start.0 < targets.targets[0].block_ui_range.end.0);
    assert_eq!(targets.targets[1].language, DiagramLanguage::PlantUml);
}

#[test]
fn diagram_targets_support_disable_switch_empty_source_and_viewport() {
    let session = open(b"```mermaid\n```\n\n```rust\nfn main() {}\n```\n");

    let disabled = session
        .diagram_render_targets(DiagramTargetsRequest {
            session_id: session.id,
            revision: session.revision(),
            request_id: "disabled".to_string(),
            viewport: None,
            enabled: false,
        })
        .unwrap();
    assert!(disabled.disabled);
    assert!(disabled.targets.is_empty());

    let enabled = session
        .diagram_render_targets(DiagramTargetsRequest {
            session_id: session.id,
            revision: session.revision(),
            request_id: "enabled".to_string(),
            viewport: Some(UiRange::new(0, 12)),
            enabled: true,
        })
        .unwrap();
    assert_eq!(enabled.targets.len(), 1);
    assert_eq!(
        enabled.targets[0].fallback_reason,
        Some(DiagramFallbackReason::EmptySource)
    );
}

#[test]
fn diagram_targets_reject_stale_revision_and_mismatched_session() {
    let mut session = open(b"```mermaid\ngraph TD\n```\n");
    session
        .apply_patch(TextPatch {
            transaction_id: TransactionId(1),
            base_revision: Revision(0),
            changes: vec![change(Revision(0), 0, 0, "# Title\n\n")],
            selection_after: None,
        })
        .unwrap();

    let stale = session
        .diagram_render_targets(DiagramTargetsRequest {
            session_id: session.id,
            revision: Revision(0),
            request_id: "stale".to_string(),
            viewport: None,
            enabled: true,
        })
        .unwrap_err();
    assert!(matches!(stale, CoreError::StaleRevision { .. }));

    let wrong_session = session
        .diagram_render_targets(DiagramTargetsRequest {
            session_id: markflow_core::SessionId(99),
            revision: session.revision(),
            request_id: "wrong".to_string(),
            viewport: None,
            enabled: true,
        })
        .unwrap_err();
    assert!(matches!(wrong_session, CoreError::SessionMismatch { .. }));
}
