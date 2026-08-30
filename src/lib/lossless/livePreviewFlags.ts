// P6 — per-construct Live Preview feature flags (design/phases/P6-*.md §5 / §9.7).
//
// Projection and visibility are SEPARATE default-OFF switches per construct:
//   - `livePreview.<construct>`        → the construct is projected (hidden-capable)
//   - `livePreview.<construct>.hidden` → inactive markers are REPLACED/hidden via
//     `Decoration.replace` + `EditorView.atomicRanges` (P6 is the SOLE owner of
//     hidden markers; P4B must never hide). Turning OFF `.hidden` falls back to
//     `dimmed`; turning OFF the construct falls back to source. Neither path
//     rewrites `EditorState.doc`, the History, or the Core byte session.
//
// M1 (heading / paragraph / thematic break) is wired first. `paragraph` has no
// marker to hide, so it needs no switch; `heading` and `thematicBreak` do.
// M2a adds the four PAIRED INLINE constructs (strong/emphasis/strikethrough/
// inline code), each with its own independent switch pair. Future cohorts
// (M2b/M3a/M3b) extend this registry but are delivered INDEPENDENTLY (own flag
// set, evidence, Reviewer, human acceptance), so this file only ENABLES the
// cohorts it implements.

/** Constructs that P6 is allowed to project + hide. */
export type LivePreviewConstruct =
  | 'heading'
  | 'thematicBreak'
  | 'strong'
  | 'emphasis'
  | 'strikethrough'
  | 'inlineCode';

export const LIVE_PREVIEW_CONSTRUCTS: readonly LivePreviewConstruct[] = Object.freeze([
  'heading',
  'thematicBreak',
  'strong',
  'emphasis',
  'strikethrough',
  'inlineCode',
]);

/**
 * The M2a constructs whose source syntax is a PAIRED delimiter around a content
 * range (`**bold**`, `*it*`, `~~s~~`, `` `c` ``). Their markers are hidden as two
 * discrete atomic units, and their boundary-delete contract (ADR structural
 * interaction matrix) keeps the pair intact — deleting one `**` never orphans
 * the other.
 */
export const PAIRED_INLINE_CONSTRUCTS: readonly LivePreviewConstruct[] = Object.freeze([
  'strong',
  'emphasis',
  'strikethrough',
  'inlineCode',
]);

/** localStorage key for a P6 construct switch (`markflow.livePreview.<c>[.hidden]`). */
export function livePreviewStorageKey(construct: LivePreviewConstruct, hidden = false): string {
  return hidden
    ? `markflow.livePreview.${construct}.hidden`
    : `markflow.livePreview.${construct}`;
}

interface LivePreviewSwitch {
  read(): boolean;
  set(value: boolean): void;
  reset(): void;
}

/**
 * Build one P6 switch (mirrors flag.ts / cohortFlags.ts): an in-memory default
 * OFF singleton mirrored to localStorage. Only the literal `'1'` enables; any
 * other value (absent / `'0'`) keeps it OFF (explicit rollback semantics).
 */
function createSwitch(key: string): LivePreviewSwitch {
  let enabled = false;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1') {
      enabled = true;
    }
  } catch {
    // localStorage unavailable (SSR / test sandbox) — stay OFF.
  }
  return {
    read: () => enabled,
    set: (value: boolean) => {
      enabled = value;
      try {
        if (typeof localStorage !== 'undefined') {
          if (value) localStorage.setItem(key, '1');
          else localStorage.removeItem(key);
        }
      } catch {
        // localStorage unavailable — state still flips in memory.
      }
    },
    reset: () => {
      enabled = false;
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

const projSwitches = new Map<LivePreviewConstruct, LivePreviewSwitch>();
const hiddenSwitches = new Map<LivePreviewConstruct, LivePreviewSwitch>();

function projSwitchFor(c: LivePreviewConstruct): LivePreviewSwitch {
  let entry = projSwitches.get(c);
  if (!entry) {
    entry = createSwitch(livePreviewStorageKey(c, false));
    projSwitches.set(c, entry);
  }
  return entry;
}

function hiddenSwitchFor(c: LivePreviewConstruct): LivePreviewSwitch {
  let entry = hiddenSwitches.get(c);
  if (!entry) {
    entry = createSwitch(livePreviewStorageKey(c, true));
    hiddenSwitches.set(c, entry);
  }
  return entry;
}

/** Projection active for this construct (the hidden-capable path is reachable). */
export function isLivePreviewProjectionOn(c: LivePreviewConstruct): boolean {
  return projSwitchFor(c).read();
}

/** Marker hiding active for this construct (requires projection ON). */
export function isLivePreviewHiddenOn(c: LivePreviewConstruct): boolean {
  return projSwitchFor(c).read() && hiddenSwitchFor(c).read();
}

/** Set the projection switch (test / E2E only). */
export function setLivePreviewProjection(c: LivePreviewConstruct, value: boolean): void {
  projSwitchFor(c).set(value);
}

/** Set the hidden switch (test / E2E only). */
export function setLivePreviewHidden(c: LivePreviewConstruct, value: boolean): void {
  hiddenSwitchFor(c).set(value);
}

/** Test-only: force every P6 switch back to OFF and clear its localStorage key. */
export function resetAllLivePreviewFlags(): void {
  for (const c of LIVE_PREVIEW_CONSTRUCTS) {
    projSwitchFor(c).reset();
    hiddenSwitchFor(c).reset();
  }
}

// E2E-only hooks: the desktop E2E (WebDriver) flips per-construct P6 flags on
// the real app. Present only in `e2e` builds, never in prod.
if (import.meta.env.MODE === 'e2e') {
  const lpHooks = {
    /** Set a P6 construct switch ON/OFF. `hidden=true` targets the `.hidden` switch. */
    set: (name: string, value: boolean, hidden = false): boolean => {
      if (!LIVE_PREVIEW_CONSTRUCTS.includes(name as LivePreviewConstruct)) return false;
      if (hidden) setLivePreviewHidden(name as LivePreviewConstruct, value);
      else setLivePreviewProjection(name as LivePreviewConstruct, value);
      return true;
    },
    /** Read the ON/OFF state of a P6 construct switch. */
    isOn: (name: string, hidden = false): boolean =>
      LIVE_PREVIEW_CONSTRUCTS.includes(name as LivePreviewConstruct) &&
      (hidden
        ? isLivePreviewHiddenOn(name as LivePreviewConstruct)
        : isLivePreviewProjectionOn(name as LivePreviewConstruct)),
    /** The accepted P6 construct names, for driver-side validation. */
    names: [...LIVE_PREVIEW_CONSTRUCTS],
  };
  (window as unknown as { __setLivePreviewFlag?: typeof lpHooks }).__setLivePreviewFlag = lpHooks;
}

/**
 * Map a projection `cls` to its P6 construct identity. Returns `null` for any
 * construct P6 does not yet own (everything outside M1 heading / thematic break
 * and the M2a paired inline constructs). Used by the projection engine to decide
 * whether a construct may enter the hidden-marker state at all.
 */
export function clsToLivePreviewConstruct(cls: string): LivePreviewConstruct | null {
  if (cls === 'mf-h') return 'heading';
  if (cls === 'mf-hr') return 'thematicBreak';
  // M2a paired inline constructs.
  if (cls === 'mf-strong') return 'strong';
  if (cls === 'mf-emphasis') return 'emphasis';
  if (cls === 'mf-strikethrough') return 'strikethrough';
  if (cls === 'mf-inline-code') return 'inlineCode';
  return null;
}
