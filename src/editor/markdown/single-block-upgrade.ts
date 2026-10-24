import type { Editor, JSONContent } from '@tiptap/core';
import { getCachedSettings } from '../../infra/storage';
import { admissionLimitsFromSettings, classifyEligibility } from './eligibility';
import { semanticFingerprint } from './fingerprint';
import { parseTipTapMarkdownToDoc } from './adapter';

export interface SingleBlockUpgrade {
  /** Whether the block's bytes are proven losslessly convertible right now. */
  upgradeable: boolean;
  /** Parsed WYSIWYG blocks for the proven source (empty unless upgradeable). */
  blocks: JSONContent[];
}

/**
 * Prove ONE literal block is safely convertible with the same token-level
 * evidence admission uses: classify → parse → serialize → reparse →
 * semantic-fingerprint comparison. The in-editor upgrade path and
 * `parseLocalizedMarkdown` MUST share this single verdict, or a block that
 * upgraded while editing would degrade back to literal on the next admission.
 */
export function verifySingleBlockUpgrade(editor: Editor, source: string): SingleBlockUpgrade {
  // Read the bounds per call so block-local upgrades follow the same
  // user-configured admission limits as whole-document admission.
  const limits = admissionLimitsFromSettings(getCachedSettings());
  if (classifyEligibility(source, limits).verdict !== 'eligible') return { upgradeable: false, blocks: [] };
  const parsed = parseTipTapMarkdownToDoc(editor, source.replace(/(?:\r?\n)+$/, ''));
  if (!parsed.ok) return { upgradeable: false, blocks: [] };
  const manager = (editor as unknown as { markdown?: { serialize(doc: JSONContent): string } }).markdown;
  if (!manager) return { upgradeable: false, blocks: [] };
  try {
    const rendered = manager.serialize(parsed.doc);
    const roundtrip = parseTipTapMarkdownToDoc(editor, rendered);
    const safe = roundtrip.ok && semanticFingerprint(roundtrip.doc) === semanticFingerprint(parsed.doc);
    return safe ? { upgradeable: true, blocks: parsed.doc.content ?? [] } : { upgradeable: false, blocks: [] };
  } catch {
    return { upgradeable: false, blocks: [] };
  }
}
