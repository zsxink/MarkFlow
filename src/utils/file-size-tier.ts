// ── File Size Tier Classification ────────────────────────────────────

import { DEFAULT_SETTINGS } from '../types/settings';
import type { Settings } from '../types/settings';

export type FileSizeTier = 'normal' | 'large' | 'huge';

export interface FileTierConfig {
  wysiwygMaxBytes: number;
  sourceMaxBytes: number;
  maxLines: number;
}

// Defaults live in DEFAULT_SETTINGS so tier thresholds and the settings panel
// read one source; this module stays pure (no store/infra imports).
export const DEFAULT_TIER_CONFIG: FileTierConfig = {
  wysiwygMaxBytes: DEFAULT_SETTINGS.wysiwygMaxBytes,
  sourceMaxBytes: DEFAULT_SETTINGS.sourceMaxBytes,
  maxLines: DEFAULT_SETTINGS.maxLines,
};

/** Settings subset consumed by `tierConfigFromSettings`. */
export type TierThresholdSettings = Pick<Settings, 'wysiwygMaxBytes' | 'sourceMaxBytes' | 'maxLines'>;

/** Narrow mapping; missing fields (pre-upgrade settings) fall back to defaults. */
export function tierConfigFromSettings(settings: TierThresholdSettings): FileTierConfig {
  return {
    wysiwygMaxBytes: settings.wysiwygMaxBytes ?? DEFAULT_TIER_CONFIG.wysiwygMaxBytes,
    sourceMaxBytes: settings.sourceMaxBytes ?? DEFAULT_TIER_CONFIG.sourceMaxBytes,
    maxLines: settings.maxLines ?? DEFAULT_TIER_CONFIG.maxLines,
  };
}

/**
 * Tier derivation: Huge means the document is beyond the source-mode capacity
 * (bytes or lines) and triggers the confirm dialog; Large means it merely
 * exceeds the WYSIWYG capacity, which matches the degradation bar's
 * "switch to source" advice. Lines never produce an intermediate tier.
 */
export function determineTier(
  size: number,
  lines: number,
  config: FileTierConfig = DEFAULT_TIER_CONFIG,
): FileSizeTier {
  if (size > config.sourceMaxBytes || lines > config.maxLines) return 'huge';
  if (size > config.wysiwygMaxBytes) return 'large';
  return 'normal';
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
