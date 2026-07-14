import { describe, expect, it } from 'vitest';
import { determineTier, formatFileSize, DEFAULT_TIER_CONFIG } from './fileSizeTier';

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
