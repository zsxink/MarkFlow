// Lossless CodeMirror source editor — P1B task 3.2/3.4.
//
// A dedicated EditorView for the lossless Core session. It is populated with
// Core logical text (never `setMarkdown` / a serializer) and reports every
// user transaction's change set to the binding's SourceSyncController. Its
// compartments are per-view so it never shares state with the legacy source
// editor (owner isolation, design P1B §5).

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, type Extension, type Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { GFM } from '@lezer/markdown';
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
import { projectionExtension } from './projection';
import { getCachedSettings } from '../storage';

const plainText = new LanguageSupport(StreamLanguage.define({ token() {} } as any));

async function loadLang(name: string): Promise<LanguageSupport> {
  return (await getLanguageExtension(name)) ?? plainText;
}

/** Code-fence languages offered by the lossless source editor. */
const CODE_LANGUAGES = [
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
];

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
  /** Initial mode: 'source' shows raw Markdown; 'preview' adds local
   *  semantic decorations over the SAME EditorState.doc (no doc rewrite). */
  mode?: 'source' | 'preview';
  /** Whether the Live Preview projection is enabled at all (flag-gated). */
  livePreview?: boolean;
  /** Called on every doc-changing user transaction (not programmatic). */
  onTransaction?: (transactions: readonly Transaction[]) => void;
  /** Called for non-authoritative UI refresh after doc changes. */
  onDocChanged?: () => void;
  /** Raw text from the browser paste event, captured before CM normalizes EOLs. */
  onRawPasteText?: (text: string) => void;
  /**
   * Called when image files are pasted/dropped into the lossless surface.
   * The implementation runs the resource pipeline and returns the final image
   * Markdown reference(s), OR null when the bind should be aborted (P3 5.5 /
   * design 04 §6). The editor dispatches each returned Markdown as a local
   * transaction at the caret. Async identity: the editor re-checks that the
   * view is still mounted before dispatching.
   */
  onImageFiles?: (files: File[], mode: 'paste' | 'drop') => Promise<string[] | null>;
}

export interface LosslessSourceEditorHandle {
  view: EditorView;
  /** The current mode. Mode switching only reconfigures compartments — it never
   *  rewrites the doc, never enters History, never rebuilds the EditorView. */
  getMode(): 'source' | 'preview';
  setMode(mode: 'source' | 'preview'): void;
  setLivePreview(enabled: boolean): void;
  setReadOnly(readOnly: boolean): void;
  setHighlight(enabled: boolean): void;
  destroy(): void;
  /** Dispatch a programmatic change WITHOUT firing user-transaction callbacks. */
  replaceDoc(text: string): void;
  doc(): string;
}

export interface LosslessExtensionSet {
  /** Complete array handed to `new EditorView({ extensions })`. */
  extensions: Extension[];
  readOnlyCompartment: Compartment;
  highlightCompartment: Compartment;
  projectionCompartment: Compartment;
  /** Live Preview flag as resolved from the options (default off). */
  livePreviewEnabled: boolean;
  /** Shared destroy flag; the builder's listeners check it before dispatching. */
  lifecycle: { destroyed: boolean };
}

/**
 * Build the extension stack of the lossless source editor.
 *
 * Exported so the P3 command-matrix evidence (task 5.4) runs against the
 * PRODUCT definition instead of a stand-in view: a test that assembles its own
 * `EditorView` cannot detect a regression here. Order matters — `markdown()`
 * installs its keymap at `Prec.high`, so `insertNewlineContinueMarkup` /
 * `deleteMarkupBackward` outrank the Enter/Backspace bindings of `basicSetup`'s
 * `defaultKeymap`. Passing `addKeymap: false` or dropping `Prec.high` would
 * silently degrade list/quote continuation to plain text semantics.
 */
export function buildLosslessExtensions(
  options: LosslessSourceEditorOptions = {},
): LosslessExtensionSet {
  const readOnlyCompartment = new Compartment();
  const highlightCompartment = new Compartment();
  // P2: mode switching is compartment reconfiguration on the SAME EditorView.
  // base = always-present extensions; mode/projection = switchable compartments.
  const projectionCompartment = new Compartment();
  const livePreviewEnabled = options.livePreview ?? false;
  const lifecycle = { destroyed: false };

  const extensions: Extension[] = [
    basicSetup,
    highlightCompartment.of(
      syntaxHighlighting(
        getCachedSettings().codeHighlight === false ? noHighlightStyle : markdownHighlightStyle,
      ),
    ),
    // `addKeymap` defaults to true → `Prec.high(keymap.of(markdownKeymap))`.
    markdown({ extensions: [GFM], codeLanguages: CODE_LANGUAGES, addKeymap: false }),
    EditorView.updateListener.of((update) => {
      if (lifecycle.destroyed) return;
      if (update.docChanged) {
        if (options.onTransaction) options.onTransaction(update.transactions);
        if (options.onDocChanged) options.onDocChanged();
      }
    }),
    EditorView.domEventHandlers({
      paste(event: ClipboardEvent, view: EditorView) {
        // P3 5.5: image files take priority over plain text.
        const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (imageFiles.length > 0 && options.onImageFiles) {
          event.preventDefault();
          const caret = view.state.selection.main.head;
          void options
            .onImageFiles(imageFiles, 'paste')
            .then((markdowns) => {
              if (!markdowns || lifecycle.destroyed) return;
              const insert = markdowns.join('\n');
              view.dispatch({
                changes: { from: caret, to: caret, insert },
                selection: { anchor: caret + insert.length },
                scrollIntoView: true,
                userEvent: 'input.paste',
                annotations: isolateHistory.of('full'),
              });
            })
            .catch(() => {
              // Resource failure → no doc change; user sees no inserted bytes.
            });
          return true;
        }
        // CodeMirror's document is logical LF text. Read the OS clipboard
        // first so the bridge can retain explicit CRLF/CR provenance instead
        // of silently inheriting the surrounding document's EOL style.
        const text = event.clipboardData?.getData('text/plain');
        if (text === undefined || text === '') return false;
        options.onRawPasteText?.(text);

        // P3 5.6: one paste intent = one explicit History group.
        // CM's default paste dispatches with `userEvent: 'input.paste'`, which
        // the history extension MERGES with adjacent typing (`joinableUserEvent`
        // matches `input.paste`). Re-dispatch our own transaction with
        // `isolateHistory: 'full'` so a paste followed by typing Undos as two
        // separate groups, and return `true` to prevent CM's later default
        // paste handler from re-applying the insertion. The change is a single
        // local transaction on the SAME EditorView (owner isolation — never the
        // hidden ProseMirror), so `basicSetup`'s history records it normally.
        const { from, to } = view.state.selection.main;
        // Insert the raw clipboard text. CM normalizes CRLF/CR to the doc's
        // logical LF internally, so the post-change caret must be clamped to
        // the document (the raw length can differ for CRLF pastes).
        const docLen = view.state.doc.length;
        const anchor = Math.min(from + text.length, docLen);
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor },
          scrollIntoView: true,
          userEvent: 'input.paste',
          annotations: isolateHistory.of('full'),
        });
        return true;
      },
      drop(event: DragEvent, view: EditorView) {
        // P3 5.5: image files dropped into the surface.
        const imageFiles = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (imageFiles.length === 0 || !options.onImageFiles) return false;
        event.preventDefault();
        event.stopPropagation();
        const caret = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const insertAt = caret ?? view.state.selection.main.head;
        void options
          .onImageFiles(imageFiles, 'drop')
          .then((markdowns) => {
            if (!markdowns || lifecycle.destroyed) return;
            const insert = markdowns.join('\n');
            view.dispatch({
              changes: { from: insertAt, to: insertAt, insert },
              selection: { anchor: insertAt + insert.length },
              scrollIntoView: true,
              userEvent: 'input.paste',
              annotations: isolateHistory.of('full'),
            });
          })
          .catch(() => undefined);
        return true;
      },
    }),
      highlightLimitPlugin,
      readOnlyCompartment.of(EditorView.editable.of(!(options.readOnly ?? false))),
      // P2 projection compartment: only active in 'preview' mode when the flag
      // is on. Reconfiguring this compartment NEVER changes the doc, the
      // selection, or the History — it only adds/removes semantic decorations.
      projectionCompartment.of(
        livePreviewEnabled && (options.mode ?? 'source') === 'preview'
          ? projectionExtension()
          : [],
      ),
    ];

  return {
    extensions,
    readOnlyCompartment,
    highlightCompartment,
    projectionCompartment,
    livePreviewEnabled,
    lifecycle,
  };
}

/** Create a dedicated lossless source editor view. */
export function createLosslessSourceEditor(
  container: HTMLElement,
  content: string,
  options: LosslessSourceEditorOptions = {},
): LosslessSourceEditorHandle {
  const built = buildLosslessExtensions(options);
  let mode: 'source' | 'preview' = options.mode ?? 'source';

  const view = new EditorView({
    doc: content,
    parent: container,
    extensions: built.extensions,
  });
  view.contentDOM.dataset.testid = 'editor-source-content';

  return {
    view,
    getMode(): 'source' | 'preview' {
      return mode;
    },
    setMode(nextMode: 'source' | 'preview'): void {
      if (nextMode === mode || built.lifecycle.destroyed) return;
      mode = nextMode;
      view.dispatch({
        effects: built.projectionCompartment.reconfigure(
          built.livePreviewEnabled && mode === 'preview' ? projectionExtension() : [],
        ),
      });
    },
    setLivePreview(enabled: boolean): void {
      if (built.lifecycle.destroyed) return;
      // Re-enable/disable the projection without changing mode. When enabled
      // and in preview mode the projection turns on; otherwise it stays off.
      view.dispatch({
        effects: built.projectionCompartment.reconfigure(
          enabled && mode === 'preview' ? projectionExtension() : [],
        ),
      });
    },
    setReadOnly(readOnly: boolean): void {
      view.dispatch({
        effects: built.readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)),
      });
    },
    setHighlight(enabled: boolean): void {
      const style = syntaxHighlighting(
        enabled ? markdownHighlightStyle : noHighlightStyle,
        { fallback: true },
      );
      view.dispatch({ effects: built.highlightCompartment.reconfigure(style) });
      view.dom.classList.toggle('no-code-highlight', !enabled);
    },
    destroy(): void {
      built.lifecycle.destroyed = true;
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
