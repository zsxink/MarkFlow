// ── Stage-two admission verification (design Decision 4 / task 6.4) ──────
//
// After the eligibility classifier has admitted a document as `eligible` (or
// `eligible-with-opaque`), admission verification proves the round-trip is
// safe on the ACTUAL editor: it parses the source, serializes the parsed
// document back to Markdown, re-parses that, and compares semantic fingerprints
// (runtime-only attributes stripped + registered canonicalizations allowed).
// Any structural / attribute / ordering loss makes the re-parsed fingerprint
// differ and the document is rejected to `source-only`. This is what prevents a
// lossy initial parse from silently becoming a WYSIWYG baseline.

import type { Editor, JSONContent } from '@tiptap/core';
import { parseTipTapMarkdown, serializeTipTapMarkdown } from './editor.markdown.adapter';
import { semanticFingerprint } from './editor.markdown.fingerprint';
import { classifyEligibility } from './editor.markdown.eligibility';
import { admitOpaque } from './editor.markdown.opaque.integration';
import type { Eligibility, EligibilityReason, MarkdownSession } from './editor.markdown.types';

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
 *   source-only          → stay Source with the stable reason
 *
 * Returns the pipeline mode + the human-facing reason so the caller can decide
 * WYSIWYG vs Source without re-deriving the contract.
 */
export function decideAdmission(
  editor: Editor,
  source: string,
  revisions: AdmissionRevisionsSpec = { sourceRevision: 1, userRevisionAtAdmission: 0 },
): {
  mode: 'gated' | 'opaque' | 'source-only';
  verdict: Eligibility;
  reason: EligibilityReason;
  session?: MarkdownSession;
  renderedSource?: string;
} {
  const c = classifyEligibility(source);
  if (c.verdict === 'source-only') {
    return { mode: 'source-only', verdict: c.verdict, reason: c.reason };
  }
  if (c.verdict === 'eligible-with-opaque') {
    // Section 7: the non-editable opaque holder exists, so an opaque doc can be
    // admitted safely. Verification runs on the actual editor (8.1); failure
    // falls back to source-only rather than risking a lossy baseline.
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
    return { mode: 'source-only', verdict: 'source-only', reason: 'parse-verification-failed' };
  }
  // eligible: prove the round-trip is lossless on the actual editor.
  const v = verifyAdmission(editor, source);
  if (!v.ok) {
    return { mode: 'source-only', verdict: 'source-only', reason: 'parse-verification-failed' };
  }
  return { mode: 'gated', verdict: 'eligible', reason: 'supported' };
}

/** Revisions captured at admission (source/file + user edit counter). */
export interface AdmissionRevisionsSpec {
  sourceRevision: number;
  userRevisionAtAdmission: number;
}

const REASON_LABELS: Record<EligibilityReason, string> = {
  supported: '文档语法完全受支持',
  'opaque-covered': '包含暂未支持的保留片段，暂留在源码模式',
  'parse-verification-failed': '往返校验未通过，已保留源码',
  'ambiguous-boundary': '检测到未闭合/歧义语法边界',
  'construct-crosses-boundary': '存在跨越受支持与保留区域的语法',
  'unknown-construct': '包含暂不支持的语法',
  'too-large': '文档过大',
  manual: '手动确认',
};

/** Stable, content-free, user-facing reason for why a doc is in Source. */
export function admissionReasonLabel(reason: EligibilityReason): string {
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
