// ── Stage-two admission verification (design Decision 4 / task 6.4) ──────
//
// After the eligibility classifier has admitted a document as `eligible` (or
// `eligible-with-opaque`), admission verification proves the round-trip is
// safe on the ACTUAL editor: it parses the source, serializes the parsed
// document back to Markdown, re-parses that, and compares semantic fingerprints
// (runtime-only attributes stripped + registered canonicalizations allowed).
// A mismatch triggers block-local literal fallback rather than converting a
// lossy parse into an editable baseline. The fallback is independently proven
// with raw blocks isolated from normal Markdown syntax before saving.

import type { Editor, JSONContent } from '@tiptap/core';
import { parseTipTapMarkdown, serializeTipTapMarkdown } from './adapter';
import { semanticFingerprint } from './fingerprint';
import { classifyEligibility, DEFAULT_ADMISSION_LIMITS, type AdmissionLimits } from './eligibility';
import { admitLocalized, admitOpaque } from './opaque/integration';
import type { AdmissionSize, Eligibility, EligibilityReason, MarkdownSession } from './types';

export type AdmissionVerification =
  | { ok: true }
  | { ok: false; code: 'serialize-failed' | 'parse-verification-failed' | 'parse-failed' };

/**
 * UI-facing admission decision (task 6.5 + 8.1).
 *
 *   eligible             → advance to `gated` and enter WYSIWYG
 *   eligible-with-opaque → advance to `opaque` (section 7): render the spans to
 *                          sentinels, load the editor, verify the round-trip and
 *                          build the session — the opaque holder is now safe.
 *   unsupported/lossy    → retain only affected blocks as editable raw text
 *                          and capture a verified `reconcile` session
 *   too-large            → stay Source with the stable reason
 *
 * Returns the pipeline mode + the human-facing reason so the caller can decide
 * WYSIWYG vs Source without re-deriving the contract.
 */
export function decideAdmission(
  editor: Editor,
  source: string,
  revisions: AdmissionRevisionsSpec = { sourceRevision: 1, userRevisionAtAdmission: 0 },
  limits: AdmissionLimits = DEFAULT_ADMISSION_LIMITS,
): {
  mode: 'gated' | 'opaque' | 'reconcile' | 'source-only';
  verdict: Eligibility;
  reason: EligibilityReason;
  session?: MarkdownSession;
  renderedSource?: string;
  size?: AdmissionSize;
} {
  const c = classifyEligibility(source, limits);
  const fallback = () => {
    const admitted = admitLocalized(editor, source, revisions);
    return admitted.ok
      ? { mode: 'reconcile' as const, verdict: 'eligible-with-opaque' as const, reason: 'opaque-covered' as const, session: admitted.session, renderedSource: admitted.renderedSource }
      : { mode: 'source-only' as const, verdict: 'source-only' as const, reason: c.verdict === 'source-only' ? c.reason : 'parse-verification-failed' as const };
  };
  if (c.verdict === 'source-only') {
    return c.reason === 'too-large'
      ? { mode: 'source-only', verdict: c.verdict, reason: c.reason, size: c.size }
      : fallback();
  }
  if (c.verdict === 'eligible-with-opaque') {
    // Section 7: the non-editable opaque holder exists, so an opaque doc can be
    // admitted safely. Verification runs on the actual editor (8.1); failure
    // falls back to local literal blocks if the round-trip fails.
    const admitted = admitOpaque(editor, source, {
      sourceRevision: revisions.sourceRevision,
      userRevisionAtAdmission: revisions.userRevisionAtAdmission,
    });
    if (admitted.ok) {
      return {
        mode: 'opaque',
        verdict: 'eligible-with-opaque',
        reason: 'opaque-covered',
        session: admitted.session,
        renderedSource: admitted.renderedSource,
      };
    }
    return fallback();
  }
  // Fully supported documents use the same verified-session boundary as opaque
  // ones. `renderOpaque` simply creates an empty registry here; this avoids a
  // second, legacy save path that could normalize an untouched source.
  const admitted = admitOpaque(editor, source, revisions);
  if (!admitted.ok) {
    return fallback();
  }
  return {
    mode: 'reconcile',
    verdict: 'eligible',
    reason: 'supported',
    session: admitted.session,
    renderedSource: admitted.renderedSource,
  };
}

/** Revisions captured at admission (source/file + user edit counter). */
export interface AdmissionRevisionsSpec {
  sourceRevision: number;
  userRevisionAtAdmission: number;
}

const REASON_LABELS: Record<EligibilityReason, string> = {
  supported: '文档语法完全受支持',
  'opaque-covered': '包含保留的原文片段，片段可直接编辑，符合语法后自动转换',
  'parse-verification-failed': '往返校验未通过，已保留源码',
  'ambiguous-boundary': '检测到未闭合/歧义语法边界',
  'construct-crosses-boundary': '存在跨越受支持与保留区域的语法',
  'malformed-table': '表格列数不一致，无法安全转换',
  'unknown-construct': '包含暂不支持的语法',
  'too-large': '文档过大',
  manual: '手动确认',
};

function kilobytes(bytes: number): number {
  return Math.round(bytes / 1024);
}

/**
 * Stable, content-free, user-facing reason for why a doc is in Source. For
 * `too-large` the measured size makes the notice actionable ("文档 300KB，超过
 * 所见即所得准入上限 256KB") — which limit tripped decides which one is shown.
 * The interpolated ceiling is the limit that was actually in effect, so custom
 * settings are never misrepresented by hardcoded numbers.
 */
export function admissionReasonLabel(
  reason: EligibilityReason,
  size?: AdmissionSize,
  limits: AdmissionLimits = DEFAULT_ADMISSION_LIMITS,
): string {
  if (reason === 'too-large' && size) {
    // Same strict `>` as classifyEligibility: a document at exactly the byte
    // cap was not rejected by bytes, so an over-limit line count is the
    // binding dimension and must be the one named.
    return size.bytes > limits.maxBytes
      ? `文档过大（${kilobytes(size.bytes)}KB，超过所见即所得准入上限 ${kilobytes(limits.maxBytes)}KB）`
      : `文档过大（${size.lines} 行，超过所见即所得准入上限 ${limits.maxLines} 行）`;
  }
  return REASON_LABELS[reason] ?? '当前文档暂不满足安全 WYSIWYG 条件';
}

/**
 * Verify that a source yielded an editor document whose parse→serialize→parse
 * round-trip preserves the same semantics (per `semanticFingerprint`).
 * `source` MUST already be classified `eligible`/+opaque by
 * `classifyEligibility` before this is called — this function only proves the
 * round-trip is lossless, it does not scan for unsupported syntax.
 */
export function verifyAdmission(editor: Editor, source: string): AdmissionVerification {
  // 1. Parse source → original doc.
  const parsed = parseTipTapMarkdown(editor, source);
  if (!parsed.ok) return { ok: false, code: 'parse-failed' };
  const sourceFp = fingerprintOf(parsed.doc);

  // 2. Serialize the parsed doc back to Markdown.
  const serialized = serializeTipTapMarkdown(editor);
  if (!serialized.ok) return { ok: false, code: 'serialize-failed' };

  // 3. Re-parse the serialized Markdown.
  const reparsed = parseTipTapMarkdown(editor, serialized.markdown);
  if (!reparsed.ok) return { ok: false, code: 'parse-verification-failed' };

  // 4. Compare semantic fingerprints (runtime attrs + canonicalization-aware).
  return fingerprintOf(reparsed.doc) === sourceFp
    ? { ok: true }
    : { ok: false, code: 'parse-verification-failed' };
}

function fingerprintOf(doc: JSONContent): string {
  return semanticFingerprint(doc);
}
