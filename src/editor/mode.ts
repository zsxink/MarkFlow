// ── Mode switching (WYSIWYG ⇄ source) ─────────────────────────────────
// Enters/exits the CodeMirror surface, runs stage-two admission on the way into
// WYSIWYG, and holds the emergency degrade path. Split out of `session.ts` so
// document loading can re-enter source mode without a cycle.

import { logException } from '../infra/logger';
import { uiPorts } from '../infra/ui-ports';
import { store } from '../infra/store';
import { scheduler } from '../infra/task-scheduler';
import { getCachedSettings } from '../infra/storage';
import { decideAdmission, admissionReasonLabel } from './markdown/admission';
import { admissionLimitsFromSettings } from './markdown/eligibility';
import { endOpaqueSession } from './markdown/opaque/session';
import { getMarkdownResult } from './serialize';
import {
  bumpRevision,
  bumpSourceRevision,
  getDocumentState,
  getEditor,
  getMode,
  getRevision,
  getSourceRevision,
  setMarkdownPipelineMode,
  setMode,
  withProgrammaticUpdate,
} from './state';
import {
  createSourceEditor,
  destroySourceEditor,
  getSourceContent,
} from './source-facade';
import { normalizeImageMarkdown } from './serializer';
import { placeCaretAfterContentLoad } from './caret';

export function switchToSource() {
  const ed = getEditor();
  if (!ed) return;
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;

  const serialized = getMarkdownResult();
  if (!serialized.ok) {
    setMarkdownPipelineMode('source-only');
    ed.setEditable(!store.getState().readOnly, false);
    // Never turn a lossy fallback into a source/save candidate. The last
    // persisted baseline is the only safe recovery text in reduced-risk mode.
    uiPorts.notify('Markdown 序列化失败，已恢复到上次安全源码');
    endOpaqueSession();
    enterSourceMode(getDocumentState().lastPersistedMarkdown);
    return;
  }
  ed.setEditable(!store.getState().readOnly, false);
  // Once committed to Source, the opaque session is invalid — a subsequent
  // source edit (or external reload) must re-admit from scratch.
  endOpaqueSession();
  enterSourceMode(serialized.markdown);
}

export function enterSourceMode(content: string) {
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement | null;
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  if (!wysiwygEditor || !wrapper) return;
  const area = document.getElementById('editor-area');
  if (getMode() === 'wysiwyg' && area) {
    getDocumentState().wysiwygScrollTop = area.scrollTop;
    getDocumentState().wysiwygScrollLeft = area.scrollLeft;
  }
  area?.classList.add('source-mode');
  setMarkdownPipelineMode('source-only');
  wysiwygEditor.hidden = true;
  wrapper.hidden = false;
  setMode('source');
  uiPorts.refreshFrontmatter(content);

  // Clear stale scheduler task from any previous CM6 session
  scheduler.cancel('source-update');

  // Create CM6 inside wrapper (respecting read-only state)
  const isReadOnly = store.getState().readOnly;
  void createSourceEditor(wrapper, content, (doc) => {
    bumpRevision();
    bumpSourceRevision();
    store.setState({
      dirty: normalizeImageMarkdown(doc) !== getDocumentState().lastPersistedMarkdown,
    });
    scheduler.schedule('source-update', 50, () => {
      store.emit({ type: 'editor:update' });
    });
  }, isReadOnly).then((view) => {
    // Focus only after CodeMirror has been loaded and mounted.
    view?.focus();
    if (view?.scrollDOM) {
      view.scrollDOM.scrollTop = getDocumentState().sourceScrollTop;
      view.scrollDOM.scrollLeft = getDocumentState().sourceScrollLeft;
    }
  }).catch((error) => {
    uiPorts.notify('源码编辑器加载失败');
    logException('editor.source', 'Failed to load source editor', error);
  });
}

export function switchToWysiwyg() {
  const wysiwygEditor = document.getElementById('wysiwyg-editor');
  const wrapper = document.getElementById('source-editor-wrapper') as HTMLElement;
  if (!wysiwygEditor || !wrapper) return;

  const editor = getEditor();
  if (!editor) return;
  const source = getSourceContent();
  // Source owns exact EOF newlines. Capture its current metadata before
  // parsing so the first WYSIWYG save cannot restore a stale open-time count.
  const trailing = source.match(/\n+$/);
  getDocumentState().trailingNewlines = trailing ? trailing[0].length : 0;
  // Stage-two admission: reject source-only docs without destroying the CM6
  // editor (no disk rewrite, no WYSIWYG surface); admit opaque docs to `opaque`
  // with a verified session.
  // Re-admission replaces the whole document, so remember where the WYSIWYG
  // caret was before the switch in order not to land at the mapped end.
  const previousCaret = editor.state?.selection?.from ?? 1;
  // Admission bounds come from the current settings so a raised limit admits
  // the very next Source→WYSIWYG switch without a restart.
  const admissionLimits = admissionLimitsFromSettings(getCachedSettings());
  const admission = withProgrammaticUpdate(() =>
    decideAdmission(editor, source, {
      sourceRevision: getSourceRevision(),
      userRevisionAtAdmission: getRevision(),
    }, admissionLimits),
  );
  if (admission.mode === 'source-only') {
    setMarkdownPipelineMode('source-only');
    store.setState({ reconcileError: null });
    uiPorts.notify(`已保留源码模式：${admissionReasonLabel(admission.reason, admission.size, admissionLimits)}`);
    return;
  }
  setMarkdownPipelineMode(admission.mode);
  // Keep `lastPersistedMarkdown` as the disk baseline. The current Source
  // value is only an admission baseline; replacing this would make its first
  // save appear unchanged and lose the edit.
  wysiwygEditor.hidden = false;
  wrapper.hidden = true;
  document.getElementById('editor-area')?.classList.remove('source-mode');
  const sourceScroller = document.querySelector<HTMLElement>('#source-editor-wrapper .cm-scroller');
  if (sourceScroller) {
    getDocumentState().sourceScrollTop = sourceScroller.scrollTop;
    getDocumentState().sourceScrollLeft = sourceScroller.scrollLeft;
  }
  destroySourceEditor();
  setMode('wysiwyg');
  const area = document.getElementById('editor-area');
  if (area) {
    area.scrollTop = getDocumentState().wysiwygScrollTop;
    area.scrollLeft = getDocumentState().wysiwygScrollLeft;
  }
  uiPorts.refreshFrontmatter(source);
  placeCaretAfterContentLoad(editor, 'preserve', previousCaret);
  editor.commands.focus();
  // Immediate refresh so outline/statusbar show WYSIWYG data right away
  store.emit({ type: 'editor:update' });
}

/**
 * Emergency kill-switch: degrade any stage-two pipeline mode (`gated` and
 * above) to `source-only`. This clears higher-mode session state and reloads
 * the Source editor from the LAST ORIGINAL SOURCE baseline captured on open —
 * never from the canonicalized editor content — so a forced downgrade can never
 * feed representation work back into Source or write it to disk.
 */
export function degradeToSourceOnly(): void {
  setMarkdownPipelineMode('source-only');
  // Re-enter Source from the last original source baseline.
  enterSourceMode(getDocumentState().lastPersistedMarkdown);
}
