/**
 * Mermaid lazy loader — singleton dynamic import.
 * Mermaid is only loaded when a document actually contains ```mermaid``` fences.
 */
import type { default as MermaidType } from 'mermaid';

let promise: Promise<MermaidType> | null = null;

export async function loadMermaid(): Promise<MermaidType> {
  if (!promise) {
    promise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        htmlLabels: false,
      });
      return mod.default;
    });
  }
  return promise;
}
