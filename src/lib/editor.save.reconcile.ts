// ── Save-boundary reconcile decision (tasks 8.5, 8.6 / design Decision 7) ──
//
// The save / autosave path consumes this boundary instead of raw serialization
// when the pipeline is in an opaque-aware mode:
//
//   unchanged   no user edit, candidate is canonical-only → DO NOT write; keep
//               the exact source bytes, leave dirty false.
//   safe-edit   a user edit was verified against the editor fingerprint → write
//               the restored candidate.
//   conflict    corruption / stale source / opaque mismatch / semantic loss →
//               SUPPRESS the write, keep the document dirty, never report a
//               successful save, and surface a content-free reason.
//
// Dirty is derived ONLY from a successful candidate vs the persisted baseline,
// and a stale scheduler/session result is discarded (8.6).

import type { Editor } from '@tiptap/core';
import type { ReconcileSaveInput, ReconcileSaveResult } from './editor.markdown.opaque.integration';
import { reconcileSave } from './editor.markdown.opaque.integration';
import type { MarkdownPipelineMode } from './editor.markdown.types';
import { normalizeImageMarkdown, replaceAssetUrlsWithOriginal } from './editor.serializer';

export type SaveBoundaryDecision =
  | { kind: 'unchanged'; write: false }
  | { kind: 'safe-edit'; write: true; markdown: string }
  | { kind: 'conflict'; write: false; code: string };

export interface SaveBoundaryInput extends ReconcileSaveInput {
  /** Coupled to the pipeline mode: engage only for opaque-aware modes. */
  pipelineMode: MarkdownPipelineMode;
}

/**
 * Whether the current pipeline mode expects the reconcile save boundary.
 * Below `opaque` (e.g. `gated`, `v3-compatible`, `source-only`) the legacy
 * serialization path is authoritative.
 */
export function shouldUseReconcileBoundary(mode: MarkdownPipelineMode): boolean {
  return mode === 'opaque' || mode === 'reconcile';
}

/** Derive dirty from a successful candidate compared against the persisted baseline (8.6). */
export function deriveDirtyFromCandidate(candidate: string, persistedBaseline: string): boolean {
  return candidate !== persistedBaseline;
}

/** Whether a pending conflict must suppress autosave (8.5). */
export function shouldSuppressAutosave(reconcileError: string | null): boolean {
  return reconcileError !== null;
}

/**
 * Run the reconcile boundary for a save. Returns a decision the save path can
 * act on. On conflict the reason is content-free (never the document body).
 */
export function runSaveBoundary(editor: Editor, input: SaveBoundaryInput): SaveBoundaryDecision {
  if (!shouldUseReconcileBoundary(input.pipelineMode)) {
    // Non-opaque modes: fall back to plain serialization (legacy behavior).
    // The caller already produced a candidate via `getMarkdownResult`; here we
    // return the serialized text as a safe-edit so the existing save proceeds.
    const serialized = reconcileSerialize(editor, input);
    return serialized;
  }

  const result: ReconcileSaveResult = reconcileSave(editor, input);
  const { outcome } = result;
  switch (outcome.verdict) {
    case 'unchanged':
      return { kind: 'unchanged', write: false };
    case 'safe-edit':
      // The reconcile candidate is serialized from the editor doc, which holds
      // runtime `asset:` image srcs. Map them back to the original Markdown
      // addresses before this becomes the written / saved content — otherwise a
      // pasted/dropped image URL would be persisted unresolved and break on
      // reload (reviewer finding, task 10.4 round 2). Also normalize image
      // blocks, matching the legacy serialization path (serializeMarkdown).
      return {
        kind: 'safe-edit',
        write: true,
        markdown: normalizeImageMarkdown(replaceAssetUrlsWithOriginal(outcome.markdown)),
      };
    case 'conflict':
      return { kind: 'conflict', write: false, code: outcome.code };
  }
}

function reconcileSerialize(editor: Editor, input: ReconcileSaveInput): SaveBoundaryDecision {
  // Legacy path: serialize and return the restore-validated candidate if any,
  // else conflict (never write a lossy fallback).
  const result = reconcileSave(editor, input);
  if (result.outcome.verdict === 'safe-edit' || result.outcome.verdict === 'unchanged') {
    if (result.outcome.verdict === 'unchanged') {
      // `unchanged` returns the exact source baseline byte-for-byte (task 8.3);
      // never normalize or remap it. It holds authored addresses, not runtime
      // `asset:` URLs, so no mapping is needed and rewrite must be avoided.
      return { kind: 'safe-edit', write: true, markdown: input.session.sourceBaseline };
    }
    // Map runtime `asset:` image srcs back to original Markdown addresses and
    // normalize image blocks before this becomes written content (same reason
    // as the opaque safe-edit path above).
    return { kind: 'safe-edit', write: true, markdown: normalizeImageMarkdown(replaceAssetUrlsWithOriginal(result.outcome.markdown)) };
  }
  return { kind: 'conflict', write: false, code: result.outcome.code };
}
