// Lossless CodeMirror source editor — P1B task 3.2/3.4.
//
// A dedicated EditorView for the lossless Core session. It is populated with
// Core logical text (never `setMarkdown` / a serializer) and reports every
// user transaction's change set to the binding's SourceSyncController. Its
// compartments are per-view so it never shares state with the legacy source
// editor (owner isolation, design P1B §5).

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, type Transaction } from '@codemirror/state';
import {
  HighlightStyle,
  syntaxHighlighting,
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { getLanguageExtension } from '../codemirror-languages';
import { highlightLimitPlugin } from '../codemirror-highlight-limit';
import { getCachedSettings } from '../storage';

const plainText = new LanguageSupport(StreamLanguage.define({ token() {} } as any));

async function loadLang(name: string): Promise<LanguageSupport> {
  return (await getLanguageExtension(name)) ?? plainText;
}

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

const noHighlightStyle = HighlightStyle.define([
  { tag: tags.content, color: 'var(--fg)', fontWeight: '400', fontStyle: 'normal', textDecoration: 'none' },
]);

export interface LosslessSourceEditorOptions {
  readOnly?: boolean;
  /** Called on every doc-changing user transaction (not programmatic). */
  onTransaction?: (transactions: readonly Transaction[]) => void;
  /** Called for non-authoritative UI refresh after doc changes. */
  onDocChanged?: () => void;
  /** Raw text from the browser paste event, captured before CM normalizes EOLs. */
  onRawPasteText?: (text: string) => void;
}

export interface LosslessSourceEditorHandle {
  view: EditorView;
  setReadOnly(readOnly: boolean): void;
  setHighlight(enabled: boolean): void;
  destroy(): void;
  /** Dispatch a programmatic change WITHOUT firing user-transaction callbacks. */
  replaceDoc(text: string): void;
  doc(): string;
}

/** Create a dedicated lossless source editor view. */
export function createLosslessSourceEditor(
  container: HTMLElement,
  content: string,
  options: LosslessSourceEditorOptions = {},
): LosslessSourceEditorHandle {
  const readOnlyCompartment = new Compartment();
  const highlightCompartment = new Compartment();
  let destroyed = false;

  const view = new EditorView({
    doc: content,
    parent: container,
    extensions: [
      basicSetup,
      highlightCompartment.of(
        syntaxHighlighting(
          getCachedSettings().codeHighlight === false ? noHighlightStyle : markdownHighlightStyle,
        ),
      ),
      markdown({
        codeLanguages: [
          LanguageDescription.of({
            name: 'javascript',
            extensions: ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'],
            load: () => loadLang('javascript'),
          }),
          LanguageDescription.of({
            name: 'css',
            extensions: ['css', 'scss', 'less'],
            load: () => loadLang('css'),
          }),
          LanguageDescription.of({
            name: 'html',
            extensions: ['html', 'htm', 'svg'],
            load: () => loadLang('html'),
          }),
          LanguageDescription.of({
            name: 'python',
            extensions: ['py', 'python'],
            load: () => loadLang('python'),
          }),
          LanguageDescription.of({
            name: 'java',
            extensions: ['java'],
            load: () => loadLang('java'),
          }),
          LanguageDescription.of({
            name: 'rust',
            extensions: ['rs', 'rust'],
            load: () => loadLang('rust'),
          }),
          LanguageDescription.of({
            name: 'go',
            extensions: ['go'],
            load: () => loadLang('go'),
          }),
          LanguageDescription.of({
            name: 'json',
            extensions: ['json'],
            load: () => loadLang('json'),
          }),
          LanguageDescription.of({
            name: 'yaml',
            extensions: ['yaml', 'yml'],
            load: () => loadLang('yaml'),
          }),
          LanguageDescription.of({
            name: 'sql',
            extensions: ['sql'],
            load: () => loadLang('sql'),
          }),
          LanguageDescription.of({
            name: 'xml',
            extensions: ['xml', 'xsl', 'xslt'],
            load: () => loadLang('xml'),
          }),
          LanguageDescription.of({
            name: 'shell',
            alias: ['bash', 'sh', 'zsh', 'fish'],
            extensions: ['sh', 'bash'],
            load: () => loadLang('shell'),
          }),
        ],
      }),
      EditorView.updateListener.of((update) => {
        if (destroyed) return;
        if (update.docChanged) {
          if (options.onTransaction) options.onTransaction(update.transactions);
          if (options.onDocChanged) options.onDocChanged();
        }
      }),
      EditorView.domEventHandlers({
        paste(event: ClipboardEvent) {
          // CodeMirror's document is logical LF text. Read the OS clipboard
          // first so the bridge can retain explicit CRLF/CR provenance instead
          // of silently inheriting the surrounding document's EOL style.
          const text = event.clipboardData?.getData('text/plain');
          if (text !== undefined && text !== '') options.onRawPasteText?.(text);
          return false; // let CodeMirror perform its normal single transaction
        },
      }),
      highlightLimitPlugin,
      readOnlyCompartment.of(EditorView.editable.of(!(options.readOnly ?? false))),
    ],
  });
  view.contentDOM.dataset.testid = 'editor-source-content';

  return {
    view,
    setReadOnly(readOnly: boolean): void {
      view.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)),
      });
    },
    setHighlight(enabled: boolean): void {
      const style = syntaxHighlighting(
        enabled ? markdownHighlightStyle : noHighlightStyle,
        { fallback: true },
      );
      view.dispatch({ effects: highlightCompartment.reconfigure(style) });
      view.dom.classList.toggle('no-code-highlight', !enabled);
    },
    destroy(): void {
      destroyed = true;
      view.destroy();
    },
    replaceDoc(text: string): void {
      // Programmatic replace — deliberately does NOT fire onTransaction (no user
      // intent), matching the legacy `programmaticUpdate` guard.
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    doc(): string {
      return view.state.doc.toString();
    },
  };
}
