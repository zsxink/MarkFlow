import { describe, expect, it } from 'vitest';
import { determineTier, formatFileSize, tierConfigFromSettings, DEFAULT_TIER_CONFIG } from '../file-size-tier';
import { DEFAULT_SETTINGS } from '../../types/settings';

describe('determineTier', () => {
  it('returns normal for small files', () => {
    expect(determineTier(1024, 10)).toBe('normal');
  });

  it('returns normal for files just below large threshold', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.largeSizeBytes - 1, DEFAULT_TIER_CONFIG.largeLines - 1)).toBe('normal');
  });

  it('returns large for files exceeding size threshold', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.largeSizeBytes + 1, 10)).toBe('large');
  });

  it('returns large for files exceeding line threshold', () => {
    expect(determineTier(1024, DEFAULT_TIER_CONFIG.largeLines + 1)).toBe('large');
  });

  it('returns huge for files exceeding huge size threshold', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.hugeSizeBytes + 1, 10)).toBe('huge');
  });

  it('returns huge for files exceeding huge line threshold', () => {
    expect(determineTier(1024, DEFAULT_TIER_CONFIG.hugeLines + 1)).toBe('huge');
  });

  it('uses custom config when provided', () => {
    const config = { largeSizeBytes: 100, hugeSizeBytes: 1000, largeLines: 10, hugeLines: 100 };
    expect(determineTier(50, 5, config)).toBe('normal');
    expect(determineTier(500, 5, config)).toBe('large');
    expect(determineTier(5000, 5, config)).toBe('huge');
  });

  it('returns normal for empty file', () => {
    expect(determineTier(0, 0)).toBe('normal');
  });

  it('returns huge when both size and lines are extreme', () => {
    expect(determineTier(999999999, 999999)).toBe('huge');
  });
});

describe('tierConfigFromSettings', () => {
  it('derives the default config from DEFAULT_SETTINGS (single source of truth)', () => {
    expect(DEFAULT_TIER_CONFIG).toEqual({
      largeSizeBytes: DEFAULT_SETTINGS.largeFileThreshold,
      hugeSizeBytes: DEFAULT_SETTINGS.hugeFileThreshold,
      largeLines: DEFAULT_SETTINGS.largeFileLineThreshold,
      hugeLines: DEFAULT_SETTINGS.hugeFileLineThreshold,
    });
    // Contract-compatibility: default thresholds keep their documented values.
    expect(DEFAULT_TIER_CONFIG).toEqual({
      largeSizeBytes: 1048576,
      hugeSizeBytes: 10485760,
      largeLines: 5000,
      hugeLines: 50000,
    });
  });

  it('maps custom thresholds and classifies documents against them', () => {
    const config = tierConfigFromSettings({
      largeFileThreshold: 512 * 1024,
      hugeFileThreshold: 2048 * 1024,
      largeFileLineThreshold: 1000,
      hugeFileLineThreshold: 20000,
    });
    expect(config).toEqual({
      largeSizeBytes: 512 * 1024,
      hugeSizeBytes: 2048 * 1024,
      largeLines: 1000,
      hugeLines: 20000,
    });
    // A 800KB document is Large under the custom threshold but Normal by default.
    expect(determineTier(800 * 1024, 100, config)).toBe('large');
    expect(determineTier(800 * 1024, 100)).toBe('normal');
  });

  it('falls back to defaults for missing fields (pre-upgrade settings)', () => {
    expect(tierConfigFromSettings({})).toEqual(DEFAULT_TIER_CONFIG);
    expect(tierConfigFromSettings({ largeFileThreshold: 2048 * 1024 })).toEqual({
      ...DEFAULT_TIER_CONFIG,
      largeSizeBytes: 2048 * 1024,
    });
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats large MB values', () => {
    expect(formatFileSize(5242880)).toBe('5.0 MB');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});
