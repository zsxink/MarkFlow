mod common;

use common::{open, patch_at};
use markflow_core::{
    CoreError, ExportBlockKind, ExportDiagnosticCode, ExportDiagramRenderTarget, ExportOptions,
    ExportRequest, ExportTableAlignment, Revision, SessionId, EXPORT_IR_SCHEMA_VERSION,
};

fn export_all(text: &str) -> markflow_core::ExportDocument {
    let session = open(text.as_bytes());
    session
        .build_export_document(ExportRequest {
            session_id: SessionId(7),
            revision: Revision(0),
            export_request_id: "export-1".into(),
            options: ExportOptions::default(),
        })
        .unwrap()
}

#[test]
fn export_ir_v1_covers_m8a_semantic_blocks() {
    let document = export_all(
        "---\ntitle: 报告\nunsafe: [a, b]\n---\n\n# 标题 😀\n\nparagraph with `code` and [link](https://example.com)\n\n> quote\n\n- item\n  - nested\n\n- [x] done\n- [ ] todo\n\n```rust\nfn main() {}\n```\n\n| a | b |\n| :--- | ---: |\n| 1 | 2 |\n\n![alt](images/a.png \"caption\")\n\n```mermaid\ngraph TD; A-->B;\n```\n",
    );

    assert_eq!(document.schema_version, EXPORT_IR_SCHEMA_VERSION);
    assert_eq!(document.session_id, 7);
    assert_eq!(document.document_id, 11);
    assert_eq!(document.base_revision, 0);
    assert_eq!(document.export_request_id, "export-1");

    assert_eq!(
        document
            .metadata
            .frontmatter
            .as_ref()
            .unwrap()
            .fields
            .iter()
            .map(|field| (field.key.as_str(), field.value.as_str()))
            .collect::<Vec<_>>(),
        vec![("title", "报告")]
    );
    assert!(document
        .metadata
        .frontmatter
        .as_ref()
        .unwrap()
        .unsafe_source_range
        .is_some());

    assert!(matches!(
        document.blocks[1].kind,
        ExportBlockKind::Heading { level: 1, .. }
    ));
    assert!(matches!(
        document.blocks[2].kind,
        ExportBlockKind::Paragraph
    ));
    assert!(matches!(
        document.blocks[3].kind,
        ExportBlockKind::Blockquote
    ));
    assert!(matches!(
        document.blocks[4].kind,
        ExportBlockKind::List {
            ordered: false,
            task: false,
            ..
        }
    ));
    assert!(matches!(
        document.blocks[5].kind,
        ExportBlockKind::List {
            ordered: false,
            task: true,
            checked: ref states,
        } if states == &vec![true, false]
    ));
    assert!(matches!(
        document.blocks[6].kind,
        ExportBlockKind::CodeBlock {
            language: Some(ref language),
        } if language == "rust"
    ));
    assert!(matches!(
        document.blocks[7].kind,
        ExportBlockKind::Table { ref alignments }
            if alignments == &vec![ExportTableAlignment::Left, ExportTableAlignment::Right]
    ));
    assert!(matches!(
        document.blocks[8].kind,
        ExportBlockKind::Image {
            ref alt,
            ref target,
            ref title,
            ..
        } if alt == "alt" && target == "images/a.png" && title.as_deref() == Some("caption")
    ));
    assert!(matches!(
        document.blocks[9].kind,
        ExportBlockKind::Diagram {
            render_target: ExportDiagramRenderTarget::Mermaid,
            sandbox_required: true,
            timeout_ms: 10_000,
            ..
        }
    ));
    assert_eq!(document.assets.len(), 1);
    assert_eq!(document.assets[0].original_reference, "images/a.png");
    assert_eq!(
        document.assets[0].mime_type_hint.as_deref(),
        Some("image/png")
    );
    assert!(document.assets[0].requires_host_read);
}

#[test]
fn export_ir_preserves_crlf_source_slices() {
    let document =
        export_all("# 标题 😀\r\n\r\nparagraph\r\n\r\n![alt](https://example.com/a.svg)\r\n");

    assert_eq!(document.blocks[0].source, "# 标题 😀");
    assert_eq!(document.blocks[1].source, "paragraph");
    assert_eq!(
        document.blocks[2].source,
        "![alt](https://example.com/a.svg)"
    );
    assert!(!document.assets[0].requires_host_read);
    assert_eq!(
        document.assets[0].mime_type_hint.as_deref(),
        Some("image/svg+xml")
    );
}

#[test]
fn export_ir_records_unknown_blocks_instead_of_dropping_content() {
    let document = export_all("[ref]: https://example.com\n\n---\n");

    assert!(matches!(
        document.blocks[0].kind,
        ExportBlockKind::Unknown { .. }
    ));
    assert_eq!(document.blocks[0].source, "[ref]: https://example.com");
    assert!(matches!(
        document.blocks[1].kind,
        ExportBlockKind::Unknown { .. }
    ));
    assert_eq!(document.diagnostics.len(), 2);
    assert_eq!(
        document.diagnostics[0].code,
        ExportDiagnosticCode::ExportIrUnsupportedBlock
    );
}

#[test]
fn export_ir_rejects_stale_revision_and_session_mismatch() {
    let mut session = open(b"abc\n");
    session
        .apply_patch(patch_at(Revision(0), 1, 0, 0, "x"))
        .unwrap();

    let stale = session
        .build_export_document(ExportRequest {
            session_id: SessionId(7),
            revision: Revision(0),
            export_request_id: "stale".into(),
            options: ExportOptions::default(),
        })
        .unwrap_err();
    assert_eq!(
        stale,
        CoreError::StaleRevision {
            expected: Revision(0),
            actual: Revision(1),
        }
    );

    let mismatch = session
        .build_export_document(ExportRequest {
            session_id: SessionId(99),
            revision: Revision(1),
            export_request_id: "mismatch".into(),
            options: ExportOptions::default(),
        })
        .unwrap_err();
    assert_eq!(
        mismatch,
        CoreError::SessionMismatch {
            expected: SessionId(7),
            actual: SessionId(99),
        }
    );
}
