## Context

Core-backed Source Mode already owns open/edit/save for Markdown text, and M4 established session-indexed frontend projection boundaries. WYSIWYG is still ProseMirror-backed and saves through the legacy serializer, so mode switching can still rewrite Markdown and the WYSIWYG implementation cannot share Core's confirmed snapshot, revision, and stale-result isolation model.

M5 introduces an additive CodeMirror WYSIWYG path. It does not remove the legacy ProseMirror editor. The MVP focuses on proving the architecture: Render IR comes from Core confirmed text, Bridge ranges are UTF-16 and session-bound, Editor Adapter renders only the viewport, and widgets never become the document truth.

## Goals / Non-Goals

**Goals:**

- Produce viewport-scoped Render IR from `DocumentSession` confirmed text.
- Add `get_render_blocks(sessionId, revision, viewport, requestId)` through Runtime and Tauri Bridge.
- Render M5 blocks/inlines in CodeMirror using decorations/widgets while keeping raw Markdown text editable and copyable.
- Drop stale Render IR and stale widget async results using `sessionId + revision + requestId`.
- Keep legacy ProseMirror WYSIWYG reachable as an explicit compatibility path.

**Non-Goals:**

- Full Typora-grade marker folding or replacement widgets for every Markdown token.
- Core semantic edit commands, undo/redo ownership, or formatting command migration; those remain M6.
- GFM table editing, FrontMatter structured editing, Mermaid/PlantUML authoring, or export pipeline migration.
- Removing ProseMirror, serializer code, or existing legacy save behavior.

## Decisions

1. **Render IR is a Core-owned projection DTO, not a frontend parser result.**
   - Core builds blocks and inline spans from the confirmed `TextBuffer` and `ParseIndex`.
   - Runtime validates session and revision before delegating.
   - Alternative considered: parse Markdown in TS from CodeMirror text. Rejected because it would recreate dual truth and bypass Core range/revision ownership.

2. **IPC uses UTF-16 ranges and stable string IDs.**
   - Core may keep byte ranges internally, but Bridge DTOs expose `UiRange` only.
   - Every block/span carries source ranges bound to the response revision.
   - Alternative considered: expose byte offsets and let TS translate. Rejected because CodeMirror uses UTF-16 positions and previous specs require Core-owned conversion.

3. **M5 WYSIWYG weakens markers instead of hiding/replacing editable source.**
   - Decorations use CSS classes for headings, inline emphasis, links, quotes, lists, code fences, and image ranges.
   - Markers remain text, with reveal state driven by cursor/selection/composition proximity.
   - Alternative considered: replacement decorations for Markdown markers. Deferred due to selection, copy/paste, IME, and accessibility risk.

4. **Widgets are side-effect constrained projection objects.**
   - Image previews are mounted as CodeMirror widgets tagged with session/revision/block identity.
   - Widget event handlers call adapter-provided Core/Host commands; they do not mutate CodeMirror docs or Solid text stores directly.
   - Image URLs are sanitized and heavy previews are opt-in for large documents.

5. **Viewport rendering is mandatory, including small documents.**
   - Adapter asks for visible ranges plus bounded overscan.
   - Large documents over 1 MiB disable automatic heavy widget construction and never request whole-document render blocks.
   - Alternative considered: full-document render for small files. Rejected for M5 because it would create a second behavior path and weaken stale-range tests.

6. **WYSIWYG mode has an explicit engine selection.**
   - `mode='wysiwyg'` remains the UI state, but the runtime engine can be legacy ProseMirror or Core CodeMirror.
   - Core-backed Source to WYSIWYG remounts CodeMirror with the Render IR extension, keeps the existing Core session, and does not call legacy `setContent` or serializer APIs.
   - Core-backed WYSIWYG to Source remounts CodeMirror without the Render IR extension and keeps the same Markdown source mirror.
   - Alternative considered: adding a third public mode value. Deferred because the visible product workflow still has two modes and a third mode would ripple through toolbar, status, shortcuts, and existing tests unnecessarily.

## Risks / Trade-offs

- Marker styling is less WYSIWYG than marker folding → Keep legacy ProseMirror path visible and limit M5 acceptance to weak marker reveal.
- Render IR parser coverage can lag full Markdown semantics → Unknown or parse-failed blocks render as source and remain editable.
- Widget lifecycle can leak DOM or apply stale async results → Include destroy hooks, abort signals, and `sessionId + revision + requestId` checks in adapter tests.
- Large documents may have sparse visual styling while scrolling fast → Prefer bounded viewport correctness over jank or hidden full-document work.
- Bridge command adds DTO surface that will evolve in M6/M7 → Keep additive protocol and avoid changing existing command envelopes in M5.

## Migration Plan

- Add Core and Bridge Render IR APIs behind additive command paths.
- Add frontend Bridge types and adapter extension without changing existing Source Mode save path.
- Add a WYSIWYG engine selection path that chooses Core CodeMirror WYSIWYG for Core-backed sessions while leaving legacy ProseMirror available as explicit fallback.
- Validate M5 fixtures and keep fallback behavior: if render fetch fails or returns unknown/stale content, CodeMirror keeps showing editable Markdown source.
