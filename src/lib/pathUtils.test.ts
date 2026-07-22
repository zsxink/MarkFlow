import { describe, expect, it } from 'vitest';
import {
  getFileName,
  getDocumentBaseName,
  getDocumentNamedImageDir,
  getParentDir,
  resolveImagePath,
  computeRelativePath,
  getImageMimeType,
  normalizeImageStoragePath,
} from './pathUtils';

// ---------------------------------------------------------------------------
// getFileName
// ---------------------------------------------------------------------------

describe('getFileName', () => {
  it('returns the file name from a Unix path', () => {
    expect(getFileName('/home/user/file.md')).toBe('file.md');
  });

  it('returns the file name from a Windows path', () => {
    expect(getFileName('C:\\Users\\user\\file.md')).toBe('file.md');
  });

  it('returns the full string when there is no separator', () => {
    expect(getFileName('file.md')).toBe('file.md');
  });

  it('handles a trailing slash', () => {
    expect(getFileName('/home/user/')).toBe('');
  });

  it('handles paths with mixed separators', () => {
    expect(getFileName('/home/user\\file.md')).toBe('file.md');
  });

  it('returns the last segment for deeply nested paths', () => {
    expect(getFileName('/a/b/c/d/e/f.txt')).toBe('f.txt');
  });
});

describe('document-named image directory', () => {
  it('uses a single sibling directory and removes only the final extension', () => {
    expect(getDocumentBaseName('/docs/README.zh-CN.md')).toBe('README.zh-CN');
    expect(getDocumentNamedImageDir('/docs/guide.md')).toBe('/docs/guide-images');
    expect(getDocumentNamedImageDir('/docs/README.zh-CN.md')).toBe('/docs/README.zh-CN-images');
  });

  it('joins POSIX, Windows and UNC filesystem roots without changing roots', () => {
    expect(getDocumentNamedImageDir('/guide.md')).toBe('/guide-images');
    expect(getDocumentNamedImageDir('C:\\guide.md')).toBe('C:/guide-images');
    expect(getDocumentNamedImageDir('\\\\server\\share\\guide.md'))
      .toBe('//server/share/guide-images');
  });
});

// ---------------------------------------------------------------------------
// getParentDir
// ---------------------------------------------------------------------------

describe('getParentDir', () => {
  it('returns the parent of a file in a Unix path', () => {
    expect(getParentDir('/home/user/file.md')).toBe('/home/user');
  });

  it('returns the parent of a file in a Windows path', () => {
    expect(getParentDir('C:\\Users\\user\\file.md')).toBe('C:\\Users\\user');
  });

  it('returns current directory when there is no separator', () => {
    expect(getParentDir('file.md')).toBe('.');
  });

  it('strips the trailing slash from a directory path', () => {
    expect(getParentDir('/home/user/')).toBe('/home/user');
  });

  it('handles a file in the filesystem root', () => {
    expect(getParentDir('/root.txt')).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// resolveImagePath
// ---------------------------------------------------------------------------

describe('resolveImagePath', () => {
  it('resolves a relative image path against a document path', () => {
    const result = resolveImagePath('images/photo.png', '/docs/page.md');
    expect(result).toBe('/docs/images/photo.png');
  });

  it('resolves a parent-dir relative path', () => {
    const result = resolveImagePath('../assets/photo.png', '/docs/sub/page.md');
    expect(result).toBe('/docs/assets/photo.png');
  });

  it('keeps an absolute Unix path unchanged', () => {
    const result = resolveImagePath('/absolute/photo.png', '/docs/page.md');
    expect(result).toBe('/absolute/photo.png');
  });

  it('keeps a Windows drive-letter path unchanged (normalized to POSIX)', () => {
    const result = resolveImagePath('D:\\photos\\img.png', '/docs/page.md');
    expect(result).toBe('D:/photos/img.png');
  });

  it('handles "./" prefix', () => {
    const result = resolveImagePath('./images/photo.png', '/docs/page.md');
    expect(result).toBe('/docs/images/photo.png');
  });

  it('handles multiple ".." segments', () => {
    const result = resolveImagePath('../../common/photo.png', '/a/b/c/page.md');
    expect(result).toBe('/a/common/photo.png');
  });

  it('handles docPath without a file component (already a directory)', () => {
    const result = resolveImagePath('images/photo.png', '/docs/sub/');
    expect(result).toBe('/docs/sub/images/photo.png');
  });
});

// ---------------------------------------------------------------------------
// computeRelativePath
// ---------------------------------------------------------------------------

describe('computeRelativePath', () => {
  it('computes a relative path in the same directory', () => {
    const result = computeRelativePath('/docs/page.md', '/docs/image.png');
    expect(result).toBe('image.png');
  });

  it('computes a relative path to a nested directory', () => {
    const result = computeRelativePath('/docs/page.md', '/docs/sub/image.png');
    expect(result).toBe('sub/image.png');
  });

  it('computes a relative path to a parent directory', () => {
    const result = computeRelativePath('/docs/sub/page.md', '/docs/image.png');
    expect(result).toBe('../image.png');
  });

  it('computes a relative path for deeply nested structures', () => {
    const result = computeRelativePath(
      '/a/b/c/d/page.md',
      '/a/b/x/y/z/image.png',
    );
    expect(result).toBe('../../x/y/z/image.png');
  });

  it('handles paths with trailing slash on the "from" argument', () => {
    // computeRelativePath calls getParentDir on `from`, so /dir/ becomes /dir
    const result = computeRelativePath('/dir/', '/dir/sub/file.png');
    expect(result).toBe('sub/file.png');
  });

  it('handles docPath with file in root', () => {
    const result = computeRelativePath('/readme.md', '/images/logo.png');
    expect(result).toBe('images/logo.png');
  });

  it('returns an absolute target across Windows drives', () => {
    expect(computeRelativePath('C:\\docs\\readme.md', 'D:\\images\\logo.png'))
      .toBe('D:/images/logo.png');
  });
});

describe('normalizeImageStoragePath', () => {
  it('resolves ./images relative to the document directory', () => {
    expect(normalizeImageStoragePath('./images', '/workspace/docs/readme.md'))
      .toBe('/workspace/docs/images');
  });

  it('normalizes an absolute path without adding the document directory', () => {
    expect(normalizeImageStoragePath('/Users/me/../shared/images', '/workspace/readme.md'))
      .toBe('/Users/shared/images');
  });

  it('preserves Windows and UNC roots while normalizing separators', () => {
    expect(normalizeImageStoragePath('D:\\Pictures\\MarkFlow', '/workspace/readme.md'))
      .toBe('D:/Pictures/MarkFlow');
    expect(normalizeImageStoragePath('\\\\server\\share\\images', '/workspace/readme.md'))
      .toBe('//server/share/images');
  });
});

// ---------------------------------------------------------------------------
// getImageMimeType
// ---------------------------------------------------------------------------

describe('getImageMimeType', () => {
  it('returns image/png for .png files', () => {
    expect(getImageMimeType('photo.png')).toBe('image/png');
  });

  it('returns image/jpeg for .jpg and .jpeg', () => {
    expect(getImageMimeType('photo.jpg')).toBe('image/jpeg');
    expect(getImageMimeType('photo.jpeg')).toBe('image/jpeg');
  });

  it('returns image/gif for .gif files', () => {
    expect(getImageMimeType('animation.gif')).toBe('image/gif');
  });

  it('returns image/webp for .webp files', () => {
    expect(getImageMimeType('image.webp')).toBe('image/webp');
  });

  it('returns image/svg+xml for .svg files', () => {
    expect(getImageMimeType('vector.svg')).toBe('image/svg+xml');
  });

  it('returns image/bmp for .bmp files', () => {
    expect(getImageMimeType('bitmap.bmp')).toBe('image/bmp');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(getImageMimeType('file.unknown')).toBe('application/octet-stream');
  });

  it('returns application/octet-stream when there is no extension', () => {
    expect(getImageMimeType('Makefile')).toBe('application/octet-stream');
  });

  it('is case-insensitive for extension matching', () => {
    expect(getImageMimeType('photo.PNG')).toBe('image/png');
    expect(getImageMimeType('photo.JPG')).toBe('image/jpeg');
  });
});
