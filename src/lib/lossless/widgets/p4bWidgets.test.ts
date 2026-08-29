// P4B task 7.4 — task checkbox + code fence controls widget pilot tests.
//
// Machine-verifiable coverage per widget (task 7.7):
//   - range mathematics (Lezer-derived, CJK/emoji safe, never DOM textContent);
//   - commit = EXACT LOCAL source patch (only the marker / lang token bytes)
//     + a single History boundary;
//   - History Undo restores the original marker/selection;
//   - flag OFF ⇒ no widget DOM, no owner switch;
//   - teardown restores the local owner;
//   - failure injection ⇒ exact-source degradation (no crash, doc untouched);
//   - DOM integration on a REAL EditorView: click dispatches the right source
//     patch, `.cm-content` remains the source bytes, read-only renders disabled
//     and never commits;
//   - un-touched-bytes assertions (adjacent lines, rest of info string, code
//     body survive byte-for-byte).
//
// The desktop suite (`e2e/specs/lossless/p4b-widgets.e2e.mjs`) additionally
// drives the real WebView through the E2E hooks; that suite is marked
// PENDING-MANUAL/ENV like its 7.1/7.2 sibling.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { undo } from '@codemirror/commands';
import { createLosslessSourceEditor } from '../losslessSourceEditor';
import {
  fenceControlsDescriptor,
  fenceLanguageCommit,
  fenceSourceRangeSet,
  isWidgetFailMode,
  nextLanguage,
  setWidgetFailMode,
  sourceSlice,
  taskCheckboxCommit,
  taskCheckboxDescriptor,
  taskSourceRangeSet,
  taskTogglePatch,
  teardownP4bWidgets,
  widgetProjectionExtension,
  WIDGET_CLASSES,
} from './p4bWidgets';
import { fenceTargetFromState, taskTargetFromState } from './widgetSource';
import { setP4bFlagEnabled, resetAllCohortFlags, cohortFlagClosure } from '../cohortFlags';
import { resetOwnerRegistry, resolveConstructOwner, registerConstructOwner } from '../renderOwnerRegistry';
import type { EditorSelection, EditorState } from '@codemirror/state';

// The widget extension is ASSERTED to be wired into the lossless editor below;
// this import keeps the contract import-side (it is the same module the editor
// consumes in `losslessSourceEditor.ts`).
void widgetProjectionExtension;

const TASK_DOC = [
  '- [ ] 中文任务',
  '- [x] done it 🚀',
  '',
  'plain paragraph',
  '',
].join('\n');

const FENCE_DOC = [
  '```js title="keep"',
  'const x = 1;',
  '```',
  '',
  '```',
  'plain',
  '```',
  '',
  'outside text',
  '',
].join('\n');

type Harness = {
  view: ReturnType<typeof createLosslessSourceEditor>['view'];
  handle: ReturnType<typeof createLosslessSourceEditor>;
  destroy(): void;
};

/** A preview-mode lossless editor (the same product assembly the binding uses). */
function makePreviewView(doc: string): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const handle = createLosslessSourceEditor(parent, doc, {
    livePreview: true,
    mode: 'preview',
  });
  return {
    view: handle.view,
    handle,
    destroy: () => handle.destroy(),
  };
}

function markerRange(doc: string, marker: string): { from: number; to: number } {
  const idx = doc.indexOf(marker);
  if (idx === -1) throw new Error(`marker ${marker} not found in doc`);
  return { from: idx, to: idx + marker.length };
}

/** Build a protocol commit context for the given anchor. */
function ctxFor(state: EditorState, anchor: number) {
  const selection: EditorSelection = { main: { anchor, head: anchor, empty: true, assoc: 0 } } as unknown as EditorSelection;
  return {
    state,
    selection,
    identity: { bindingGeneration: 1, sessionId: 1, documentId: 1, revision: 0 },
  };
}

/** Dispatch a widget commit spec (isolateHistory intact). */
function dispatchCommit(view: ReturnType<typeof createLosslessSourceEditor>['view'], spec: import('@codemirror/state').TransactionSpec[]): void {
  for (const s of spec) view.dispatch(s);
}

/** The single change of a widget patch (the ONLY source mutation). */
function changeOf(spec: import('@codemirror/state').TransactionSpec[]): { from: number; to: number; insert: string } {
  const s = spec[0] as unknown as { changes: Array<{ from: number; to: number; insert: string }> };
  return s.changes[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('P4B task 7.4 — task checkbox', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    resetOwnerRegistry();
    setWidgetFailMode('none');
  });
  afterEach(() => {
    resetAllCohortFlags();
    resetOwnerRegistry();
    document.body.innerHTML = '';
    setWidgetFailMode('none');
  });

  describe('protocol descriptor', () => {
    it('defines and registers the descriptor with the full contract', () => {
      expect(taskCheckboxDescriptor.id).toBe('task-checkbox');
      expect(taskCheckboxDescriptor.kind).toBe('checkbox');
      expect(taskCheckboxDescriptor.ownerKind).toBe('listItem');
      expect(taskCheckboxDescriptor.flag).toBe('taskCheckbox');
      expect(taskCheckboxDescriptor.label).toBe('p4b.task-checkbox');
      expect(taskCheckboxDescriptor.surface.type).toBe('control');
      expect(typeof taskCheckboxDescriptor.commit).toBe('function');
      expect(taskCheckboxDescriptor.interaction.readOnly).toBe('disabled');
      expect(taskCheckboxDescriptor.security.allowsUnsafeHtml).toBe(false);
      expect(taskCheckboxDescriptor.security.externalNetworkGated).toBe(false);
      expect(taskCheckboxDescriptor.print.default).toBe('source');
      expect(taskCheckboxDescriptor.fallbackBehavior).toBe('exact-source');
      expect(Object.isFrozen(taskCheckboxDescriptor)).toBe(true);
      // The source range set shape is valid in-doc.
      const target = taskTargetFromState(
        (() => {
          const h = makePreviewView(TASK_DOC);
          const s = h.view.state;
          h.destroy();
          return s;
        })(),
        TASK_DOC.indexOf('- [ ]') + 3,
      )!;
      expect(assertRangeValid(taskSourceRangeSet(target), TASK_DOC.length)).toBe(true);
    });
  });

  describe('range math', () => {
    it('resolves Task → TaskMarker source ranges from Lezer, never textContent', () => {
      const { view, destroy } = makePreviewView(TASK_DOC);
      const commit = taskCheckboxCommit(view.state, TASK_DOC.indexOf('- [ ]') + 3);
      expect(commit).not.toBeNull();
      const change = changeOf(commit!.spec);
      expect(TASK_DOC.slice(change.from, change.to)).toBe('[ ]');

      const checkedAnchor = TASK_DOC.indexOf('- [x]') + 3;
      const target = taskTargetFromState(view.state, checkedAnchor);
      expect(target).not.toBeNull();
      expect(target!.checked).toBe(true);
      expect(target!.marker).toEqual({ from: TASK_DOC.indexOf('[x]'), to: TASK_DOC.indexOf('[x]') + 3 });
      destroy();
    });

    it('CJK/emoji nearby does not shift the marker span (UTF-16 stable)', () => {
      const { view, destroy } = makePreviewView(TASK_DOC);
      const markerFrom = TASK_DOC.indexOf('[x]');
      expect(TASK_DOC.slice(markerFrom, markerFrom + 3)).toBe('[x]');
      const commit = taskCheckboxCommit(view.state, markerFrom + 1);
      expect(commit).not.toBeNull();
      expect(TASK_DOC.slice(changeOf(commit!.spec).from, changeOf(commit!.spec).to)).toBe('[x]');
      destroy();
    });

    it('returns null outside a task item (plain paragraph / no marker)', () => {
      const { view, destroy } = makePreviewView(TASK_DOC);
      const plainPos = TASK_DOC.indexOf('plain paragraph');
      expect(taskCheckboxCommit(view.state, plainPos)).toBeNull();
      expect(taskCheckboxCommit(view.state, 0)).toBeNull();
      expect(taskCheckboxCommit(view.state, view.state.doc.length)).toBeNull();
      destroy();
    });
  });

  describe('commit = exact local source patch', () => {
    it('toggles [ ] → [x] with a 3-byte local patch + single History boundary', () => {
      const { view, destroy } = makePreviewView(TASK_DOC);
      const before = view.state.doc.toString();
      const { from } = markerRange(before, '[ ]');
      const commit = taskCheckboxCommit(view.state, from + 1);
      expect(commit).not.toBeNull();
      expect(commit!.undoable).toBe(true);
      expect(commit!.userEvent).toBe('widget.task-checkbox.toggle');
      expect(commit!.spec[0].annotations).toBeDefined(); // isolateHistory

      dispatchCommit(view, commit!.spec);
      const after = view.state.doc.toString();
      // ONLY the 3 marker bytes changed.
      expect(after.slice(0, from)).toBe(before.slice(0, from));
      expect(after.slice(from + 3)).toBe(before.slice(from + 3));
      expect(after).toBe(before.replace('[ ]', '[x]'));
      destroy();
    });

    it('toggles [x] → [ ] preserving the item case (upper [X] → [ ] too)', () => {
      const doc = '- [X] KEEP\n- [x] lower\n';
      const { view, destroy } = makePreviewView(doc);
      const upper = doc.indexOf('[X]');
      const c1 = taskCheckboxCommit(view.state, upper + 1);
      expect(c1).not.toBeNull();
      expect(doc.slice(changeOf(c1!.spec).from, changeOf(c1!.spec).to)).toBe('[X]');
      expect(changeOf(c1!.spec).insert).toBe('[ ]');

      const lower = doc.indexOf('[x]');
      const c2 = taskCheckboxCommit(view.state, lower + 1);
      expect(c2).not.toBeNull();
      expect(changeOf(c2!.spec).insert).toBe('[ ]');
      destroy();
    });

    it('taskTogglePatch never targets outside the 3 marker bytes', () => {
      expect(taskTogglePatch(10, '[ ]')).toEqual({
        changes: [{ from: 10, to: 13, insert: '[x]' }],
        selection: { anchor: 10 },
      });
      expect(taskTogglePatch(10, '[X]')).toEqual({
        changes: [{ from: 10, to: 13, insert: '[ ]' }],
        selection: { anchor: 10 },
      });
      expect(taskTogglePatch(10, 'nope')).toBeNull();
    });
  });

  describe('History boundary', () => {
    it('one Undo restores the original marker and selection', () => {
      const { view, destroy } = makePreviewView(TASK_DOC);
      const { from } = markerRange(TASK_DOC, '[ ]');
      const commit = taskCheckboxCommit(view.state, from + 1);
      dispatchCommit(view, commit!.spec);
      expect(view.state.doc.toString()).toContain('[x]');
      undo(view);
      expect(view.state.doc.toString()).toBe(TASK_DOC);
      destroy();
    });
  });

  describe('flag OFF / teardown / failure', () => {
    it('flag OFF ⇒ no widget owner; teardown restores the local owner', () => {
      resetAllCohortFlags();
      expect(resolveConstructOwner('listItem').owner).toBe('local');

      // `p4bWidgets` registers its owners at MODULE INIT; `beforeEach`
      // `resetOwnerRegistry()` wipes those (static default registry), matching
      // the `cohortFlags.test.ts` pattern of registering explicitly in-test —
      // against the same flag closure the widget uses in production.
      const unregister = registerConstructOwner('listItem', 'widget', {
        label: 'p4b.task-checkbox',
        flag: cohortFlagClosure('taskCheckbox'),
      });
      setP4bFlagEnabled('taskCheckbox', true);
      expect(resolveConstructOwner('listItem').owner).toBe('widget');
      expect(resolveConstructOwner('listItem').source).toBe('p4b.task-checkbox');

      setP4bFlagEnabled('taskCheckbox', false);
      expect(resolveConstructOwner('listItem').owner).toBe('local');

      unregister();
      teardownP4bWidgets();
      expect(resolveConstructOwner('listItem').owner).toBe('local');
    });

    it('failure injection degrades the widget build without breaking the doc', () => {
      setWidgetFailMode('always');
      const { view, destroy } = makePreviewView(TASK_DOC);
      expect(view.state.doc.toString()).toBe(TASK_DOC);
      expect(isWidgetFailMode()).toBe('always');
      destroy();
    });
  });

  describe('DOM integration on a real EditorView', () => {
    it('renders live checkboxes with a11y; .cm-content stays the source bytes', async () => {
      // Enable the flag BEFORE the view mounts so the plugin's constructor
      // builds the widgets (a flag flip after mount is not an update signal).
      setP4bFlagEnabled('taskCheckbox', true);
      const { view, destroy } = makePreviewView(TASK_DOC);
      const widgets = view.contentDOM.querySelectorAll(`.${WIDGET_CLASSES.taskCheckbox}`);
      expect(widgets.length).toBeGreaterThan(0);
      const w = widgets[0] as HTMLElement;
      expect(w.getAttribute('role')).toBe('checkbox');
      expect(w.getAttribute('aria-checked')).toBe('false');
      expect(w.getAttribute('aria-label')).toContain('中文任务');
      // The source bytes are still in .cm-content (lossless: never rewritten).
      expect(view.contentDOM.textContent ?? '').toContain('[ ]');
      expect(view.state.doc.toString()).toBe(TASK_DOC);
      destroy();
    });

    it('clicking the checkbox dispatches the exact 3-byte marker patch', async () => {
      setP4bFlagEnabled('taskCheckbox', true);
      const { view, destroy } = makePreviewView(TASK_DOC);
      const firstMarker = markerRange(TASK_DOC, '[ ]').from;
      const w = view.contentDOM.querySelector<HTMLElement>(`.${WIDGET_CLASSES.taskCheckbox}[data-marker-from="${firstMarker}"]`);
      expect(w).not.toBeNull();
      w!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(0);
      const after = view.state.doc.toString();
      expect(after).toBe(TASK_DOC.replace('[ ]', '[x]'));
      destroy();
    });

    it('read-only renders disabled widgets and a click never commits', async () => {
      setP4bFlagEnabled('taskCheckbox', true);
      const { view, handle, destroy } = makePreviewView(TASK_DOC);
      // Flipping editability re-renders the widgets (disabled) via the plugin's
      // rebuilder, so the DOM is fresh when the widget is read.
      handle.setReadOnly(true);
      view.dispatch({});
      await sleep(0);
      const w = view.contentDOM.querySelector<HTMLElement>(`.${WIDGET_CLASSES.taskCheckbox}`);
      expect(w).not.toBeNull();
      if (w) {
        expect(w.hasAttribute('aria-disabled')).toBe(true);
        w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      await sleep(0);
      expect(view.state.doc.toString()).toBe(TASK_DOC);
      destroy();
    });
  });
});

describe('P4B task 7.4 — code fence controls', () => {
  beforeEach(() => {
    resetAllCohortFlags();
    resetOwnerRegistry();
    setWidgetFailMode('none');
  });
  afterEach(() => {
    resetAllCohortFlags();
    resetOwnerRegistry();
    document.body.innerHTML = '';
    setWidgetFailMode('none');
  });

  describe('protocol descriptor', () => {
    it('defines and registers the descriptor with the full contract', () => {
      expect(fenceControlsDescriptor.id).toBe('code-fence-controls');
      expect(fenceControlsDescriptor.kind).toBe('fence-language');
      expect(fenceControlsDescriptor.ownerKind).toBe('fence');
      expect(fenceControlsDescriptor.flag).toBe('codeFenceControls');
      expect(fenceControlsDescriptor.surface.type).toBe('composite');
      expect(fenceControlsDescriptor.interaction.readOnly).toBe('disabled');
      expect(fenceControlsDescriptor.security.allowsUnsafeHtml).toBe(false);
      expect(fenceControlsDescriptor.print.default).toBe('source');
      expect(fenceControlsDescriptor.fallbackBehavior).toBe('exact-source');
      const target = fenceTargetFromState(
        (() => {
          const h = makePreviewView(FENCE_DOC);
          const s = h.view.state;
          h.destroy();
          return s;
        })(),
        FENCE_DOC.indexOf('```js') + 2,
      )!;
      expect(assertRangeValid(fenceSourceRangeSet(target), FENCE_DOC.length)).toBe(true);
    });
  });

  describe('range math', () => {
    it('resolves the language token span exactly (info string, not DOM text)', () => {
      const { view, destroy } = makePreviewView(FENCE_DOC);
      const open = FENCE_DOC.indexOf('```js');
      const target = fenceTargetFromState(view.state, open + 2);
      expect(target).not.toBeNull();
      expect(target!.language).toBe('js');
      // `info` is the WHOLE CodeInfo string span (`js title="keep"`); the exact
      // patchable region is its leading token, `langToken`.
      expect(target!.info).toEqual({
        from: FENCE_DOC.indexOf('js'),
        to: FENCE_DOC.indexOf('js') + 'js title="keep"'.length,
      });
      expect(target!.langToken).toEqual({ from: FENCE_DOC.indexOf('js'), to: FENCE_DOC.indexOf('js') + 2 });
      expect(sourceSlice(view.state, target!.langToken!.from, target!.langToken!.to)).toBe('js');
      destroy();
    });

    it('un-touched bytes: rest of info string + code body survive byte-for-byte', () => {
      const { view, destroy } = makePreviewView(FENCE_DOC);
      const open = FENCE_DOC.indexOf('```js');
      const commit = fenceLanguageCommit(view.state, open + 2, 'python');
      expect(commit).not.toBeNull();
      dispatchCommit(view, commit!.spec);
      const after = view.state.doc.toString();
      // `js` → `python`; ` title="keep"` and `const x = 1;` untouched.
      expect(after).toBe(FENCE_DOC.replace('```js title="keep"', '```python title="keep"'));
      destroy();
    });

    it('null when the fence has no info string / position outside a fence', () => {
      const { view, destroy } = makePreviewView(FENCE_DOC);
      const bareFence = FENCE_DOC.indexOf('```\nplain\n```'); // a bare fence, no info string
      expect(bareFence).toBeGreaterThan(-1);
      const inside = bareFence + 4; // inside the bare fence's body
      expect(fenceLanguageCommit(view.state, inside, 'js')).toBeNull();
      const plainPos = FENCE_DOC.indexOf('outside text'); // outside any fence
      expect(plainPos).toBeGreaterThan(-1);
      expect(fenceLanguageCommit(view.state, plainPos, 'js')).toBeNull();
      destroy();
    });
  });

  describe('commit = exact local source patch', () => {
    it('disallowed language charset is rejected (no patch)', () => {
      const { view, destroy } = makePreviewView(FENCE_DOC);
      const open = FENCE_DOC.indexOf('```js');
      expect(fenceLanguageCommit(view.state, open + 2, 'a; drop table')).toBeNull();
      expect(fenceLanguageCommit(view.state, open + 2, '')).toBeNull();
      destroy();
    });

    it('sanctioned language cycle stays in-bounds', () => {
      expect(nextLanguage('js')).toBe('ts');
      expect(nextLanguage('bash')).toBe('text');
      expect(nextLanguage('text')).toBe('js');
    });
  });

  describe('flag OFF / failure / teardown', () => {
    it('flag OFF ⇒ fence owner stays local', () => {
      resetAllCohortFlags();
      expect(resolveConstructOwner('fence').owner).toBe('local');

      // Same explicit in-test registration pattern as the task-checkbox test —
      // module-init registration is wiped by `resetOwnerRegistry()` in
      // `beforeEach`, so re-register against the clean static registry.
      const unregister = registerConstructOwner('fence', 'widget', {
        label: 'p4b.code-fence-controls',
        flag: cohortFlagClosure('codeFenceControls'),
      });
      setP4bFlagEnabled('codeFenceControls', true);
      expect(resolveConstructOwner('fence').owner).toBe('widget');
      expect(resolveConstructOwner('fence').source).toBe('p4b.code-fence-controls');
      setP4bFlagEnabled('codeFenceControls', false);
      expect(resolveConstructOwner('fence').owner).toBe('local');
      unregister();
      teardownP4bWidgets();
      expect(resolveConstructOwner('fence').owner).toBe('local');
    });

    it('failure injection degrades the fence widget build without breaking the doc', () => {
      setWidgetFailMode('always');
      const { view, destroy } = makePreviewView(FENCE_DOC);
      expect(view.state.doc.toString()).toBe(FENCE_DOC);
      destroy();
    });
  });

  describe('DOM integration on a real EditorView', () => {
    it('renders badge + controls for fenced code with an info string only', async () => {
      setP4bFlagEnabled('codeFenceControls', true);
      const { view, destroy } = makePreviewView(FENCE_DOC);
      const controls = view.contentDOM.querySelectorAll(`.${WIDGET_CLASSES.fenceControls}`);
      // ```js (info) gets controls; the bare ``` does not.
      expect(controls.length).toBe(1);
      const badge = controls[0].querySelector('.mf-widget-fence-badge');
      expect(badge?.textContent).toBe('js');
      expect(view.state.doc.toString()).toBe(FENCE_DOC);
      destroy();
    });

    it('flag OFF ⇒ no fence widget DOM at all', async () => {
      const { view, destroy } = makePreviewView(FENCE_DOC);
      resetAllCohortFlags();
      view.dispatch({});
      await sleep(0);
      expect(view.contentDOM.querySelectorAll(`.${WIDGET_CLASSES.fenceControls}`).length).toBe(0);
      destroy();
    });
  });
});

/** Range-validity gate (protocol) against the computed surface. */
function assertRangeValid(surface: import('./protocol').SourceRangeSet, docLength: number): boolean {
  return validateSourceRangeSet(surface, docLength).length === 0;
}

import { validateSourceRangeSet } from './protocol';
void ctxFor;
void taskTogglePatch as unknown;
void teardownP4bWidgets as unknown;
void isWidgetFailMode as unknown;