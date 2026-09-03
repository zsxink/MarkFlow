import type { JSONContent } from '@tiptap/core';

/**
 * Stage-two pipeline progression, per design:
 *
 *   v3-compatible → gated → opaque → reconcile
 *
 * `source-only` is the emergency kill switch available in every build; a lower
 * mode ignores and clears higher-mode session state. Stage-one only ever runs
 * `source-only` or `v3-compatible`; `gated`/`opaque`/`reconcile` are activated
 * only by the eligibility/admission path (tasks 6.2–6.6 + sections 7–8), never
 * by default.
 */
export type MarkdownPipelineMode = 'source-only' | 'v3-compatible' | 'gated' | 'opaque' | 'reconcile';

/**
 * Mode progression order for comparison (lower index = lower safety level).
 * `source-only` is always the bottom / recovery state.
 */
export const MARKDOWN_PIPELINE_ORDER: readonly MarkdownPipelineMode[] = [
  'source-only',
  'v3-compatible',
  'gated',
  'opaque',
  'reconcile',
];

/** Whether `a` is at or below `b` in the safety progression. */
export function isPipelineModeAtOrBelow(a: MarkdownPipelineMode, b: MarkdownPipelineMode): boolean {
  return MARKDOWN_PIPELINE_ORDER.indexOf(a) <= MARKDOWN_PIPELINE_ORDER.indexOf(b);
}

export type MarkdownConversionStage = 'parse' | 'serialize';

export interface MarkdownConversionError {
  stage: MarkdownConversionStage;
  /** Stable, content-free code suitable for tests and logs. */
  code: string;
  range?: { from: number; to: number };
  /** Only bounded scalar diagnostics belong here; never Markdown source. */
  details?: Record<string, string | number | boolean>;
}

export type MarkdownParseResult =
  | { ok: true; doc: JSONContent; markdown: string }
  | { ok: false; error: MarkdownConversionError; source: string };

export type MarkdownSerializeResult =
  | { ok: true; markdown: string }
  | { ok: false; error: MarkdownConversionError };

// ── Stage-two: WYSIWYG eligibility & reconcile (design Decisions 4 & 6) ──
//
// These types are the contracts implemented by tasks 6.2–6.6 and sections
// 7–8. Stage-one code paths do not construct them; they exist so the bridge
// and the gate tests can reason about stage two now that the maintainer has
// approved entering it.

/** Admission verdict for a document at open time (design Decision 4). */
export type Eligibility =
  | 'eligible'            // every construct supported, parse→serialize→parse verifies
  | 'eligible-with-opaque' // unsupported constructs covered by registered opaque spans
  | 'source-only';        // ambiguity / verification failure -> keep in Source

/** Stable, content-free reason code for an eligibility verdict. */
export type EligibilityReason =
  | 'supported'
  | 'opaque-covered'
  | 'parse-verification-failed'
  | 'ambiguous-boundary'
  | 'construct-crosses-boundary'
  | 'malformed-table'
  | 'unknown-construct'
  | 'too-large'
  | 'manual';

/** Bounded, content-free admission result. */
export interface EligibilityResult {
  verdict: Eligibility;
  reason: EligibilityReason;
  /** Category of the first blocking construct, when known. */
  category?: string;
}

/** Category of an opaque span (the initial allowlist, design Decision 4). */
export type OpaqueCategory = 'frontmatter' | 'html-block' | 'html-comment';

/** Opaque placeholder registry entry (design Decision 5). */
export interface OpaqueEntry {
  slot: string;
  category: OpaqueCategory;
  raw: string;
  originalRange: { from: number; to: number };
  digest: string;
}

/** Per-WYSIWYG-session baselines recorded at admission (design Decision 6). */
export interface MarkdownSession {
  sourceBaseline: string;
  verifiedRenderBaseline: string;
  baselineFingerprint: string;
  sourceRevision: number;
  userRevisionAtAdmission: number;
  opaqueRegistry: Map<string, OpaqueEntry>;
}

/** Result classification at save / source-switch (design Decision 6). */
export type ReconcileVerdict = 'unchanged' | 'safe-edit' | 'conflict';
