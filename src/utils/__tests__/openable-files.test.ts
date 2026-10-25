import { describe, expect, it } from 'vitest';
import { IMAGE_EXTENSIONS, classifyOpenableFile, isFileBrowserSupported } from '../openable-files';

describe('classifyOpenableFile', () => {
  it('classifies markdown documents case-insensitively', () => {
    expect(classifyOpenableFile('note.md')).toBe('markdown');
    expect(classifyOpenableFile('README.MD')).toBe('markdown');
  });

  it('classifies the seven image extensions case-insensitively', () => {
    expect(IMAGE_EXTENSIONS).toEqual(['svg', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
    expect(classifyOpenableFile('icon.svg')).toBe('image');
    expect(classifyOpenableFile('photo.jpg')).toBe('image');
    expect(classifyOpenableFile('photo.JPEG')).toBe('image');
    expect(classifyOpenableFile('photo.png')).toBe('image');
    expect(classifyOpenableFile('anim.gif')).toBe('image');
    expect(classifyOpenableFile('anim.WebP')).toBe('image');
    expect(classifyOpenableFile('scan.BMP')).toBe('image');
  });

  it('uses the last dot so multi-dot names classify by their final suffix', () => {
    expect(classifyOpenableFile('a.b.png')).toBe('image');
    expect(classifyOpenableFile('archive.tar.md')).toBe('markdown');
    expect(classifyOpenableFile('photo.png.txt')).toBe('unsupported');
  });

  it('marks other formats and extensionless names unsupported', () => {
    expect(classifyOpenableFile('data.txt')).toBe('unsupported');
    expect(classifyOpenableFile('table.csv')).toBe('unsupported');
    expect(classifyOpenableFile('app.exe')).toBe('unsupported');
    expect(classifyOpenableFile('noextension')).toBe('unsupported');
    expect(classifyOpenableFile('trailing.')).toBe('unsupported');
  });

  it('exposes the browser support predicate from the same classification', () => {
    expect(isFileBrowserSupported('x.md')).toBe(true);
    expect(isFileBrowserSupported('x.PNG')).toBe(true);
    expect(isFileBrowserSupported('x.txt')).toBe(false);
    expect(isFileBrowserSupported('x')).toBe(false);
  });
});
