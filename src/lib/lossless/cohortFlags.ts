// P4B per-cohort / per-widget feature flags (design 05 §5, P4B design §3.1/§6).
//
// Every cohort and widget of Slice 4B (tasks.md §7) gets its OWN independent,
// default-OFF switch. This is the rollback contract of design 05 §5: a failing
// cohort/widget closes only itself, never the base Live Preview, the lossless
// session, or save. The base path (projection.ts local decorations) is NOT
// gated here — these flags only gate the P4B cohort work that REPLACES a local
// construct with widget ownership and/or the marker reveal/atomic-range
// behavior of task 7.1.
//
// All five marker cohorts of task 7.1:
//   - headingStrong             (7.1 ①)
//   - emphasisStrikeInlineCode  (7.1 ②)
//   - links                     (7.1 ③)
//   - quoteLists                (7.1 ④)
//   - fence                     (7.1 ⑤)
// and the four P4B widget/policy items:
//   - taskCheckbox              (task 7.4 widget pilot)
//   - codeFenceControls         (task 7.4 widget pilot)
//   - frontmatterPolicy         (task 7.6, design 05 §7 URL/sanitize policy)
//   - rawHtmlPolicy             (task 7.6, design 05 §7 raw-HTML policy)
//
// Widget protocol (task 7.3 / widget/protocol.ts) consumes these via
// `isP4bFlagEnabled(name)` — one reader so owner-registry flag closures and
// widget-gate checks share the same source of truth.
//
// Persistence model mirrors flag.ts / livePreviewFlag.ts (module singleton +
// defensive localStorage) with ONE deliberate difference: these switches default
// to OFF and are OPT-IN. `localStorage['markflow.p4b.<name>']==='1'` turns one
// switch on; absent, `'0'`, or any other value keeps it OFF. Each switch is
// seeded from localStorage lazily on first access (module load is safe: the seed
// happens inside `createSwitch`, before any test clears storage).

/** Union of every independent P4B cohort/widget switch name. */
export type P4bFlagName =
  | 'headingStrong'
  | 'emphasisStrikeInlineCode'
  | 'links'
  | 'quoteLists'
  | 'fence'
  | 'taskCheckbox'
  | 'codeFenceControls'
  | 'frontmatterPolicy'
  | 'rawHtmlPolicy';

export const P4B_FLAG_NAMES: readonly P4bFlagName[] = Object.freeze([
  'headingStrong',
  'emphasisStrikeInlineCode',
  'links',
  'quoteLists',
  'fence',
  'taskCheckbox',
  'codeFenceControls',
  'frontmatterPolicy',
  'rawHtmlPolicy',
]);

/** localStorage key namespace for the P4B switches. */
export function p4bStorageKey(name: P4bFlagName): string {
  return `markflow.p4b.${name}`;
}

interface P4bSwitch {
  read(): boolean;
  set(value: boolean): void;
  reset(): void;
}

/**
 * Build one P4B switch. Each switch is a tiny module singleton: in-memory
 * `enabled` (default OFF) plus a defensive localStorage mirror
 * (`markflow.p4b.<name>`); any localStorage failure (SSR/test sandbox) keeps the
 * switch usable in memory only.
 */
function createSwitch(name: P4bFlagName): P4bSwitch {
  let enabled = false;
  try {
    if (typeof localStorage !== 'undefined') {
      // OPT-IN: only the literal string `'1'` enables the switch. Absent,
      // `'0'`, or any other value keeps it OFF (explicit rollback semantics).
      if (localStorage.getItem(p4bStorageKey(name)) === '1') {
        enabled = true;
      }
    }
  } catch {
    // localStorage unavailable (SSR/happy-dom without storage) — remain OFF.
  }
  return {
    read: () => enabled,
    set: (value: boolean) => {
      enabled = value;
      try {
        if (typeof localStorage !== 'undefined') {
          if (value) {
            localStorage.setItem(p4bStorageKey(name), '1');
          } else {
            localStorage.removeItem(p4bStorageKey(name));
          }
        }
      } catch {
        // localStorage unavailable — state still flips in memory.
      }
    },
    reset: () => {
      enabled = false;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(p4bStorageKey(name));
        }
      } catch {
        // ignore
      }
    },
  };
}

const switches = new Map<P4bFlagName, P4bSwitch>();

/** First access lazily creates (and seeds) the switch. */
function switchFor(name: P4bFlagName): P4bSwitch {
  let entry = switches.get(name);
  if (!entry) {
    entry = createSwitch(name);
    switches.set(name, entry);
  }
  return entry;
}

/** Whether the named P4B cohort/widget switch is currently ON. */
export function isP4bFlagEnabled(name: P4bFlagName): boolean {
  return switchFor(name).read();
}

/** Set the named P4B switch (test/E2E only). Persists the localStorage key. */
export function setP4bFlagEnabled(name: P4bFlagName, value: boolean): void {
  switchFor(name).set(value);
}

// ── Per-cohort convenience accessors ────────────────────────────────────────

/**
 * heading+strong cohort gate (task 7.1 ①). When OFF the local projection keeps
 * owning 'heading'/'strong' at their default owner.
 */
export function isHeadingStrongEnabled(): boolean {
  return isP4bFlagEnabled('headingStrong');
}

/** emphasis+strike+inline-code cohort gate (task 7.1 ②). */
export function isEmphasisStrikeInlineCodeEnabled(): boolean {
  return isP4bFlagEnabled('emphasisStrikeInlineCode');
}

/** links cohort gate (task 7.1 ③). */
export function isLinksEnabled(): boolean {
  return isP4bFlagEnabled('links');
}

/** quote+lists cohort gate (task 7.1 ④). */
export function isQuoteListsEnabled(): boolean {
  return isP4bFlagEnabled('quoteLists');
}

/** fence cohort gate (task 7.1 ⑤). */
export function isFenceEnabled(): boolean {
  return isP4bFlagEnabled('fence');
}

/** task-checkbox widget gate (task 7.4 pilot). */
export function isTaskCheckboxEnabled(): boolean {
  return isP4bFlagEnabled('taskCheckbox');
}

/** code-fence language/control widget gate (task 7.4 pilot). */
export function isCodeFenceControlsEnabled(): boolean {
  return isP4bFlagEnabled('codeFenceControls');
}

/** FrontMatter safe-projection policy gate (task 7.6). */
export function isFrontmatterPolicyEnabled(): boolean {
  return isP4bFlagEnabled('frontmatterPolicy');
}

/** raw-HTML policy gate (task 7.6, design 05 §7). */
export function isRawHtmlPolicyEnabled(): boolean {
  return isP4bFlagEnabled('rawHtmlPolicy');
}

/**
 * Turn a named flag into a stable registry gate closure (`() => boolean`).
 * This is the documented bridge to `registerConstructOwner(…, { flag })` — see
 * the cohortFlags.test.ts integration proof. The closure stays a READ-ONLY
 * source of truth; nobody re-hydrates or writes from inside it.
 */
export function cohortFlagClosure(name: P4bFlagName): () => boolean {
  return (): boolean => isP4bFlagEnabled(name);
}

// ── Test/E2E control ───────────────────────────────────────────────────────

/** Test-only: force every P4B switch back to OFF and clear its localStorage
 *  key, so suites always start from the default state. NOT for production. */
export function resetAllCohortFlags(): void {
  for (const name of P4B_FLAG_NAMES) {
    switchFor(name).reset();
  }
}

// E2E-only hooks: the desktop E2E (WebDriver) flips per-cohort flags on the
// real app. Present only in `e2e` builds, never in prod.
if (import.meta.env.MODE === 'e2e') {
  const cohortHooks = {
    /** Set a P4B cohort/widget flag ON or OFF (persists the storage key). */
    set: (name: string, value: boolean): boolean => {
      if (!P4B_FLAG_NAMES.includes(name as P4bFlagName)) return false;
      setP4bFlagEnabled(name as P4bFlagName, value);
      return true;
    },
    /** Read the current ON/OFF state of a P4B cohort/widget flag. */
    isOn: (name: string): boolean => {
      return P4B_FLAG_NAMES.includes(name as P4bFlagName) && isP4bFlagEnabled(name as P4bFlagName);
    },
    /** The accepted flag names, for driver-side validation. */
    names: [...P4B_FLAG_NAMES],
  };
  (window as unknown as { __setP4bFlag?: typeof cohortHooks }).__setP4bFlag = cohortHooks;
}