// P4B task 7.4 — the two lightweight widget PILOTS: task checkbox and code
// fence controls.
//
// Both are P4B widgets (design 05 §4, `widgets/protocol.ts`): the widget DOM is
// NEVER the document truth; every edit is a commit whose TYPE is a local
// CodeMirror source patch (`WidgetSourceChange`), dispatched through the
// binding's own EditorView (the same local-patch + History pipeline P3 uses,
// `isolateHistory`). Source range math lives in `widgets/widgetSource.ts` and
// is Lezer-trusted (P4A ADR §3.1) — never DOM textContent, never a cached
// position.
//
// Ownership: both widgets take over their construct kind ONLY while their flag
// is ON (default-OFF, `cohortFlags.ts`). flag OFF ⇒ owner stays 'local' and the
// projection decorates the construct as today (rollback contract of design 05
// §5: a failing widget closes only itself).
//
// Plugin lifecycle: this module defines the widget descriptors and registers
// construct owners at module init (idempotent, protocol-checked, never throwing
// into the app), and exposes `widgetProjectionExtension()` — the ViewPlugin
// that draws the widgets. The plugin is added to the SAME projection compartment
// as `projectionExtension()` (see `losslessSourceEditor.ts`), so it
// mounts/unmounts with Live Preview and never exists in plain Source.
//
// Read-only / failure: every interaction route is gated — a read-only view
// renders disabled widgets and aborts commits; a diffed/colliding edit
// (identity/revision changed while the DOM was alive) re-resolves against the
// CURRENT doc and aborts when the span no longer matches; a transient control
// never mutates the doc outside its commit.
//
// Test/E2E: unit/integration cover range math, exact local patches, History
// undo, toggles, copy, off-source recovery, failure degradation, read-only.
// The desktop suite (`e2e/specs/lossless/p4b-widgets.e2e.mjs`) drives the REAL
// editor through the E2E hooks below (`import.meta.env.MODE === 'e2e'`).

import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { EditorState, Extension } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import {
  defineWidget,
  validateSourceRangeSet,
  type SourceRangeSet,
  type WidgetDescriptor,
  type WidgetSourceChange,
} from './protocol';
import { isCodeFenceControlsEnabled, isTaskCheckboxEnabled } from '../cohortFlags';
import { registerConstructOwner, resolveNestedEditableSlot } from '../renderOwnerRegistry';
import {
  collectVisibleFenceTargets,
  collectVisibleTaskTargets,
  fenceTargetFromState,
  taskTargetFromState,
  type FenceWidgetTarget,
  type TaskWidgetTarget,
} from './widgetSource';

// ── Stable ids / labels (evidence + registry source) ────────────────────────

const TASK_WIDGET_ID = 'task-checkbox';
const TASK_WIDGET_LABEL = 'p4b.task-checkbox';
const FENCE_WIDGET_ID = 'code-fence-controls';
const FENCE_WIDGET_LABEL = 'p4b.code-fence-controls';

// ── Widget DOM classes (semantic, for unit + desktop E2E assertions) ────────

export const WIDGET_CLASSES = {
  taskCheckbox: 'mf-widget-task',
  fenceControls: 'mf-widget-fence',
} as const;

// ── Failure injection (test/E2E only) ──────────────────────────────────────

export type WidgetFailMode = 'none' | 'next' | 'always';
let widgetFailMode: WidgetFailMode = 'none';

/** True only in test/E2E builds; `MODE === 'production'` disables injection. */
export function widgetInjectionEnabled(): boolean {
  const mode = import.meta.env.MODE;
  return mode !== 'production';
}

/** Test-only: force the widget interaction routes to throw. `'next'` self-clears. */
export function setWidgetFailMode(mode: WidgetFailMode): void {
  if (!widgetInjectionEnabled()) return;
  widgetFailMode = mode;
}

/** Test-only: current failure-injection mode. */
export function isWidgetFailMode(): WidgetFailMode {
  return widgetFailMode;
}

function maybeInjectWidgetFailure(): void {
  if (!widgetInjectionEnabled()) return;
  // The build is CPU-typed; a throw degrades the plugin to an empty set below.
  if (widgetFailMode === 'next') {
    widgetFailMode = 'none';
    throw new Error('widget-test-injected-failure');
  }
  if (widgetFailMode === 'always') {
    throw new Error('widget-test-injected-failure');
  }
}

// ── Commit helpers (protocol: widget edits are source patches only) ─────────

const TASK_ALLOWED_MARKERS = ['[ ]', '[x]', '[X]'] as const;

/**
 * The exact source patch that flips a task marker at `from` (3 bytes). Toggle
 * semantics: `[X]`/`[x]` → `[ ]`; `[ ]` → `[x]`. This function NEVER touches
 * anything outside the three marker bytes.
 */
export function taskTogglePatch(
  from: number,
  currentMarker: string,
): { changes: Array<{ from: number; to: number; insert: string }>; selection: { anchor: number } } | null {
  if (!(TASK_ALLOWED_MARKERS as readonly string[]).includes(currentMarker)) return null;
  const next = currentMarker === '[ ]' ? '[x]' : '[ ]';
  return {
    changes: [{ from, to: from + 3, insert: next }],
    selection: { anchor: from }, // caret lands on the marker — focusable & stable
  };
}

/**
 * The commit a task-toggle returns: ONE local source patch + a solitude History
 * boundary. Re-resolves the CURRENT doc at the CURRENT coords — never the DOM
 * state (a doc shift while the widget DOM is alive must not target a stale
 * span). Returns null when the position is no longer a task marker.
 */
export function taskCheckboxCommit(state: EditorState, widgetPos: number): WidgetSourceChange | null {
  if (widgetPos < 0 || widgetPos > state.doc.length) return null;
  const target = taskTargetFromState(state, widgetPos);
  if (!target) return null;
  const markerText = state.doc.slice(target.marker.from, target.marker.to).toString();
  const patch = taskTogglePatch(target.marker.from, markerText);
  if (!patch) return null;
  return {
    spec: [
      {
        changes: patch.changes,
        selection: patch.selection,
        userEvent: 'widget.task-checkbox.toggle',
        annotations: isolateHistory.of('full'),
      },
    ],
    undoable: true,
    userEvent: 'widget.task-checkbox.toggle',
  };
}

/**
 * The commit a fence-language control returns: a LOCAL patch to the language
 * token span ONLY (the leading token of the CodeInfo string). Everything else —
 * the rest of the info string, the code body, both fence markers, adjacent
 * lines — stays untouched (L1 contract). Returns null when the language cannot
 * be safely patched (absent info string / no token / disallowed charset).
 */
export function fenceLanguageCommit(
  state: EditorState,
  widgetPos: number,
  nextLanguage: string,
): WidgetSourceChange | null {
  if (nextLanguage.length === 0 || !/^[A-Za-z0-9_+\-.#]+$/.test(nextLanguage)) return null;
  if (widgetPos < 0 || widgetPos > state.doc.length) return null;
  const target = fenceTargetFromState(state, widgetPos);
  if (!target || !target.info || !target.langToken) return null;
  return {
    spec: [
      {
        changes: [{ from: target.langToken.from, to: target.langToken.to, insert: nextLanguage }],
        userEvent: 'widget.code-fence.language',
        annotations: isolateHistory.of('full'),
      },
    ],
    undoable: true,
    userEvent: 'widget.code-fence.language',
  };
}

/** Read the sharp bytes of a source span from the DOC (never DOM). */
export function sourceSlice(state: EditorState, from: number, to: number): string {
  if (from < 0 || to < from || to > state.doc.length) return '';
  return state.doc.slice(from, to).toString();
}

// ── Deferred dispatch (click/keyboard run outside a CM transaction; the
//    actual commit runs in a microtask so the harness sees the freshest doc) ──

let pendingDispatch: ((view: EditorView) => void) | null = null;

/** Defer a widget commit until the current event loop has settled. */
function deferDispatch(fn: (view: EditorView) => void): void {
  // If a previous deferred action is still pending, run it first (FIFO).
  pendingDispatch = fn;
}

/** Run any pending widget commit (called by the plugin update cycle + tests). */
export function flushPendingWidgetDispatch(view: EditorView): void {
  const fn = pendingDispatch;
  pendingDispatch = null;
  if (fn) fn(view);
}

/** Route a widget interaction: single deferred dispatch, revalidation later. */
export function queueWidgetCommit(view: EditorView, action: (v: EditorView) => void): void {
  deferDispatch(action);
  // Drain at the next microtask. The commit re-resolves the CURRENT doc, so a
  // mid-drain edit can only abort (never apply to a stale span).
  queueMicrotask(() => flushPendingWidgetDispatch(view));
}

// ── The ViewPlugin: draw widgets, route interactions ────────────────────────

function buildWidgetDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  maybeInjectWidgetFailure();

  if (isTaskCheckboxEnabled()) {
    for (const target of collectVisibleTaskTargets(view)) {
      const owner = resolveNestedEditableSlot(
        { kind: 'listItem', from: target.source.from, to: target.source.to },
        { kind: 'taskCheckbox', from: target.marker.from, to: target.marker.to },
      );
      if (
        owner.owner !== 'widget' ||
        owner.source !== TASK_WIDGET_LABEL ||
        owner.from !== target.marker.from ||
        owner.to !== target.marker.to
      ) continue;
      builder.add(target.marker.from, target.marker.to, taskCheckboxDecoration(view, target, 0));
    }
  }
  if (isCodeFenceControlsEnabled()) {
    for (const target of collectVisibleFenceTargets(view)) {
      const owner = resolveNestedEditableSlot(
        { kind: 'fence', from: target.source.from, to: target.source.to },
        { kind: 'codeFenceControls', from: target.openMark.from, to: target.openMark.to },
      );
      if (
        owner.owner !== 'widget' ||
        owner.source !== FENCE_WIDGET_LABEL ||
        owner.from !== target.openMark.from ||
        owner.to !== target.openMark.to
      ) continue;
      // The fence controls sit at the opening marker (CodeMark start) as an
      // inline widget; the source bytes under it remain fully selectable.
      builder.add(target.openMark.from, target.openMark.from, fenceControlsDecoration(view, target, 2));
    }
  }
  return builder.finish();
}

/** Decoration that REPLACES the 3-byte task marker with a live checkbox. */
function taskCheckboxDecoration(view: EditorView, target: TaskWidgetTarget, side: number): Decoration {
  const readOnly = !view.state.facet(EditorView.editable);
  return Decoration.replace({
    widget: new TaskCheckboxWidget(target, readOnly),
    inclusive: false,
    side,
  });
}

/** Inline widget drawing the fence language/controls at the opening marker. */
function fenceControlsDecoration(_view: EditorView, target: FenceWidgetTarget, side: number): Decoration {
  return Decoration.widget({
    widget: new FenceControlsWidget(target),
    side,
  });
}

// ── WidgetType: task checkbox ───────────────────────────────────────────────

function isWidgetActivationKey(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey
    && (event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar');
}

/**
 * Focused widget controls are not CodeMirror text inputs. Keep every plain key
 * except Tab inside the control so navigation/editing keys cannot leak through
 * the light DOM and mutate the source. Platform shortcuts remain available
 * (notably Cmd/Ctrl+Z after a widget commit).
 */
function containWidgetKey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

/** An `HTMLElement` safe to append into a CM widget slot. */
export function makeTaskCheckboxElement(view: EditorView, target: TaskWidgetTarget): HTMLElement {
  const dom = document.createElement('span');
  dom.className = `${WIDGET_CLASSES.taskCheckbox} mf-widget-control`;
  dom.setAttribute('role', 'checkbox');
  dom.setAttribute('aria-label', `任务 ${target.name}`);
  dom.setAttribute('aria-checked', target.checked ? 'true' : 'false');
  dom.setAttribute('tabindex', '0');
  dom.setAttribute('data-mf-widget', TASK_WIDGET_ID);
  dom.setAttribute('data-marker-from', String(target.marker.from));
  dom.setAttribute('data-marker-to', String(target.marker.to));
  dom.dataset.checked = target.checked ? 'true' : 'false';
  dom.textContent = target.checked ? '[x]' : '[ ]';
  const readOnly = !view.state.facet(EditorView.editable);
  if (readOnly) dom.setAttribute('aria-disabled', 'true');

  const toggle = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (readOnly) return;
    // The commit re-resolves the CURRENT doc at a point strictly INSIDE the
    // marker (marker.from + 1, the space/x) — never the stale DOM-recorded
    // from, which sits on the `[` token boundary and Lezer resolves ambiguously.
    queueWidgetCommit(view, (v) => {
      const anchor = target.marker.from + 1;
      const commit = taskCheckboxCommit(v.state, anchor);
      if (!commit) return; // span no longer valid → exact-source fallback (no doc change)
      v.focus();
      v.dispatch({ ...commit.spec[0], annotations: commit.spec[0].annotations });
    });
  };

  dom.addEventListener('click', toggle);
  dom.addEventListener('keydown', (e) => {
    if (isWidgetActivationKey(e)) {
      toggle(e);
      return;
    }
    containWidgetKey(e);
  });
  return dom;
}

class TaskCheckboxWidget extends WidgetType {
  /** Cache the marker span so a doc shift without a rebuild cannot ghost-toggle. */
  private readonly markerFrom: number;
  private readonly markerTo: number;
  /** Read-only state at build time — forces a redraw (disabled DOM) on flips. */
  private readonly readOnly: boolean;

  constructor(
    target: TaskWidgetTarget,
    readOnly: boolean,
  ) {
    super();
    this.target = target;
    this.markerFrom = target.marker.from;
    this.markerTo = target.marker.to;
    this.readOnly = readOnly;
  }

  private target: TaskWidgetTarget;

  eq(other: TaskCheckboxWidget): boolean {
    return (
      other.target.checked === this.target.checked &&
      other.markerFrom === this.markerFrom &&
      other.markerTo === this.markerTo &&
      other.target.name === this.target.name &&
      // An editability flip must re-render the widget (disabled vs enabled).
      other.readOnly === this.readOnly
    );
  }

  toDOM(view: EditorView): HTMLElement {
    // Re-resolve the target from the CURRENT doc so the light DOM always
    // reflects today's bytes (a source edit right before draw is honoured).
    const fresh = taskTargetFromState(view.state, this.markerFrom) ?? this.target;
    return makeTaskCheckboxElement(view, fresh);
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// ── WidgetType: code fence controls ─────────────────────────────────────────

/** An `HTMLElement` with the fence badge + copy + language toggle. */
export function makeFenceControlsElement(view: EditorView, target: FenceWidgetTarget): HTMLElement {
  const root = document.createElement('span');
  root.className = `${WIDGET_CLASSES.fenceControls} mf-widget-control`;
  root.setAttribute('data-mf-widget', FENCE_WIDGET_ID);
  root.setAttribute('data-source-from', String(target.source.from));
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', `代码块 ${target.language || '无语言'}`);
  const readOnly = !view.state.facet(EditorView.editable);

  const badge = document.createElement('span');
  badge.className = 'mf-widget-fence-badge';
  badge.textContent = target.language || 'code';
  badge.setAttribute('data-language', target.language);
  root.appendChild(badge);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'mf-widget-fence-copy';
  copy.textContent = '复制';
  copy.setAttribute('data-action', 'copy');
  const copySource = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    // Copy reads the SHARP source bytes (CodeText) directly from the doc —
    // never DOM textContent (design 05 §4: clipboard reads the source range).
    const text = sourceSlice(view.state, target.content.from, target.content.to);
    if (text.length === 0) return;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  copy.addEventListener('click', copySource);
  copy.addEventListener('keydown', (e) => {
    if (isWidgetActivationKey(e)) {
      copySource(e);
      return;
    }
    containWidgetKey(e);
  });
  root.appendChild(copy);

  if (!readOnly && target.info && target.langToken) {
    const lang = document.createElement('button');
    lang.type = 'button';
    lang.className = 'mf-widget-fence-lang';
    lang.textContent = target.language || '语言';
    lang.setAttribute('data-action', 'language');
    const changeLanguage = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      // Commit re-resolves the CURRENT doc at a point strictly INSIDE the
      // opening marker. Its `from` sits on a Lezer boundary (and is commonly
      // doc offset 0), where `resolveInner(..., 0)` may resolve outside the
      // FencedCode node and turn a valid click into a silent no-op.
      queueWidgetCommit(view, (v) => {
        const anchor = target.openMark.from + 1;
        const commit = fenceLanguageCommit(v.state, anchor, nextLanguage(target.language));
        if (!commit) return;
        v.focus();
        v.dispatch({ ...commit.spec[0], annotations: commit.spec[0].annotations });
      });
    };
    lang.addEventListener('click', changeLanguage);
    lang.addEventListener('keydown', (e) => {
      if (isWidgetActivationKey(e)) {
        changeLanguage(e);
        return;
      }
      containWidgetKey(e);
    });
    root.appendChild(lang);
  }
  return root;
}

/** The sanctioned language cycle for the pilot (stays in-bounds). */
export function nextLanguage(current: string): string {
  const LANGUAGES = ['text', 'js', 'ts', 'python', 'rust', 'bash'];
  const idx = LANGUAGES.indexOf(current);
  return LANGUAGES[(idx + 1) % LANGUAGES.length] ?? 'text';
}

class FenceControlsWidget extends WidgetType {
  constructor(target: FenceWidgetTarget) {
    super();
    this.target = target;
  }

  private target: FenceWidgetTarget;

  // Default `eq() === false` redraws the (tiny) controls on every doc change —
  // acceptable: the badge must reflect the CURRENT language, which the source
  // owns.

  toDOM(view: EditorView): HTMLElement {
    const fresh = fenceTargetFromState(view.state, this.target.openMark.from + 1) ?? this.target;
    return makeFenceControlsElement(view, fresh);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// ── Descriptor definitions (protocol) ───────────────────────────────────────

const TASK_DESCRIPTOR_INPUT = {
  id: TASK_WIDGET_ID,
  kind: 'checkbox',
  ownerKind: 'taskCheckbox',
  flag: 'taskCheckbox',
  label: TASK_WIDGET_LABEL,
  ranges: (update: ViewUpdate): SourceRangeSet | null => {
    if (!update.state.selection.main.empty) return null;
    const target = taskTargetFromState(update.state, update.state.selection.main.head);
    return target ? taskSourceRangeSet(target) : null;
  },
  surface: { type: 'control' },
  commit: (ctx: { state: EditorState; selection: { main: { empty: boolean; head: number } } }): WidgetSourceChange | null =>
    ctx.selection.main.empty ? taskCheckboxCommit(ctx.state, ctx.selection.main.head) : null,
  interaction: { commands: ['toggle', 'space', 'enter'], atomic: false, revealOnFocus: 'markers', readOnly: 'disabled' },
  atomic: false,
  async: { asyncAllowed: false, staleResultHandler: 'discard-and-log', retry: 'none' },
  security: {
    untrustedContent: false,
    allowsUnsafeHtml: false,
    containerPolicy: 'none',
    allowedUrlProtocols: [],
    externalNetworkGated: false,
  },
  accessibility: { name: 'task checkbox', role: 'checkbox', state: { checked: false }, atomic: true },
  print: { default: 'source' },
  fallbackBehavior: 'exact-source',
} as const;

const FENCE_DESCRIPTOR_INPUT = {
  id: FENCE_WIDGET_ID,
  kind: 'fence-language',
  ownerKind: 'codeFenceControls',
  flag: 'codeFenceControls',
  label: FENCE_WIDGET_LABEL,
  ranges: (update: ViewUpdate): SourceRangeSet | null => {
    if (!update.state.selection.main.empty) return null;
    const target = fenceTargetFromState(update.state, update.state.selection.main.head);
    return target ? fenceSourceRangeSet(target) : null;
  },
  surface: { type: 'composite' },
  commit: (ctx: { state: EditorState; selection: { main: { empty: boolean; head: number } } }): WidgetSourceChange | null => {
    if (!ctx.selection.main.empty) return null;
    const anchor = ctx.selection.main.head;
    const target = fenceTargetFromState(ctx.state, anchor);
    return target ? fenceLanguageCommit(ctx.state, anchor, nextLanguage(target.language)) : null;
  },
  interaction: { commands: ['toggle', 'enter', 'escape'], atomic: true, revealOnFocus: 'markers', readOnly: 'disabled' },
  atomic: true,
  async: { asyncAllowed: false, staleResultHandler: 'discard-and-log', retry: 'none' },
  security: {
    untrustedContent: false,
    allowsUnsafeHtml: false,
    containerPolicy: 'none',
    allowedUrlProtocols: [],
    externalNetworkGated: false,
  },
  accessibility: { name: 'code fence controls', role: 'region', atomic: true },
  print: { default: 'source' },
  fallbackBehavior: 'exact-source',
} as const;

/** The frozen protocol descriptor of the task-checkbox widget. */
export const taskCheckboxDescriptor: WidgetDescriptor = defineWidget(
  TASK_DESCRIPTOR_INPUT as unknown as WidgetDescriptor,
);

/** The frozen protocol descriptor of the code-fence-controls widget. */
export const fenceControlsDescriptor: WidgetDescriptor = defineWidget(
  FENCE_DESCRIPTOR_INPUT as unknown as WidgetDescriptor,
);

// ── Source range sets (protocol shape) + structural gate ────────────────────

function rangeSet(source: { from: number; to: number }, content: { from: number; to: number }, markers: Array<[number, number]>): SourceRangeSet {
  return { source, content, markers };
}

/** The protocol `SourceRangeSet` for a task-item target. */
export function taskSourceRangeSet(target: TaskWidgetTarget): SourceRangeSet {
  return rangeSet(target.source, target.content, [[target.marker.from, target.marker.to]]);
}

/** The protocol `SourceRangeSet` for a fence target. */
export function fenceSourceRangeSet(target: FenceWidgetTarget): SourceRangeSet {
  const markers: Array<[number, number]> = [[target.openMark.from, target.openMark.to]];
  if (target.info) markers.push([target.info.from, target.info.to]);
  return rangeSet(target.source, target.content, markers);
}

/** Structural validity gate (protocol `validateSourceRangeSet`), doc-aware. */
export function assertWidgetRangeValid(surface: SourceRangeSet, docLength: number): boolean {
  return validateSourceRangeSet(surface, docLength).length === 0;
}

// ── Owner registration + plugin + teardown ──────────────────────────────────

// Module-init owner registration: inert while the flag is OFF (default).
// Same-kind registration is idempotent/re-entrant; teardown is idempotent.
const teardownTaskOwner = registerConstructOwner('taskCheckbox', 'widget', {
  flag: () => isTaskCheckboxEnabled(),
  label: TASK_WIDGET_LABEL,
});
const teardownFenceOwner = registerConstructOwner('codeFenceControls', 'widget', {
  flag: () => isCodeFenceControlsEnabled(),
  label: FENCE_WIDGET_LABEL,
});

let projectionsMounted = 0;
/** The most recently seen plugin view — used to drain a pending widget commit
 *  on plugin teardown (never a DOM read; the commit re-resolves the doc). */
let lastPluginView: EditorView | null = null;

function fallbackEmptyDecorations(): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  return builder.finish();
}

/** The ViewPlugin that draws the two pilot widgets over the source. */
export const widgetProjectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      projectionsMounted += 1;
      lastPluginView = view;
      try {
        this.decorations = buildWidgetDecorations(view);
      } catch {
        // A widget-build throw degrades to an empty decoration set: the exact
        // source stays fully editable (failure fallback, design 05 §9).
        this.decorations = fallbackEmptyDecorations();
      }
    }

    update(update: ViewUpdate) {
      lastPluginView = update.view;
      // Rebuild whenever the doc/selection/viewport change OR when editability
      // flips (a read-only toggle must re-render disabled widgets — the widget
      // DOM reads `EditorView.editable` at draw time).
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.view.composing ||
        update.startState.facet(EditorView.editable) !== update.state.facet(EditorView.editable)
      ) {
        try {
          this.decorations = buildWidgetDecorations(update.view);
        } catch {
          this.decorations = fallbackEmptyDecorations();
        }
      }
    }

    destroy() {
      projectionsMounted -= 1;
      const view = lastPluginView;
      lastPluginView = null;
      if (view) flushPendingWidgetDispatch(view);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * The full 7.4 widget extension. Install this in the SAME projection
 * compartment as `projectionExtension()` so widgets mount/unmount with Live
 * Preview. In plain Source the compartment is empty and the raw Markdown is
 * fully editable.
 */
export function widgetProjectionExtension(): Extension {
  return [widgetProjectionPlugin];
}

/** Independent teardown of BOTH pilot widgets (idempotent). */
export function teardownP4bWidgets(): void {
  teardownTaskOwner();
  teardownFenceOwner();
}

/** How many widget projections are currently mounted (unit intel). */
export function mountedWidgetProjections(): number {
  return projectionsMounted;
}

// E2E-only hooks: flip flags, read results, drive real interactions over the
// real editor. Present only in `e2e` builds, never in prod.
if (import.meta.env.MODE === 'e2e') {
  const widgetHooks = {
    /** Force the widget interaction routes to fail (next/always/clear). */
    fail: (mode: WidgetFailMode) => {
      setWidgetFailMode(mode);
      return 'armed';
    },
    /** Count the live task-checkbox widget DOM nodes. */
    taskCount: () => document.querySelectorAll(`.${WIDGET_CLASSES.taskCheckbox}`).length,
    /** Count the live code-fence-controls widget DOM nodes. */
    fenceCount: () => document.querySelectorAll(`.${WIDGET_CLASSES.fenceControls}`).length,
    /** Click the widget for the task marker that starts at source offset `pos`. */
    clickTask: (pos: number) => {
      const el = document.querySelector<HTMLElement>(`[data-marker-from="${pos}"]`);
      if (!el) return 'missing';
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 'clicked';
    },
    /** Click the copy button of the fence whose source starts at `pos`. */
    clickFenceCopy: (pos: number) => {
      const el = document.querySelector<HTMLElement>(`[data-source-from="${pos}"] .mf-widget-fence-copy`);
      if (!el) return 'missing';
      (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return 'clicked';
    },
  };
  (window as unknown as { __p4bWidgets?: typeof widgetHooks }).__p4bWidgets = widgetHooks;
}
