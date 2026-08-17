# P1B corrective repair: paste provenance and failed reload

## Scope

This run addresses the two P1 findings in the independent epoch review:

1. Editing at a CRLF/CR paste boundary could make range-relative provenance
   fall back to `inherit`.
2. A Host read/UTF-8 parse failure during reload disposed the visible
   binding's active synchronization controller.

## Implementation

- Replaced whole-paste range/string provenance with one mapped annotation per
  pasted logical LF. `MapMode.TrackAfter` keeps an annotation with its actual
  LF when text is inserted immediately before it and discards it only if that
  LF itself is removed/replaced.
- `annotatePasteProvenance()` now resolves each newline in composed and
  confirmed-to-optimistic rebase changes by exact post-change CodeMirror
  position, so adjacent typing, deletion and composition do not change the
  paste EOL family.
- Made `EditorSurfaceBinding.reload()` transactional: input is made read-only
  during the Host request, but the old controller and queues remain live until
  a successful response. On failure the editor is restored to writable and
  retains the current binding, pending text and save capability.

## New automated regressions

- Real CodeMirror CRLF/CR paste followed within one batch by start/internal/end
  typing, in-span deletion, a composition-tagged transaction and forced stale
  resync: Core DTO retains `[crlf, cr, crlf]` provenance.
- Clean reload read/parse failure followed by edit, flush/save and close.
- Dirty discard reload failure followed by further edit and save, proving
  optimistic text remains connected to the prior Core session.

The mock lifecycle fixture validates the exact bridge DTO. `markflow-core`
EOL golden tests independently verify that explicit CRLF/CR DTO entries are
serialized as those source bytes.
