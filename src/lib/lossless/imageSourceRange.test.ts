/**
 * Lossless image source-range helpers — task 5.3 (unit tests).
 *
 * Pins the exact source-range math for image Markdown under a cursor/selection,
 * including CJK alt text, URLs with query strings, nested spacing, and the
 * boundaries (cursor exactly on `!`, on `)`, or outside the literal).
 */
import { describe, it, expect } from 'vitest';
import {
  findImageAt,
  replaceImageSrcAt,
  deleteImageAt,
} from './imageSourceRange';

describe('findImageAt', () => {
  it('finds a plain image literal under the cursor', () => {
    const doc = 'before ![alt](x.png) after';
    const range = findImageAt(doc, 12); // inside the src
    expect(range).not.toBeNull();
    expect(range!.markdown).toBe('![alt](x.png)');
    expect(range!.start).toBe(7);
    expect(range!.end).toBe(20);
    expect(range!.src.text).toBe('x.png');
    expect(range!.alt.text).toBe('alt');
  });

  it('finds the whole literal when the cursor is on the leading !', () => {
    const doc = '![img](a.png)';
    expect(findImageAt(doc, 0)).not.toBeNull();
  });

  it('finds the whole literal when the cursor is on the closing )', () => {
    const doc = '![img](a.png)';
    const range = findImageAt(doc, doc.length - 1);
    expect(range).not.toBeNull();
    expect(range!.end).toBe(doc.length);
  });

  it('returns the SECOND image when the cursor is in it', () => {
    const doc = '![a](1.png) ![b](2.png)';
    const range = findImageAt(doc, 17); // inside 2.png
    expect(range!.src.text).toBe('2.png');
  });

  it('returns null inside an alt text (not an image occurrence boundary)', () => {
    const doc = '前 ![alt] 后';
    expect(findImageAt(doc, 7)).toBeNull();
  });

  it('handles a URL with a query string', () => {
    const doc = '![x](https://h/e.png?size=100#frag)';
    const range = findImageAt(doc, 20);
    expect(range).not.toBeNull();
    expect(range!.src.text).toBe('https://h/e.png?size=100#frag');
    expect(range!.end).toBe(doc.length);
  });

  it('handles CJK alt text (UTF-16 offsets)', () => {
    const doc = '![你好图片](x.png)';
    const range = findImageAt(doc, 8);
    expect(range).not.toBeNull();
    expect(range!.alt.text).toBe('你好图片');
    expect(range!.src.text).toBe('x.png');
  });

  it('handles an escaped bracket in the alt text', () => {
    const doc = '![a\\]b](x.png)';
    const range = findImageAt(doc, 4);
    expect(range).not.toBeNull();
    expect(range!.markdown).toBe('![a\\]b](x.png)');
  });
});

describe('replaceImageSrcAt', () => {
  it('replaces ONLY the src range (alt and neighbours untouched)', () => {
    const doc = '前 ![alt](old.png) 后';
    const result = replaceImageSrcAt(doc, doc.indexOf('old.png'), 'new.png');
    expect(result).not.toBeNull();
    const { from, to, insert } = result!.change;
    expect(doc.slice(from, to)).toBe('old.png');
    expect(insert).toBe('new.png');
    const applied = doc.slice(0, from) + insert + doc.slice(to);
    expect(applied).toBe('前 ![alt](new.png) 后');
  });

  it('returns null when no image is under the position', () => {
    const doc = 'no image here';
    expect(replaceImageSrcAt(doc, 3, 'x.png')).toBeNull();
  });
});

describe('deleteImageAt', () => {
  it('deletes the exact image literal leaving the rest intact', () => {
    const doc = 'before ![a](x.png) after';
    const result = deleteImageAt(doc, doc.indexOf('x.png'));
    expect(result).not.toBeNull();
    const { from, to } = result!.change;
    expect(doc.slice(from, to)).toBe('![a](x.png)');
    const applied = doc.slice(0, from) + doc.slice(to);
    expect(applied).toBe('before  after');
  });

  it('deleting the only image leaves an empty doc', () => {
    const doc = '![a](x.png)';
    const result = deleteImageAt(doc, 3);
    expect(result).not.toBeNull();
    const applied = doc.slice(0, result!.change.from) + doc.slice(result!.change.to);
    expect(applied).toBe('');
  });
});