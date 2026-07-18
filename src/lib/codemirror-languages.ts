/**
 * CodeMirror language lazy loader.
 * Languages are only loaded on first use, keeping the main bundle small.
 */
import type { LanguageSupport } from '@codemirror/language';

const LOADERS: Record<string, () => Promise<LanguageSupport>> = {
  javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  css:        () => import('@codemirror/lang-css').then(m => m.css()),
  html:       () => import('@codemirror/lang-html').then(m => m.html()),
  python:     () => import('@codemirror/lang-python').then(m => m.python()),
  java:       () => import('@codemirror/lang-java').then(m => m.java()),
  rust:       () => import('@codemirror/lang-rust').then(m => m.rust()),
  go:         () => import('@codemirror/lang-go').then(m => m.go()),
  json:       () => import('@codemirror/lang-json').then(m => m.json()),
  yaml:       () => import('@codemirror/lang-yaml').then(m => m.yaml()),
  sql:        () => import('@codemirror/lang-sql').then(m => m.sql()),
  xml:        () => import('@codemirror/lang-xml').then(m => m.xml()),
  shell:      () => import('@codemirror/legacy-modes/mode/shell').then(m =>
    import('@codemirror/language').then(lang => new lang.LanguageSupport(lang.StreamLanguage.define(m.shell)))
  ),
};

const loaded = new Map<string, LanguageSupport>();
const loading = new Map<string, Promise<LanguageSupport | null>>();

export async function getLanguageExtension(name: string): Promise<LanguageSupport | null> {
  if (loaded.has(name)) return loaded.get(name)!;
  const loader = LOADERS[name];
  if (!loader) return null;

  let pending = loading.get(name);
  if (!pending) {
    pending = loader()
      .then(ext => {
        loaded.set(name, ext);
        return ext;
      })
      .catch(() => null) // fallback to plain text
      .finally(() => loading.delete(name));
    loading.set(name, pending);
  }
  return pending;
}

/** Check if a language has a lazy loader (for LanguageDescription). */
export function hasLanguageLoader(name: string): boolean {
  return name in LOADERS;
}
