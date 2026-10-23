// ── Markdown serialization + save plan ────────────────────────────────
// Turns the live editor (or the CM6 source surface) into a save candidate and
// classifies that candidate against the disk baseline. Split out of `session.ts`
// so the mode-switch code and the document-load code can both depend on it
// without importing each other.

import { normalizeImageMarkdown } from './serializer';
import { serializeMarkdown, type MarkdownSerializeResult } from './markdown/bridge';
import { endOpaqueSession, getOpaqueRegistry, getOpaqueSession } from './markdown/opaque/session';
import { runSaveBoundary, shouldUseReconcileBoundary } from './save-reconcile';
import { store } from '../infra/store';
import {
  getDocumentState,
  getEditor,
  getMarkdownPipelineMode,
  getMode,
  getRevision,
  getSourceRevision,
  hasExternalModification,
  isDocumentDirty,
} from './state';
import { getSourceContent } from './source-facade';

export function appendTrailingNewlines(markdown: string): string {
  if (/\n$/.test(markdown)) return markdown;
  const trailingNewlines = getDocumentState().trailingNewlines;
  return trailingNewlines > 0 ? markdown + '\n'.repeat(trailingNewlines) : markdown;
}

export function restoreWysiwygTrailingNewlines(markdown: string): string {
  return markdown.replace(/(?:\r?\n)+$/, '');
}

export function getMarkdownResult(): MarkdownSerializeResult {
  if (getMode() === 'source') {
    // CM6 holds authored text. Never add WYSIWYG tail metadata here: doing so
    // resurrects removed/newline-count-edited text on the next save.
    return { ok: true, markdown: normalizeImageMarkdown(getSourceContent()) };
  }
  const editor = getEditor();
  if (!editor) return { ok: false, error: { stage: 'serialize', code: 'editor-unavailable' } };

  // Opaque-aware modes serialize through the reconcile boundary so opaque
  // sentinels are restored to RAW spans — Source mode / save must never see an
  // internal token. A conflict surfaces as a failed conversion (no candidate).
  if (shouldUseReconcileBoundary(getMarkdownPipelineMode())) {
    const session = getOpaqueSession();
    const registry = getOpaqueRegistry();
    if (session && registry) {
      const decision = runSaveBoundary(editor, {
        session,
        registry,
        // An external disk event invalidates writing the original path, but
        // the local representation still belongs to its admitted source.
        // getSavePlan retains the strict current-source check for disk writes.
        currentSourceRevision: hasExternalModification() ? session.sourceRevision : getSourceRevision(),
        currentUserRevision: getRevision(),
        pipelineMode: getMarkdownPipelineMode(),
      });
      if (decision.kind === 'safe-edit') {
        return {
          ok: true,
          markdown: session.localizedFallback
            ? decision.markdown
            : restoreWysiwygTrailingNewlines(decision.markdown),
        };
      }
      if (decision.kind === 'unchanged') {
        return { ok: true, markdown: appendTrailingNewlines(session.sourceBaseline) };
      }
      if (decision.kind === 'conflict') {
        return { ok: false, error: { stage: 'serialize', code: `reconcile-${decision.code}` } };
      }
    }
    // A verified pipeline without its session or registry is unsafe: the raw
    // serializer may emit an opaque sentinel. Do not silently fall back.
    return { ok: false, error: { stage: 'serialize', code: 'reconcile-session-missing' } };
  }

  const result = serializeMarkdown(editor);
  return result.ok ? { ok: true, markdown: appendTrailingNewlines(result.markdown) } : result;
}

/** Compatibility API for read-only consumers. Save callers use getMarkdownResult. */
export function getMarkdown(): string {
  const result = getMarkdownResult();
  return result.ok ? result.markdown : '';
}

export type SavePlan =
  | { kind: 'legacy' } // opaque/reconcile not active → caller uses getMarkdownResult
  | { kind: 'unchanged'; write: false }
  | { kind: 'safe-edit'; write: true; markdown: string }
  | { kind: 'conflict'; write: false; code: string };

/**
 * Compute the save decision when the pipeline is in an opaque-aware mode.
 * `unchanged` → skip disk write (keep exact source bytes); `safe-edit` → write
 * the verified candidate; `conflict` → suppress the write, keep dirty, set the
 * store's `reconcileError`. Returns `legacy` when the boundary is not active so
 * the existing serialization path is untouched.
 */
export function getSavePlan(
  options: { allowConfirmedExternalOverwrite?: boolean } = {},
): SavePlan {
  const mode = getMarkdownPipelineMode();
  if (!shouldUseReconcileBoundary(mode)) return { kind: 'legacy' };
  const editor = getEditor();
  const session = getOpaqueSession();
  const registry = getOpaqueRegistry();
  if (!editor || !session || !registry) {
    store.setState({ dirty: true, reconcileError: 'session-missing' });
    return { kind: 'conflict', write: false, code: 'session-missing' };
  }

  const decision = runSaveBoundary(editor, {
    session,
    registry,
    currentSourceRevision: options.allowConfirmedExternalOverwrite
      ? session.sourceRevision
      : getSourceRevision(),
    currentUserRevision: getRevision(),
    pipelineMode: mode,
  });

  // A Source→WYSIWYG admission deliberately captures the current Source text
  // (so it can prove it is safe) without changing the disk baseline. The
  // reconcile classifier correctly calls this session "unchanged" because no
  // WYSIWYG transaction followed admission, but it is still a pending disk
  // edit when its exact authored text differs from the persisted file.
  if (decision.kind === 'unchanged') {
    const admissionSource = appendTrailingNewlines(session.sourceBaseline);
    // A byte comparison alone is insufficient: parser/render normalization can
    // make an untouched CRLF baseline look different. Source edits set dirty
    // before admission; only that pending edit may turn reconcile's no-WYS
    // transaction result into a disk write.
    if (isDocumentDirty()
      && normalizeImageMarkdown(admissionSource) !== getDocumentState().lastPersistedMarkdown) {
      store.setState({ reconcileError: null });
      return { kind: 'safe-edit', write: true, markdown: admissionSource };
    }
  }

  if (decision.kind === 'safe-edit') {
    return {
      ...decision,
      markdown: session.localizedFallback
        ? decision.markdown
        : restoreWysiwygTrailingNewlines(decision.markdown),
    };
  }

  if (decision.kind === 'conflict') {
    store.setState({ dirty: true, reconcileError: decision.code });
  } else {
    store.setState({ reconcileError: null });
  }
  return decision;
}

/** Convenience: the current pipeline mode (re-export for callers). */
export function getPipelineMode() {
  return getMarkdownPipelineMode();
}

export { endOpaqueSession };
