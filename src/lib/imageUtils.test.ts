import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_IMAGE_SETTINGS,
  completePendingImagesSave,
  copyImageToStorage,
  copyLocalFileToStorage,
  discardActiveImageDraft,
  generateClipboardImageName,
  generateSourceImageName,
  getActiveImageDraftId,
  getImageExtension,
  getImageSettings,
  getStoragePath,
  handleNetworkImage,
  imagePathToSrc,
  isImageUrl,
  preparePendingImagesForSave,
  renderClipboardNameTemplate,
  resetActiveImageDraftState,
} from './imageUtils';

vi.mock('./storage', () => ({
  cleanupPendingImages: vi.fn(),
  copyImageToPending: vi.fn(),
  copyImageToStorageFile: vi.fn(),
  downloadImageToPending: vi.fn(),
  downloadImageToStorage: vi.fn(),
  loadSettings: vi.fn(),
  migratePendingImages: vi.fn(),
  readSingleDir: vi.fn(),
  writeImageToStorage: vi.fn(),
  writePendingImage: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((path: string) => `converted://${path}`),
}));

import {
  cleanupPendingImages,
  copyImageToPending,
  copyImageToStorageFile,
  downloadImageToPending,
  downloadImageToStorage,
  loadSettings,
  migratePendingImages,
  readSingleDir,
  writeImageToStorage,
  writePendingImage,
} from './storage';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 22, 16, 40, 30));
  resetActiveImageDraftState();
  vi.mocked(readSingleDir).mockRejectedValue(new Error('directory does not exist yet'));
});

afterEach(() => vi.useRealTimers());

describe('URL and display path helpers', () => {
  it('recognizes only HTTP image URLs', () => {
    expect(isImageUrl('https://example.com/photo.png')).toBe(true);
    expect(isImageUrl('http://example.com/photo.png')).toBe(true);
    expect(isImageUrl('/images/photo.png')).toBe(false);
    expect(isImageUrl('data:image/png;base64,abc')).toBe(false);
  });

  it('resolves a relative Markdown reference for display', () => {
    expect(imagePathToSrc('./images/photo.png', '/docs/page.md'))
      .toBe('converted:///docs/images/photo.png');
  });
});

describe('image settings and storage paths', () => {
  it('loads the version 3 image settings contract', async () => {
    vi.mocked(loadSettings).mockResolvedValue({
      imageStorageMode: 'document-named-dir',
      imageCustomPath: '../assets',
      imageApplyToLocal: false,
      imageApplyToNetwork: true,
      imageReferenceStyle: 'absolute',
      imageClipboardNameTemplate: '${filename}-${time:HHmmss}',
    } as never);

    await expect(getImageSettings()).resolves.toEqual({
      storageMode: 'document-named-dir',
      customPath: '../assets',
      applyToLocal: false,
      applyToNetwork: true,
      referenceStyle: 'absolute',
      clipboardNameTemplate: '${filename}-${time:HHmmss}',
    });
  });

  it('falls back to defaults for missing or invalid values', async () => {
    // 旧版 settings 中的 workspace-assets 在 v3 中不再有效，应触发回退
    vi.mocked(loadSettings).mockResolvedValue({ imageStorageMode: 'workspace-assets' } as never);
    await expect(getImageSettings()).resolves.toEqual(DEFAULT_IMAGE_SETTINGS);
    vi.mocked(loadSettings).mockRejectedValue(new Error('settings unavailable'));
    await expect(getImageSettings()).resolves.toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  it('resolves custom, document and single-level document-named directories', async () => {
    await expect(getStoragePath({
      ...DEFAULT_IMAGE_SETTINGS,
      storageMode: 'custom',
      customPath: './images',
    }, '/docs/guide.md')).resolves.toBe('/docs/images');
    await expect(getStoragePath({
      ...DEFAULT_IMAGE_SETTINGS,
      storageMode: 'document-dir',
    }, '/docs/guide.md')).resolves.toBe('/docs');
    await expect(getStoragePath({
      ...DEFAULT_IMAGE_SETTINGS,
      storageMode: 'document-named-dir',
    }, '/docs/README.zh-CN.md')).resolves.toBe('/docs/README.zh-CN-images');
  });

  it('supports Windows paths and absolute custom paths before first save', async () => {
    await expect(getStoragePath({
      ...DEFAULT_IMAGE_SETTINGS,
      customPath: 'D:\\Pictures\\MarkFlow',
    }, null)).resolves.toBe('D:/Pictures/MarkFlow');
    await expect(getStoragePath({
      ...DEFAULT_IMAGE_SETTINGS,
      customPath: '/Users/me/Pictures',
    }, null)).resolves.toBe('/Users/me/Pictures');
  });
});

describe('clipboard template rendering', () => {
  const now = new Date(2026, 6, 22, 16, 40, 30);

  it('renders the default date/time template and MIME extension', () => {
    expect(generateClipboardImageName(
      'img-${date:yyyyMMdd}${time:HHmmss}',
      'image/png',
      '/docs/guide.md',
      [],
      now,
    )).toBe('img-20260722164030.png');
  });

  it('renders a multi-dot document basename and uses untitled before save', () => {
    expect(renderClipboardNameTemplate('${filename}', '/docs/README.zh-CN.md', now))
      .toBe('README.zh-CN');
    expect(renderClipboardNameTemplate('${filename}', null, now)).toBe('untitled');
  });

  it('cleans separators, control characters, unknown variables and reserved names', () => {
    expect(renderClipboardNameTemplate('../bad\\name\u0000-${unknown}', null, now))
      .toBe('bad-name--');
    expect(renderClipboardNameTemplate('CON', null, now)).toBe('img-CON');
    expect(renderClipboardNameTemplate('${unknown}', null, now)).toBe('img');
  });

  it('preserves MIME format and appends an index only on collision', () => {
    expect(getImageExtension('image/webp', 'clipboard.png')).toBe('webp');
    expect(generateClipboardImageName(
      'img-${date:yyyyMMdd}${time:HHmmss}',
      'image/webp',
      null,
      ['img-20260722164030.webp', 'img-20260722164030-1.webp'],
      now,
    )).toBe('img-20260722164030-2.webp');
  });

  it('keeps source names for local and network images', () => {
    expect(generateSourceImageName('/photos/my photo.jpeg')).toBe('my photo.jpeg');
    expect(generateSourceImageName('/photos/cover.PNG')).toBe('cover.PNG');
    expect(generateSourceImageName('diagram.png', ['diagram.png'])).toBe('diagram-1.png');
  });
});

describe('source behavior and unsaved drafts', () => {
  it('leaves local paths and network URLs unchanged when their switches are off', async () => {
    await expect(copyLocalFileToStorage('/photos/source.png', '/docs/readme.md', {
      ...DEFAULT_IMAGE_SETTINGS,
      applyToLocal: false,
    })).resolves.toBe('../photos/source.png');
    await expect(handleNetworkImage('https://example.com/source.png', '/docs/readme.md', {
      ...DEFAULT_IMAGE_SETTINGS,
      applyToNetwork: false,
    })).resolves.toBe('https://example.com/source.png');
    expect(copyImageToStorageFile).not.toHaveBeenCalled();
    expect(downloadImageToStorage).not.toHaveBeenCalled();
  });

  it('writes unsaved relative-target images to one backend-owned draft', async () => {
    vi.mocked(writePendingImage)
      .mockResolvedValueOnce({ draftId: 'draft-1', path: '/app/MarkFlow/pending-images/draft-1/img.png' });
    vi.mocked(copyImageToPending)
      .mockResolvedValueOnce({ draftId: 'draft-1', path: '/app/MarkFlow/pending-images/draft-1/local.png' });

    const clipboardRef = await copyImageToStorage(
      'PNG_DATA',
      'clipboard.png',
      null,
      DEFAULT_IMAGE_SETTINGS,
      'image/png',
    );
    const localRef = await copyLocalFileToStorage('/photos/local.png', null, DEFAULT_IMAGE_SETTINGS);

    expect(clipboardRef).toContain('/pending-images/draft-1/');
    expect(localRef).toContain('/pending-images/draft-1/');
    expect(writePendingImage).toHaveBeenNthCalledWith(1, 'img-20260722164030.png', 'PNG_DATA', null);
    expect(copyImageToPending).toHaveBeenCalledWith('local.png', '/photos/local.png', 'draft-1');
    expect(getActiveImageDraftId()).toBe('draft-1');
  });

  it('downloads a network image into the draft with its MIME-derived extension', async () => {
    vi.mocked(downloadImageToPending).mockResolvedValue({
      draftId: 'draft-network',
      path: '/app/MarkFlow/pending-images/draft-network/photo.jpg',
    });
    await expect(handleNetworkImage(
      'https://example.com/photo.png?size=large',
      null,
      DEFAULT_IMAGE_SETTINGS,
    )).resolves.toContain('/pending-images/draft-network/photo.jpg');
    expect(downloadImageToPending).toHaveBeenCalledWith(
      'photo.png',
      'https://example.com/photo.png?size=large',
      null,
    );
  });

  it('bypasses pending storage for an absolute custom target', async () => {
    vi.mocked(writeImageToStorage).mockResolvedValue(undefined);
    const settings = { ...DEFAULT_IMAGE_SETTINGS, customPath: '/Pictures/MarkFlow' };
    await expect(copyImageToStorage('PNG_DATA', '', null, settings, 'image/png'))
      .resolves.toBe('/Pictures/MarkFlow/img-20260722164030.png');
    expect(writeImageToStorage).toHaveBeenCalledWith(
      '/Pictures/MarkFlow/img-20260722164030.png',
      '/Pictures/MarkFlow',
      'PNG_DATA',
      null,
    );
    expect(writePendingImage).not.toHaveBeenCalled();
  });
});

describe('first-save image transaction', () => {
  it('migrates, rewrites Markdown, then cleans only after the caller completes the save', async () => {
    vi.mocked(writePendingImage).mockResolvedValue({
      draftId: 'draft-1',
      path: '/pending/draft-1/img.png',
    });
    const pending = await copyImageToStorage('PNG', '', null, DEFAULT_IMAGE_SETTINGS, 'image/png');
    vi.mocked(migratePendingImages).mockResolvedValue({
      draftId: 'draft-1',
      mappings: [{ from: pending, to: '/docs/guide-images/img.png' }],
    });

    const prepared = await preparePendingImagesForSave(
      `![image](${pending})`,
      '/docs/guide.md',
      { ...DEFAULT_IMAGE_SETTINGS, storageMode: 'document-named-dir' },
    );
    expect(prepared.markdown).toBe('![image](guide-images/img.png)');
    expect(cleanupPendingImages).not.toHaveBeenCalled();

    await completePendingImagesSave(prepared.draftId);
    expect(cleanupPendingImages).toHaveBeenCalledWith('draft-1');
    expect(getActiveImageDraftId()).toBeNull();
  });

  it('keeps draft state and skips cleanup when migration fails', async () => {
    vi.mocked(writePendingImage).mockResolvedValue({ draftId: 'draft-retry', path: '/pending/retry.png' });
    await copyImageToStorage('PNG', '', null, DEFAULT_IMAGE_SETTINGS, 'image/png');
    vi.mocked(migratePendingImages).mockRejectedValue(new Error('disk full'));

    await expect(preparePendingImagesForSave('![](/pending/retry.png)', '/docs/guide.md'))
      .rejects.toThrow('disk full');
    expect(cleanupPendingImages).not.toHaveBeenCalled();
    expect(getActiveImageDraftId()).toBe('draft-retry');
  });

  it('holds images pasted during a save until the migrated draft is cleaned', async () => {
    vi.mocked(writePendingImage)
      .mockResolvedValueOnce({ draftId: 'draft-old', path: '/pending/draft-old/old.png' })
      .mockResolvedValueOnce({ draftId: 'draft-new', path: '/pending/draft-new/new.png' });
    const oldReference = await copyImageToStorage('OLD', '', null, DEFAULT_IMAGE_SETTINGS, 'image/png');

    let finishMigration!: (value: {
      draftId: string;
      mappings: Array<{ from: string; to: string }>;
    }) => void;
    vi.mocked(migratePendingImages).mockImplementation(() => new Promise(resolve => {
      finishMigration = resolve;
    }));

    const preparing = preparePendingImagesForSave(`![](${oldReference})`, '/docs/guide.md');
    await vi.waitFor(() => expect(migratePendingImages).toHaveBeenCalledOnce());

    const lateReference = copyImageToStorage('NEW', '', null, DEFAULT_IMAGE_SETTINGS, 'image/png');
    await Promise.resolve();
    expect(writePendingImage).toHaveBeenCalledTimes(1);

    finishMigration({
      draftId: 'draft-old',
      mappings: [{ from: oldReference, to: '/docs/images/old.png' }],
    });
    const prepared = await preparing;
    await completePendingImagesSave(prepared.draftId);

    await expect(lateReference).resolves.toBe('/pending/draft-new/new.png');
    expect(writePendingImage).toHaveBeenNthCalledWith(2, 'img-20260722164030.png', 'NEW', null);
    expect(getActiveImageDraftId()).toBe('draft-new');
  });

  it('converts immediately stored absolute references after the document gets a path', async () => {
    vi.mocked(writeImageToStorage).mockResolvedValue(undefined);
    const settings = {
      ...DEFAULT_IMAGE_SETTINGS,
      customPath: '/Pictures/MarkFlow',
      referenceStyle: 'relative' as const,
    };
    const ref = await copyImageToStorage('PNG', '', null, settings, 'image/png');
    const prepared = await preparePendingImagesForSave(`![](${ref})`, '/docs/guide.md', settings);
    expect(prepared.markdown).toBe('![](../Pictures/MarkFlow/img-20260722164030.png)');
    expect(migratePendingImages).not.toHaveBeenCalled();
  });

  it('ignores discard during save — captured draft prevents data loss on concurrent close', async () => {
    vi.mocked(writePendingImage)
      .mockResolvedValueOnce({ draftId: 'draft-safe', path: '/pending/draft-safe/img.png' });
    await copyImageToStorage('PNG', '', null, DEFAULT_IMAGE_SETTINGS, 'image/png');

    let finishMigration!: (value: { draftId: string; mappings: Array<{ from: string; to: string }> }) => void;
    vi.mocked(migratePendingImages).mockImplementation(() => new Promise(resolve => {
      finishMigration = resolve;
    }));

    // Start a save; migratePendingImages blocks so we can insert the discard
    const preparing = preparePendingImagesForSave(
      '![img](/pending/draft-safe/img.png)',
      '/docs/guide.md',
    );
    await vi.waitFor(() => expect(migratePendingImages).toHaveBeenCalledOnce());

    // Simulate: user closes document during an active save
    await discardActiveImageDraft();

    // Save should not have been silently skipped — migration still runs
    finishMigration!({
      draftId: 'draft-safe',
      mappings: [{ from: '/pending/draft-safe/img.png', to: '/docs/images/img.png' }],
    });
    const prepared = await preparing;
    expect(prepared.markdown).toBe('![img](images/img.png)');
    expect(prepared.draftId).toBe('draft-safe');

    // discardActiveImageDraft should NOT have cleaned up during save
    expect(cleanupPendingImages).not.toHaveBeenCalled();
  });
});
