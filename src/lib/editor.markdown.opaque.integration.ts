// ── Opaque admission + reconcile integration (tasks 8.1, 8.4) ─────────────
//
// Wires the scanner/registry/atom/restore pieces into a single admission and a
// reconcile-boundary the editor can drive:
//
//   admitOpaque(editor, source, revisions)
//     render(source) → set sentinel source into the editor → verify the
//     round-trip (serialize → restore → reparse → fingerprint) → build a
//     MarkdownSession capturing every baseline from that ONE transaction.
//
//   reconcileSave(editor, session, revisions)
//     serialize the current doc (emits sentinels) → restore one-to-one →
//     reparse candidate & compare to the current editor fingerprint →
//     compute source-revision match & canonical-only → feed the pure
//     `reconcile` classifier → return unchanged/safe-edit/conflict.
//
// All TipTap calls stay behind this module (per design Decision 1); the editor
// layer only consumes the verdict.

import type { Editor, JSONContent } from '@tiptap/core';
import { parseTipTapMarkdown, parseTipTapMarkdownToDoc, serializeTipTapMarkdown } from './editor.markdown.adapter';
import { semanticFingerprint, isSemanticallyEquivalent } from './editor.markdown.fingerprint';
import { renderOpaque, restoreOpaque } from './editor.markdown.opaque.bridge';
import { setActiveOpaqueRegistry } from './editor.markdown.opaque.extension';
import { installOpaqueSession } from './editor.markdown.opaque.session';
import type { OpaqueRegistry } from './editor.markdown.opaque';
import { createMarkdownSession, reconcile } from './editor.markdown.reconcile';
import type { MarkdownSession } from './editor.markdown.types';
import type { ReconcileOutcome } from './editor.markdown.reconcile';

export type OpaqueAdmission =
  | { ok: true; session: MarkdownSession; renderedSource: string; mode: 'opaque' }
  | { ok: false; code: 'render-failed' | 'parse-failed' | 'verify-failed' };

export interface AdmissionRevisions {
  sourceRevision: number;
  userRevisionAtAdmission: number;
}

function fingerprintOf(editor: Editor): string {
  return semanticFingerprint(editor.getJSON() as JSONContent);
}

/**
 * Semantic fingerprint of a markdown string WITHOUT mutating the editor. The
 * manager's `parse` returns JSON without `setContent`, so save-boundary
 * fingerprint comparisons never clobber the live document.
 */
function fingerprintOfMarkdown(editor: Editor, source: string): string | null {
  const parsed = parseTipTapMarkdownToDoc(editor, source);
  return parsed.ok ? semanticFingerprint(parsed.doc) : null;
}

/**
 * Admit an `eligible-with-opaque` document: render it into sentinel form, load
 * it into the editor, verify the round-trip, and capture a full session from
 * that single verification transaction.
 */
export function admitOpaque(editor: Editor, source: string, revisions: AdmissionRevisions): OpaqueAdmission {
  const rendered = renderOpaque(source);
  if (!rendered.ok) return { ok: false, code: 'render-failed' };
  setActiveOpaqueRegistry(rendered.registry);

  const parsed = parseTipTapMarkdown(editor, rendered.markdown);
  if (!parsed.ok) return { ok: false, code: 'parse-failed' };
  const editorFp = fingerprintOf(editor);

  // Verify: serialize → restore → re-render (reproduce opaque nodes) →
  // fingerprint the re-rendered candidate against the live editor. The restored
  // candidate holds RAW opaque spans; re-rendering it to sentinels reproduces
  // the opaque-node structure the editor holds. The fingerprint is computed
  // WITHOUT `setContent`, so the editor keeps its original sentinel doc and the
  // original registry stays authoritative.
  const serialized = serializeTipTapMarkdown(editor);
  if (!serialized.ok) return { ok: false, code: 'verify-failed' };
  const restored = restoreOpaque(serialized.markdown, rendered.registry);
  if (!restored.ok) return { ok: false, code: 'verify-failed' };
  const reRendered = renderOpaque(restored.markdown);
  if (!reRendered.ok) return { ok: false, code: 'verify-failed' };
  // The re-rendered sentinels use fresh slots; resolve them against THIS
  // registry so the re-render reproduces opaque nodes for the comparison.
  setActiveOpaqueRegistry(reRendered.registry);
  const candidateFp = fingerprintOfMarkdown(editor, reRendered.markdown);
  // The editor doc still holds the ORIGINAL slots; keep its registry active.
  setActiveOpaqueRegistry(rendered.registry);
  if (candidateFp !== editorFp) return { ok: false, code: 'verify-failed' };

  const session = createMarkdownSession({
    source,
    verifiedRenderBaseline: restored.markdown,
    fingerprint: editorFp,
    sourceRevision: revisions.sourceRevision,
    userRevisionAtAdmission: revisions.userRevisionAtAdmission,
    registry: rendered.registry,
  });

  // Commit registry + session baselines atomically (visible to the save path).
  installOpaqueSession(session, rendered.registry);

  return { ok: true, session, renderedSource: rendered.markdown, mode: 'opaque' };
}

export interface ReconcileSaveInput {
  /** The live session (its registry is authoritative for restore). */
  session: MarkdownSession;
  /** Current source/file revision (compare against session.sourceRevision). */
  currentSourceRevision: number;
  /** Current user-revision counter. */
  currentUserRevision: number;
  /** Registry instance used at admission (authoritative for opaque restore). */
  registry: OpaqueRegistry | null;
}

export interface ReconcileSaveResult {
  outcome: ReconcileOutcome;
  /** Semantic fingerprint of the editor doc at the boundary (for diagnostics). */
  editorFingerprint: string;
}

/**
 * Run the reconcile boundary at save / source-switch. Serializes the current
 * editor document, restores opaque sentinels one-to-one, reparses the candidate
 * and compares it against the current editor semantics, then classifies.
 */
export function reconcileSave(editor: Editor, input: ReconcileSaveInput): ReconcileSaveResult {
  const editorFp = fingerprintOf(editor);
  const registry = input.registry;

  const serialized = serializeTipTapMarkdown(editor);
  let candidate: string | null = null;
  let opaqueIntact = true;

  if (serialized.ok && registry) {
    const restored = restoreOpaque(serialized.markdown, registry);
    if (restored.ok) {
      candidate = restored.markdown;
    } else {
      opaqueIntact = false;
    }
  }

  // Does the candidate reparse to the current editor semantics? The restored
  // candidate holds RAW opaque spans; re-render it to sentinels first so it
  // reproduces the same opaque-node structure (count/order/category — slot is
  // runtime-stripped) as the live editor before comparing fingerprints.
  let candidateReparsesToEditor = true;
  let canonicalOnly = false;
  if (candidate !== null) {
    const reRendered = renderOpaque(candidate);
    let candidateFp: string | null = null;
    if (reRendered.ok) {
      // The re-rendered sentinels use fresh slots; resolve them against this
      // registry so the re-render reproduces opaque nodes (NON-mutating — the
      // save boundary must not clobber the live editor doc).
      setActiveOpaqueRegistry(reRendered.registry);
      candidateFp = fingerprintOfMarkdown(editor, reRendered.markdown);
      setActiveOpaqueRegistry(input.registry);
    }
    candidateReparsesToEditor = candidateFp !== null && candidateFp === editorFp;
    // No user edit path: candidate differs from the verified baseline only by
    // pure-text canonicalization (EOF / newline normalization).
    canonicalOnly = isSemanticallyEquivalent(candidate, input.session.verifiedRenderBaseline);
  } else {
    candidateReparsesToEditor = false;
  }

  const outcome = reconcile({
    session: input.session,
    currentUserRevision: input.currentUserRevision,
    candidate,
    candidateReparsesToEditor,
    sourceRevisionMatches: input.currentSourceRevision === input.session.sourceRevision,
    opaqueIntact,
    canonicalOnly,
    currentEditorFingerprint: editorFp,
  });

  return { outcome, editorFingerprint: editorFp };
}
