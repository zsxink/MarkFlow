import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, LanguageDescription, StreamLanguage, LanguageSupport } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { shell } from '@codemirror/legacy-modes/mode/shell';

// ── Syntax highlighting theme ───────────────────────────────────────────
// Uses CSS variable references resolved at runtime (theme-aware for light/dark/sepia).
// Higher precedence (100) ensures it overrides basicSetup's defaultHighlightStyle.

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--accent)', fontWeight: '700', fontSize: '1.4em' },
  { tag: tags.heading2, color: 'var(--accent)', fontWeight: '700', fontSize: '1.25em' },
  { tag: tags.heading3, color: 'var(--accent)', fontWeight: '700', fontSize: '1.1em' },
  { tag: tags.heading4, color: 'var(--accent)', fontWeight: '700' },
  { tag: tags.heading5, color: 'var(--accent)', fontWeight: '700' },
  { tag: tags.heading6, color: 'var(--accent)', fontWeight: '700' },
  { tag: tags.heading, color: 'var(--accent)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent)', opacity: '0.7' },
  { tag: tags.monospace, fontFamily: 'var(--font-code)', borderRadius: '3px', padding: '0 4px' },
  { tag: tags.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--accent)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--accent)' },
  { tag: tags.atom, color: 'var(--accent)', opacity: '0.8' },
  { tag: tags.escape, color: 'var(--accent)', fontWeight: '600' },
  { tag: tags.inserted, color: '#2ecc71' },
  { tag: tags.deleted, color: '#e74c3c' },
  { tag: tags.changed, color: '#f39c12' },
  { tag: tags.separator, color: 'var(--muted)' },
]);

// ── Module-level state ────────────────────────────────────────────────

let currentView: EditorView | null = null;

// ── Programmatic update guard ────────────────────────────────────────
// When true, updateListener should not propagate changes to external state
let programmaticUpdate = false;

// ── Create ────────────────────────────────────────────────────────────

/**
 * Create a CodeMirror 6 editor in the given container.
 * Destroys any previous instance first.
 */
export function createSourceEditor(
  container: HTMLElement,
  content: string,
  onUpdate: ((doc: string) => void) | null = null,
): EditorView {
  destroySourceEditor();

  const view = new EditorView({
    doc: content,
    extensions: [
      basicSetup,
      syntaxHighlighting(markdownHighlightStyle),
      markdown({ codeLanguages: [
        LanguageDescription.of({ name: 'javascript', extensions: ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'], load: () => Promise.resolve(javascript()) }),
        LanguageDescription.of({ name: 'css',        extensions: ['css', 'scss', 'less'],     load: () => Promise.resolve(css()) }),
        LanguageDescription.of({ name: 'html',       extensions: ['html', 'htm', 'svg'],      load: () => Promise.resolve(html()) }),
        LanguageDescription.of({ name: 'python',     extensions: ['py', 'python'],            load: () => Promise.resolve(python()) }),
        LanguageDescription.of({ name: 'java',       extensions: ['java'],                    load: () => Promise.resolve(java()) }),
        LanguageDescription.of({ name: 'rust',       extensions: ['rs', 'rust'],              load: () => Promise.resolve(rust()) }),
        LanguageDescription.of({ name: 'go',         extensions: ['go'],                      load: () => Promise.resolve(go()) }),
        LanguageDescription.of({ name: 'json',       extensions: ['json'],                    load: () => Promise.resolve(json()) }),
        LanguageDescription.of({ name: 'yaml',       extensions: ['yaml', 'yml'],             load: () => Promise.resolve(yaml()) }),
        LanguageDescription.of({ name: 'sql',        extensions: ['sql'],                     load: () => Promise.resolve(sql()) }),
        LanguageDescription.of({ name: 'xml',        extensions: ['xml', 'xsl', 'xslt'],      load: () => Promise.resolve(xml()) }),
        LanguageDescription.of({ name: 'shell', alias: ['bash', 'sh', 'zsh', 'fish'], extensions: ['sh', 'bash'], load: () => Promise.resolve(new LanguageSupport(StreamLanguage.define(shell))) }),
      ] }),
      EditorView.updateListener.of(update => {
        if (update.docChanged && onUpdate && !programmaticUpdate) {
          onUpdate(update.state.doc.toString());
        }
      }),
    ],
    parent: container,
  });

  currentView = view;
  return view;
}

// ── Destroy ───────────────────────────────────────────────────────────

export function destroySourceEditor(): void {
  if (currentView) {
    currentView.destroy();
    currentView = null;
  }
}

// ── Read ──────────────────────────────────────────────────────────────

export function getSourceView(): EditorView | null {
  return currentView;
}

export function getSourceContent(): string {
  return currentView?.state.doc.toString() ?? '';
}

/** Get raw content without trailing newline removal (for dirty checks where exact match matters) */
export function getRawSourceContent(): string {
  return currentView?.state.doc.toString() ?? '';
}

// ── Write ─────────────────────────────────────────────────────────────

export function setSourceContent(content: string): void {
  if (!currentView) return;
  programmaticUpdate = true;
  try {
    const { state } = currentView;
    currentView.dispatch({
      changes: { from: 0, to: state.doc.length, insert: content },
    });
  } finally {
    programmaticUpdate = false;
  }
}


