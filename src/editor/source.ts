import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, type EditorState } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting, LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { getLanguageExtension, highlightLimitPlugin } from '../render';
import { getCachedSettings } from '../infra/storage';
import { extractFrontmatter } from '../utils/frontmatter';

// Fallback: empty LanguageSupport (plain text) when a language fails to load
const plainText = new LanguageSupport(StreamLanguage.define({ token() {} } as any));

async function loadLang(name: string): Promise<LanguageSupport> {
  return (await getLanguageExtension(name)) ?? plainText;
}

/** Module-level compartments so readOnly, highlight and soft wrap can be toggled at runtime */
const readOnlyCompartment = new Compartment();
const highlightCompartment = new Compartment();
const softWrapCompartment = new Compartment();

// Before the first explicit toggle, use the loaded preference. Remember toggles
// made while no source view exists so they apply to the next session too.
let softWrapEnabled: boolean | undefined;

/** Toggle readOnly on the current source editor without destroying/recreating */
export function setSourceReadOnly(readOnly: boolean): void {
  if (!currentView) return;
  currentView.dispatch({
    effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)),
  });
}

/**
 * Toggle soft line wrapping on the current source editor.
 * Wrapping is a plain content attribute class (`cm-lineWrapping`), so it can be
 * reconfigured in place without recreating the view or losing the cursor.
 */
export function setSourceSoftWrap(enabled: boolean): void {
  softWrapEnabled = enabled;
  if (!currentView) return;
  currentView.dispatch({
    effects: softWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : []),
  });
}

/**
 * Toggle syntax highlighting on the current source editor.
 * When disabled, uses an empty HighlightStyle to render all text in monochrome.
 */
export function setSourceHighlight(enabled: boolean): void {
  if (!currentView) return;
  const style = enabled
    ? syntaxHighlighting(markdownHighlightStyle)
    : syntaxHighlighting(noHighlightStyle);
  currentView.dispatch({
    effects: highlightCompartment.reconfigure(style),
  });
  currentView.dom.classList.toggle('no-code-highlight', !enabled);
}

// ── Syntax highlighting theme ───────────────────────────────────────────
// Uses CSS variable references resolved at runtime (theme-aware for light/dark/sepia).
// Higher precedence (100) ensures it overrides basicSetup's defaultHighlightStyle.

const markdownHighlightStyle = HighlightStyle.define([
  // Source keeps a uniform text grid; hierarchy comes from weight, not scale or color.
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6, tags.heading], color: 'var(--fg)', fontWeight: '600', fontSize: '1em' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--source-marker)' },
  { tag: tags.link, color: 'var(--fg)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  { tag: tags.url, color: 'var(--source-link)' },
  { tag: tags.monospace, fontFamily: 'var(--font-code)' },
  { tag: tags.quote, color: 'var(--fg)' },
  // List tags cover the entire item, so keep its prose at normal weight.
  { tag: tags.list, color: 'var(--fg)', fontWeight: '400' },
  { tag: tags.comment, color: 'var(--source-marker)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.atom], color: 'var(--source-keyword)' },
  { tag: tags.string, color: 'var(--source-string)' },
  { tag: tags.escape, color: 'var(--fg)' },
  { tag: tags.inserted, color: 'var(--source-string)' },
  { tag: tags.deleted, color: 'var(--accent)' },
  { tag: tags.changed, color: 'var(--source-keyword)' },
  { tag: [tags.processingInstruction, tags.separator], color: 'var(--source-marker)', fontWeight: '400' },
]);

const noHighlightStyle = HighlightStyle.define([
  {
    tag: tags.content,
    color: 'var(--fg)',
    fontWeight: '400',
    fontStyle: 'normal',
    textDecoration: 'none',
  },
]);

/** Mark complete document-leading frontmatter with a quiet, neutral surface. */
const frontmatterRegionMarker = ViewPlugin.fromClass(class {
  decorations = this.build('');
  constructor(view: EditorView) { this.decorations = this.build(view.state.doc.toString()); }
  update(update: { docChanged: boolean; state: { doc: { toString(): string } } }) { if (update.docChanged) this.decorations = this.build(update.state.doc.toString()); }
  private build(source: string) {
    const block = extractFrontmatter(source);
    if (!block) return Decoration.none;
    const lines = [];
    for (let from = block.from; from < block.to;) {
      lines.push(Decoration.line({ class: 'cm-frontmatter-line' }).range(from));
      const newline = source.indexOf('\n', from);
      if (newline === -1 || newline + 1 >= block.to) break;
      from = newline + 1;
    }
    return Decoration.set(lines, true);
  }
}, { decorations: value => value.decorations });

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
  // Vite HMR can replace this module and reset `currentView` while leaving the
  // previous CodeMirror DOM mounted. Remove orphaned instances so the visible
  // editor and the state used by save/status always refer to the same view.
  container.querySelectorAll(':scope > .cm-editor').forEach(node => node.remove());

  const settings = getCachedSettings();
  const wrap = softWrapEnabled ?? (settings.softWrap !== false);
  const extList: any[] = [
    basicSetup,
    softWrapCompartment.of(wrap ? EditorView.lineWrapping : []),
    highlightCompartment.of(syntaxHighlighting(
      settings.codeHighlight === false ? noHighlightStyle : markdownHighlightStyle,
    )),
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
      frontmatterRegionMarker,
      readOnlyCompartment.of(EditorView.editable.of(!readOnly)),
    ];

  const view = new EditorView({
    doc: content,
    extensions: extList,
    parent: container,
  });
  view.contentDOM.dataset.testid = 'editor-source-content';

  currentView = view;
  currentView.dom.classList.toggle('no-code-highlight', settings.codeHighlight === false);
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

/** Restore the exact CM state, including history and selection, without parsing. */
export function restoreSourceEditor(container: HTMLElement, state: EditorState): EditorView {
  destroySourceEditor();
  currentView = new EditorView({ state, parent: container });
  currentView.contentDOM.dataset.testid = 'editor-source-content';
  const settings = getCachedSettings();
  setSourceHighlight(settings.codeHighlight !== false);
  setSourceSoftWrap(softWrapEnabled ?? (settings.softWrap !== false));
  return currentView;
}
