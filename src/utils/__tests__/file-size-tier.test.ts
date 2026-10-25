import { describe, expect, it } from 'vitest';
import { determineTier, formatFileSize, tierConfigFromSettings, DEFAULT_TIER_CONFIG } from '../file-size-tier';
import { DEFAULT_SETTINGS } from '../../types/settings';

describe('determineTier', () => {
  it('returns normal for small files', () => {
    expect(determineTier(1024, 10)).toBe('normal');
  });

  it('returns normal at exactly the WYSIWYG capacity (strict >)', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.wysiwygMaxBytes, 10)).toBe('normal');
    expect(determineTier(1024, DEFAULT_TIER_CONFIG.maxLines)).toBe('normal');
  });

  it('returns large for files exceeding the WYSIWYG capacity', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.wysiwygMaxBytes + 1, 10)).toBe('large');
  });

  it('returns large for line overflow without requiring source-size confirmation', () => {
    // A million-line file below both byte bounds stays normal until it crosses
    // maxLines, where it becomes huge — there is no line-based large tier.
    expect(determineTier(1024, DEFAULT_TIER_CONFIG.maxLines - 1)).toBe('normal');
    expect(determineTier(1024, DEFAULT_TIER_CONFIG.maxLines + 1)).toBe('large');
  });

  it('returns huge for files exceeding the source capacity', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.sourceMaxBytes + 1, 10)).toBe('huge');
  });

  it('treats size exactly at sourceMaxBytes as large, not huge (strict >)', () => {
    // Exactly at the source capacity and below the line cap: above the WYSIWYG
    // capacity → Large; neither huge axis uses an inclusive comparison.
    expect(determineTier(DEFAULT_TIER_CONFIG.sourceMaxBytes, 10)).toBe('large');
    // Lines exactly at maxLines never trigger huge by themselves either.
    expect(determineTier(DEFAULT_TIER_CONFIG.sourceMaxBytes, DEFAULT_TIER_CONFIG.maxLines)).toBe('large');
  });

  it('prefers huge over large when both apply', () => {
    expect(determineTier(DEFAULT_TIER_CONFIG.sourceMaxBytes + 1, DEFAULT_TIER_CONFIG.maxLines + 1)).toBe('huge');
  });

  it('uses custom config when provided', () => {
    const config = { wysiwygMaxBytes: 100, sourceMaxBytes: 1000, maxLines: 100 };
    expect(determineTier(50, 5, config)).toBe('normal');
    expect(determineTier(500, 5, config)).toBe('large');
    expect(determineTier(5000, 5, config)).toBe('huge');
    expect(determineTier(50, 101, config)).toBe('large');
  });

  it('returns normal for empty file', () => {
    expect(determineTier(0, 0)).toBe('normal');
  });
});

describe('tierConfigFromSettings', () => {
  it('derives the default config from DEFAULT_SETTINGS (single source of truth)', () => {
    expect(DEFAULT_TIER_CONFIG).toEqual({
      wysiwygMaxBytes: DEFAULT_SETTINGS.wysiwygMaxBytes,
      sourceMaxBytes: DEFAULT_SETTINGS.sourceMaxBytes,
      maxLines: DEFAULT_SETTINGS.maxLines,
    });
    // Contract-compatibility: default thresholds keep their documented values.
    expect(DEFAULT_TIER_CONFIG).toEqual({
      wysiwygMaxBytes: 1048576,
      sourceMaxBytes: 10485760,
      maxLines: 1000000,
    });
  });

  it('maps custom thresholds and classifies documents against them', () => {
    const config = tierConfigFromSettings({
      wysiwygMaxBytes: 512 * 1024,
      sourceMaxBytes: 2048 * 1024,
      maxLines: 20000,
    });
    expect(config).toEqual({
      wysiwygMaxBytes: 512 * 1024,
      sourceMaxBytes: 2048 * 1024,
      maxLines: 20000,
    });
    // An 800KB document is Large under the custom capacity but Normal by default.
    expect(determineTier(800 * 1024, 100, config)).toBe('large');
    expect(determineTier(800 * 1024, 100)).toBe('normal');
  });

  it('falls back to defaults for missing fields (pre-upgrade settings)', () => {
    expect(tierConfigFromSettings({})).toEqual(DEFAULT_TIER_CONFIG);
    expect(tierConfigFromSettings({ sourceMaxBytes: 2048 * 1024 })).toEqual({
      ...DEFAULT_TIER_CONFIG,
      sourceMaxBytes: 2048 * 1024,
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
