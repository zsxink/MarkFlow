## ADDED Requirements

### Requirement: resync_document validates confirmed_revision

The `resync_document` RPC SHALL use the `confirmed_revision` parameter sent by the frontend to verify staleness. If the confirmed revision is outdated relative to the session's current revision, the backend SHALL reject the resync.

#### Scenario: stale resync rejected

- **WHEN** the frontend sends a resync with a `confirmed_revision` lower than the current session revision
- **THEN** the backend SHALL reject the request and signal the frontend to re-sync from the current state
