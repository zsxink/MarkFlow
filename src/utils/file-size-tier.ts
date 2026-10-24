// ── File Size Tier Classification ────────────────────────────────────

import { DEFAULT_SETTINGS } from '../types/settings';
import type { Settings } from '../types/settings';

export type FileSizeTier = 'normal' | 'large' | 'huge';

export interface FileTierConfig {
  largeSizeBytes: number;
  hugeSizeBytes: number;
  largeLines: number;
  hugeLines: number;
}

// Defaults live in DEFAULT_SETTINGS so tier thresholds and the settings panel
// read one source; this module stays pure (no store/infra imports).
export const DEFAULT_TIER_CONFIG: FileTierConfig = {
  largeSizeBytes: DEFAULT_SETTINGS.largeFileThreshold,
  hugeSizeBytes: DEFAULT_SETTINGS.hugeFileThreshold,
  largeLines: DEFAULT_SETTINGS.largeFileLineThreshold,
  hugeLines: DEFAULT_SETTINGS.hugeFileLineThreshold,
};

/** Settings subset consumed by `tierConfigFromSettings`. */
export type TierThresholdSettings = Pick<
  Settings,
  'largeFileThreshold' | 'hugeFileThreshold' | 'largeFileLineThreshold' | 'hugeFileLineThreshold'
>;

/** Narrow mapping; missing fields (pre-upgrade settings) fall back to defaults. */
export function tierConfigFromSettings(settings: TierThresholdSettings): FileTierConfig {
  return {
    largeSizeBytes: settings.largeFileThreshold ?? DEFAULT_TIER_CONFIG.largeSizeBytes,
    hugeSizeBytes: settings.hugeFileThreshold ?? DEFAULT_TIER_CONFIG.hugeSizeBytes,
    largeLines: settings.largeFileLineThreshold ?? DEFAULT_TIER_CONFIG.largeLines,
    hugeLines: settings.hugeFileLineThreshold ?? DEFAULT_TIER_CONFIG.hugeLines,
  };
}

export function determineTier(
  size: number,
  lines: number,
  config: FileTierConfig = DEFAULT_TIER_CONFIG,
): FileSizeTier {
  if (size > config.hugeSizeBytes || lines > config.hugeLines) return 'huge';
  if (size > config.largeSizeBytes || lines > config.largeLines) return 'large';
  return 'normal';
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
