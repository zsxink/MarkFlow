## Context

Image storage currently has mature path calculation, pending-image drafts, Host commands for image IO, and save-flow tests. The missing M7C contract is an explicit transaction boundary that separates planning Markdown references from Host IO and delays cleanup until the document commit succeeds.

The current UI is still largely single-window/single-session in legacy paths, while M4 introduced session identity for Core-backed flows. M7C must be compatible with existing save code and make the asset operation identity explicit enough for multi-session isolation.

## Goals / Non-Goals

**Goals:**
- Represent asset work as a transaction containing `sessionId`, `baseRevision`, `requestId`, document path, input Markdown, and proposed output Markdown.
- Keep Markdown reference generation in the Runtime/Core-facing image layer, not in Host storage commands.
- Preserve existing storage behavior for relative references, absolute references, document-dir, document-named-dir, and custom directories.
- Require commit to validate the transaction identity against the current session/revision before cleanup.
- Preserve pending drafts and recovery metadata when IO or document write/save fails.

**Non-Goals:**
- Replacing existing Tauri image commands with a Rust Core asset planner in this slice.
- Changing image naming policy or storage-mode settings.
- Building M7D Search/Diagnostics or M7A/M7B editor UI work.

## Decisions

1. Add a transaction-oriented API in `imageUtils.ts`.
   - Rationale: existing path, naming, pending-draft, and markdown rewrite behavior already lives there and is covered by tests.
   - Alternative considered: implement a new Rust `markflow-core` planner first. That would be architecturally cleaner long term but would require new bridge DTOs and duplicate existing frontend path logic before the M7C save safety issue is solved.

2. Keep existing `preparePendingImagesForSave`/`completePendingImagesSave` wrappers.
   - Rationale: sidebars and tests already call these functions. Compatibility wrappers keep this slice reviewable while routing behavior through the new transaction plan/commit/rollback functions.
   - Alternative considered: update every caller to a new API immediately. That increases blast radius without changing externally visible behavior.

3. Treat Host migration as transaction prepare, not commit.
   - Rationale: `migrate_pending_images` may copy/move files before Markdown is written. The transaction stays recoverable until document write/save succeeds; only then can cleanup remove the draft.
   - Alternative considered: require Host to delay all file movement until after Markdown write. That cannot guarantee the Markdown reference points to files that already exist.

4. Use session identity guards at commit/rollback boundaries.
   - Rationale: M7 asynchronous work must not land on another document. Commit validates `sessionId` and `baseRevision` when callers provide current context.
   - Alternative considered: rely on module-global active draft only. That is the current behavior and is insufficient for multi-document isolation.

## Risks / Trade-offs

- Runtime/Core naming remains TypeScript-side for this slice -> Follow-up can move the pure planning DTO to `markflow-core` once bridge contracts are ready.
- Host rollback is cleanup/preserve-based rather than an undo of already moved final files -> Keep draft metadata and log recovery details so the user can retry instead of writing broken Markdown.
- Legacy save paths may not always have a real Core session -> Allow a synthetic session id for legacy saves while enforcing identity when Core state exists.
