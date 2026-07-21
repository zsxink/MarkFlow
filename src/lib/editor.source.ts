import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting, LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { getLanguageExtension } from './codemirror-languages';
import { highlightLimitPlugin } from './codemirror-highlight-limit';

// Fallback: empty LanguageSupport (plain text) when a language fails to load
const plainText = new LanguageSupport(StreamLanguage.define({ token() {} } as any));

async function loadLang(name: string): Promise<LanguageSupport> {
  return (await getLanguageExtension(name)) ?? plainText;
}

/** Module-level compartments so readOnly and highlight can be toggled at runtime */
const readOnlyCompartment = new Compartment();
const highlightCompartment = new Compartment();

/** Toggle readOnly on the current source editor without destroying/recreating */
export function setSourceReadOnly(readOnly: boolean): void {
  if (!currentView) return;
  currentView.dispatch({
    effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)),
  });
}

/**
 * Toggle syntax highlighting on the current source editor.
 * When disabled, uses an empty HighlightStyle to render all text in monochrome.
 */
export function setSourceHighlight(enabled: boolean): void {
  if (!currentView) return;
  const style = enabled
    ? syntaxHighlighting(markdownHighlightStyle, { fallback: true })
    : syntaxHighlighting(HighlightStyle.define([]), { fallback: true });
  currentView.dispatch({
    effects: highlightCompartment.reconfigure(style),
  });
}

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
  readOnly: boolean = false,
): EditorView {
  destroySourceEditor();

  const extList: any[] = [
    basicSetup,
    highlightCompartment.of(syntaxHighlighting(markdownHighlightStyle)),
    markdown({ codeLanguages: [
        LanguageDescription.of({ name: 'javascript', extensions: ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'], load: () => loadLang('javascript') }),
        LanguageDescription.of({ name: 'css',        extensions: ['css', 'scss', 'less'],     load: () => loadLang('css') }),
        LanguageDescription.of({ name: 'html',       extensions: ['html', 'htm', 'svg'],      load: () => loadLang('html') }),
        LanguageDescription.of({ name: 'python',     extensions: ['py', 'python'],            load: () => loadLang('python') }),
        LanguageDescription.of({ name: 'java',       extensions: ['java'],                    load: () => loadLang('java') }),
        LanguageDescription.of({ name: 'rust',       extensions: ['rs', 'rust'],              load: () => loadLang('rust') }),
        LanguageDescription.of({ name: 'go',         extensions: ['go'],                      load: () => loadLang('go') }),
        LanguageDescription.of({ name: 'json',       extensions: ['json'],                    load: () => loadLang('json') }),
        LanguageDescription.of({ name: 'yaml',       extensions: ['yaml', 'yml'],             load: () => loadLang('yaml') }),
        LanguageDescription.of({ name: 'sql',        extensions: ['sql'],                     load: () => loadLang('sql') }),
        LanguageDescription.of({ name: 'xml',        extensions: ['xml', 'xsl', 'xslt'],      load: () => loadLang('xml') }),
        LanguageDescription.of({ name: 'shell', alias: ['bash', 'sh', 'zsh', 'fish'], extensions: ['sh', 'bash'], load: () => loadLang('shell') }),
      ] }),
      EditorView.updateListener.of(update => {
        if (update.docChanged && onUpdate && !programmaticUpdate) {
          onUpdate(update.state.doc.toString());
        }
      }),
      highlightLimitPlugin,
      readOnlyCompartment.of(EditorView.editable.of(!readOnly)),
    ];

  const view = new EditorView({
    doc: content,
    extensions: extList,
    parent: container,
  });
  view.contentDOM.dataset.testid = 'editor-source-content';

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

