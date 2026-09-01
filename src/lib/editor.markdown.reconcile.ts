// ── Three-way reconcile classifier (task 8.2 / design Decision 6) ─────────
//
// A pure function that classifies a WYSIWYG save / source-switch candidate
// against the session baseline and the user's edit state:
//
//   unchanged   no user edit AND the candidate differs from the verified
//               baseline only by allowed canonicalization → return the EXACT
//               source baseline (never a byte rewrite)
//   safe-edit   a user edit exists, opaque integrity holds, and the candidate
//               reparses to the current editor semantics → return the restored
//               candidate
//   conflict    any conversion failure, placebo mismatch, stale source
//               revision, semantic mismatch, or unexplained change with no
//               user edit → NO save candidate
//
// This is intentionally not a merge engine: it only decides whether the bridge
// is allowed to hand a candidate to the save path.

import type { MarkdownSession, ReconcileVerdict } from './editor.markdown.types';
import type { OpaqueRegistry } from './editor.markdown.opaque';

export type ReconcileConflictCode =
  | 'conversion-failed' // serialize / restore produced no candidate
  | 'stale-source'      // active file/source revision no longer matches baseline
  | 'opaque-mismatch'   // placeholder integrity broken (missing/dup/reorder/unknown)
  | 'semantic-mismatch' // candidate does not reparse to current editor semantics
  | 'unexpected-change'; // no user edit, yet candidate differs beyond canonicalization

export type ReconcileOutcome =
  | { verdict: 'unchanged'; markdown: string }
  | { verdict: 'safe-edit'; markdown: string }
  | { verdict: 'conflict'; code: ReconcileConflictCode };

export interface ReconcileInput {
  /** Session baselines recorded at admission (8.1). */
  session: Pick<
    MarkdownSession,
    'sourceBaseline' | 'baselineFingerprint' | 'userRevisionAtAdmission' | 'sourceRevision'
  >;
  /** Current user-revision counter (incremented on each user content edit). */
  currentUserRevision: number;
  /**
   * The candidate produced at the boundary, or `null` when parse/serialize/
   * restore already failed (no candidate may be written).
   */
  candidate: string | null;
  /** Whether `candidate` reparses to the current editor fingerprint. */
  candidateReparsesToEditor: boolean;
  /** Whether the active file/source revision still equals the session baseline's. */
  sourceRevisionMatches: boolean;
  /** Whether all opaque placeholders restored one-to-one with intact digests. */
  opaqueIntact: boolean;
  /** Whether the candidate differs from the verified baseline only by canonicalization. */
  canonicalOnly: boolean;
  /** Semantic fingerprint of the editor document at this moment. */
  currentEditorFingerprint: string;
}

/** Whether the user produced at least one content edit since admission. */
function userMadeEdit(input: ReconcileInput): boolean {
  return input.currentUserRevision > input.session.userRevisionAtAdmission;
}

/**
 * Classify the boundary candidate. Pure and deterministic; callers pass the
 * already-computed booleans so this stays unit-testable without an editor.
 */
export function reconcile(input: ReconcileInput): ReconcileOutcome {
  // Every conflict takes precedence over the happy paths: never hand a
  // candidate to disk unless the whole chain is proven safe.
  if (input.candidate === null) {
    return { verdict: 'conflict', code: 'conversion-failed' };
  }
  if (!input.sourceRevisionMatches) {
    return { verdict: 'conflict', code: 'stale-source' };
  }
  if (!input.opaqueIntact) {
    return { verdict: 'conflict', code: 'opaque-mismatch' };
  }

  if (!userMadeEdit(input)) {
    // No user content edit: the candidate must be byte-preserving (only
    // canonicalization differences) to hand back the exact source baseline.
    if (input.canonicalOnly) {
      return { verdict: 'unchanged', markdown: input.session.sourceBaseline };
    }
    return { verdict: 'conflict', code: 'unexpected-change' };
  }

  // A user edit exists: safe-edit only when the candidate reparses to the
  // editor's current semantics (opaque integrity already holds above).
  if (input.candidateReparsesToEditor) {
    return { verdict: 'safe-edit', markdown: input.candidate };
  }
  return { verdict: 'conflict', code: 'semantic-mismatch' };
}

/** Bounded, content-free reason strings for the UI/diagnostics. */
export const RECONCILE_CONFLICT_LABELS: Record<ReconcileConflictCode, string> = {
  'conversion-failed': '内容转换失败，未保存',
  'stale-source': '文档已发生外部变化，请重新加载',
  'opaque-mismatch': '保留片段完整性被破坏，未保存',
  'semantic-mismatch': '编辑结果无法安全重现，未保存',
  'unexpected-change': '检测到未登记的内容变化，未保存',
};

/** Human-facing verdict label (unchanged / safe-edit / conflict). */
export function reconcileVerdictLabel(verdict: ReconcileVerdict): string {
  switch (verdict) {
    case 'unchanged': return '内容未变化，保留原文';
    case 'safe-edit': return '编辑已安全保存';
    case 'conflict': return '发生冲突，未覆盖磁盘';
    default: return '未知状态';
  }
}

// ── Session factory (task 8.1 / design Decision 6) ────────────────────────
//
// A `MarkdownSession` records every baseline from the SAME admission
// transaction: the exact source, the first verified render baseline, the
// semantic fingerprint, the source + user revisions and the opaque registry.
// All fields come from one atomic function so no field can drift across an
// async boundary.

export interface CreateMarkdownSessionInput {
  /** Exact source at admission (the bytes on disk). */
  source: string;
  /** Restored, verified initial serialization (sentinel-free candidate). */
  verifiedRenderBaseline: string;
  /** Semantic fingerprint of the admitted editor document. */
  fingerprint: string;
  /** Source/file revision at admission (becomes the session baseline). */
  sourceRevision: number;
  /** User-revision counter at admission. */
  userRevisionAtAdmission: number;
  /** Opaque registry of this session (entries snapshot into the session). */
  registry: OpaqueRegistry;
}

export function createMarkdownSession(input: CreateMarkdownSessionInput): MarkdownSession {
  return {
    sourceBaseline: input.source,
    verifiedRenderBaseline: input.verifiedRenderBaseline,
    baselineFingerprint: input.fingerprint,
    sourceRevision: input.sourceRevision,
    userRevisionAtAdmission: input.userRevisionAtAdmission,
    opaqueRegistry: new Map(input.registry.all().map((e) => [e.slot, e])),
  };
}
