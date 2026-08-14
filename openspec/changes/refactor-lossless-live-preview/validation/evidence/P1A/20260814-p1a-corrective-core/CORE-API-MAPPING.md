# Corrective API and error mapping

| Public API / contract | Corrective coverage |
| --- | --- |
| `LosslessDocumentSession::open_bytes` clean state | `session::tests::open_zero_revision_and_clean` |
| `LosslessDocumentSession::reload` clean state + generation advance | `session::tests::reload_resets_content_and_revision` |
| `LosslessDocumentSession::apply_patch` rejects pre-reload work | `session::tests::reload_rejects_delayed_patch_from_previous_binding_generation` |
| `TextPatch` session/document identity validation | `negative::patch_with_wrong_session_or_document_identity_is_rejected` |
| Multi-change EOL base snapshot | `eol_provenance::multi_change_inherit_uses_base_snapshot_not_reverse_mutation` |
| Adjacent mixed-EOL multi-change | `eol_provenance::adjacent_multi_change_mixed_eol_golden` |
| `PositionMap::{utf16_for_byte,byte_for_utf16,source_byte_for_byte,byte_for_source_byte}` binding | `property_position::position_map_rejects_mismatched_text_geometry_without_panicking` |

| Stable error code | Triggering test |
| --- | --- |
| `wrong-identity` | `session::tests::reload_rejects_delayed_patch_from_previous_binding_generation`; `negative::patch_with_wrong_session_or_document_identity_is_rejected` |
| `position-map-mismatch` | `property_position::position_map_rejects_mismatched_text_geometry_without_panicking` |
| Existing error-code taxonomy | `error::tests::error_codes_are_stable_and_mapped` plus `negative.rs` coverage |
