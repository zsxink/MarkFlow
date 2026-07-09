import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isImageUrl,
  imagePathToSrc,
  generateImageName,
  DEFAULT_IMAGE_SETTINGS,
  getImageSettings,
} from './imageUtils';

// ---------------------------------------------------------------------------
// Mock external modules that call Tauri APIs
// ---------------------------------------------------------------------------

vi.mock('../lib/storage', () => ({
  loadSettings: vi.fn(),
  getWorkspace: vi.fn(),
  writeFileFromBase64: vi.fn(),
  downloadImage: vi.fn(),
  readFileAsBase64: vi.fn(),
  readSingleDir: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `converted://${path}`),
}));

import { loadSettings } from '../lib/storage';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Pin Date to a known instant so generated timestamps are deterministic.
  vi.setSystemTime(new Date('2025-01-01T00:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// isImageUrl
// ---------------------------------------------------------------------------

describe('isImageUrl', () => {
  it('returns true for http URLs', () => {
    expect(isImageUrl('http://example.com/photo.png')).toBe(true);
  });

  it('returns true for https URLs', () => {
    expect(isImageUrl('https://example.com/photo.png')).toBe(true);
  });

  it('returns false for relative paths', () => {
    expect(isImageUrl('images/photo.png')).toBe(false);
  });

  it('returns false for absolute file paths', () => {
    expect(isImageUrl('/home/user/photo.png')).toBe(false);
  });

  it('returns false for Windows paths', () => {
    expect(isImageUrl('C:\\Users\\photo.png')).toBe(false);
  });

  it('returns false for data URIs', () => {
    expect(isImageUrl('data:image/png;base64,abc')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// imagePathToSrc
// ---------------------------------------------------------------------------

describe('imagePathToSrc', () => {
  it('returns the URL unchanged for http URLs', () => {
    const result = imagePathToSrc('https://example.com/photo.png', '/doc.md');
    expect(result).toBe('https://example.com/photo.png');
  });

  it('resolves relative paths against docPath and converts', () => {
    const result = imagePathToSrc('./images/photo.png', '/docs/page.md');
    // resolveImagePath('./images/photo.png', '/docs/page.md') → '/docs/images/photo.png'
    expect(result).toBe('converted:///docs/images/photo.png');
  });

  it('uses the raw path when docPath is null', () => {
    const result = imagePathToSrc('/absolute/photo.png', null);
    expect(result).toBe('converted:///absolute/photo.png');
  });

  it('passes absolute paths through convertFileSrc unchanged', () => {
    const result = imagePathToSrc('/absolute/photo.png', '/doc.md');
    expect(result).toBe('converted:///absolute/photo.png');
  });
});

// ---------------------------------------------------------------------------
// generateImageName
// ---------------------------------------------------------------------------

describe('generateImageName', () => {
  describe('strategy: original', () => {
    it('returns the original name as-is', async () => {
      const name = await generateImageName('photo.png', 'original');
      expect(name).toBe('photo.png');
    });

    it('falls through to timestamp logic when original name is empty', async () => {
      const name = await generateImageName('', 'original');
      // '' is falsy so the `originalName` guard fails and timestamp logic runs.
      expect(name).toMatch(/^image-\d{14}\.png$/);
    });
  });

  describe('strategy: timestamp', () => {
    it('produces a name with a timestamp component', async () => {
      const name = await generateImageName('photo.png', 'timestamp');
      // Pattern: photo-YYYYMMDDHHmmss.png
      expect(name).toMatch(/^photo-\d{14}\.png$/);
    });

    it('handles missing extension by defaulting to png', async () => {
      const name = await generateImageName('photo', 'timestamp');
      expect(name).toMatch(/^photo-\d{14}\.png$/);
    });

    it('avoids collisions when existingNames contains the same generated name', async () => {
      // With fake timers pinned to 2025-01-01T00:00:00, the generated
      // timestamp-based base is `photo-20250101000000`.
      const existing = ['photo-20250101000000-1.png'];
      const name = await generateImageName('photo.png', 'timestamp', existing);
      // Dedup loop: n=1 exists, so n=2.
      expect(name).toBe('photo-20250101000000-2.png');
    });
  });

  describe('strategy: sequence', () => {
    it('uses "image" as the base name', async () => {
      const name = await generateImageName('photo.png', 'sequence');
      expect(name).toMatch(/^image-\d{14}\.png$/);
    });

    it('uses the extension from the original name', async () => {
      const name = await generateImageName('diagram.svg', 'sequence');
      expect(name).toMatch(/^image-\d{14}\.svg$/);
    });

    it('deduplicates against existingNames', async () => {
      const existing = ['image-20250101000000-1.png'];
      const name = await generateImageName('photo.png', 'sequence', existing);
      expect(name).toBe('image-20250101000000-2.png');
    });
  });

  describe('fallback behaviour', () => {
    it('falls back to the original name for unknown strategy when name exists', async () => {
      const name = await generateImageName('custom.svg', 'unknown-strategy');
      expect(name).toBe('custom.svg');
    });

    it('falls back to a timestamp name for unknown strategy when original is empty', async () => {
      const name = await generateImageName('', 'unknown-strategy');
      expect(name).toMatch(/^image-\d{14}\.png$/);
    });
  });
});

// ---------------------------------------------------------------------------
// getImageSettings
// ---------------------------------------------------------------------------

describe('getImageSettings', () => {
  it('returns defaults when loadSettings throws', async () => {
    vi.mocked(loadSettings).mockRejectedValueOnce(new Error('fail'));
    const settings = await getImageSettings();
    expect(settings).toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  it('returns merged settings from loadSettings', async () => {
    vi.mocked(loadSettings).mockResolvedValueOnce({
      imageStorageMode: 'custom',
      imageCustomPath: './my-images',
      imagePreferRelative: false,
      imageAutoCopyLocal: false,
      imageDownloadNetwork: true,
      imageNamingStrategy: 'original',
    } as any);

    const settings = await getImageSettings();
    expect(settings.storageMode).toBe('custom');
    expect(settings.customPath).toBe('./my-images');
    expect(settings.preferRelative).toBe(false);
    expect(settings.autoCopyLocal).toBe(false);
    expect(settings.downloadNetwork).toBe(true);
    expect(settings.namingStrategy).toBe('original');
  });

  it('fills missing optional settings from defaults', async () => {
    vi.mocked(loadSettings).mockResolvedValueOnce({} as any);

    const settings = await getImageSettings();
    expect(settings).toEqual(DEFAULT_IMAGE_SETTINGS);
  });
});
