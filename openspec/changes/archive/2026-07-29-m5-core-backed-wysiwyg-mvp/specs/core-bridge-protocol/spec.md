## ADDED Requirements

### Requirement: get_render_blocks command
The Bridge SHALL provide a `get_render_blocks` command for Core-backed WYSIWYG. The request SHALL include `session_id`, `revision`, `viewport`, and `request_id`. The response SHALL include Render IR tagged with the same `session_id`, `revision`, `request_id`, document identity, viewport, blocks, inline spans, and UTF-16 ranges. The command SHALL reject missing sessions and stale revisions with stable Bridge errors.

#### Scenario: get_render_blocks returns matching Render IR
- **WHEN** the frontend requests render blocks for a live session revision and viewport
- **THEN** Runtime generates Render IR from that session's confirmed snapshot
- **THEN** the response carries the same `session_id`, `revision`, `request_id`, and viewport

#### Scenario: stale revision is rejected
- **WHEN** the frontend requests render blocks for a revision lower than the session current revision
- **THEN** the command returns a `REVISION_MISMATCH` error
- **THEN** no render blocks for the stale revision are applied

#### Scenario: closed session is rejected
- **WHEN** the frontend requests render blocks for a closed or unknown session
- **THEN** the command returns `SESSION_NOT_FOUND`
- **THEN** the frontend keeps editable source fallback state
