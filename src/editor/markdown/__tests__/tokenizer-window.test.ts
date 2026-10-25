import { describe, expect, it } from 'vitest';
import {
  indexOfWithinStartWindow,
  TOKENIZER_START_WINDOW,
} from '../tokenizer-window';

// #411 — block tokenizer `start` callbacks must only inspect the leading
// window of the remaining source; an unbounded scan is quadratic over the
// document because Marked calls `start` at every block boundary.

describe('TOKENIZER_START_WINDOW', () => {
  it('is 64KB (design D1 fixed value)', () => {
    expect(TOKENIZER_START_WINDOW).toBe(64 * 1024);
  });
});

describe('indexOfWithinStartWindow', () => {
  it('behaves like plain indexOf for short sources', () => {
    expect(indexOfWithinStartWindow('abcdef', 'cd')).toBe(2);
    expect(indexOfWithinStartWindow('abcdef', 'zz')).toBe(-1);
    expect(indexOfWithinStartWindow('', 'x')).toBe(-1);
  });

  it('finds a needle at the very end of the window', () => {
    const src = `${'a'.repeat(TOKENIZER_START_WINDOW - 3)}xyz`;
    expect(indexOfWithinStartWindow(src, 'xyz')).toBe(TOKENIZER_START_WINDOW - 3);
  });

  it('returns -1 when the first hit lies beyond the window', () => {
    const src = `${'a'.repeat(TOKENIZER_START_WINDOW)}xyz`;
    expect(indexOfWithinStartWindow(src, 'xyz')).toBe(-1);
  });

  it('keeps reporting the in-window hit even if later hits exist', () => {
    const src = `needle${'a'.repeat(TOKENIZER_START_WINDOW)}needle`;
    expect(indexOfWithinStartWindow(src, 'needle')).toBe(0);
  });
});
