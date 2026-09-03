/**
 * KaTeX lazy loader — singleton dynamic import.
 * KaTeX is only loaded when a document actually contains $..$ or $$..$$ formulas.
 */
import type katex from 'katex';

let promise: Promise<typeof katex> | null = null;

export async function loadKatex(): Promise<typeof katex> {
  if (!promise) {
    promise = import('katex').then((mod) => mod.default);
  }
  return promise;
}
