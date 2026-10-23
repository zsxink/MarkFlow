// ── File Size Tier Classification ────────────────────────────────────

export type FileSizeTier = 'normal' | 'large' | 'huge';

export interface FileTierConfig {
  largeSizeBytes: number;
  hugeSizeBytes: number;
  largeLines: number;
  hugeLines: number;
}

export const DEFAULT_TIER_CONFIG: FileTierConfig = {
  largeSizeBytes: 1048576,    // 1MB
  hugeSizeBytes: 10485760,    // 10MB
  largeLines: 5000,
  hugeLines: 50000,
};

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
