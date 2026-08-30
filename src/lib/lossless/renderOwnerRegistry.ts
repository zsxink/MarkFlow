// Construct owner registry — local form (P4A task 6.5, ADR §3.3).
//
// ADR `adr-parser-source-map-render-ir.md` froze the P4A terminal state
// `SPIKE_COMPLETE_NO_CORE_IR`: no Core Render IR is introduced and there is no
// IPC render protocol. The viewport/cancel/stale/degraded request protocol of
// design/05 §2 is therefore NOT APPLICABLE — the local projection already
// handles visible-range rebuild, staleness and degraded fallback inside the
// CodeMirror update cycle (P2 tasks 4.5/4.10/4.13). What remains of task 6.5 is
// the CONSTRUCT OWNER REGISTRY in its local form: at any render moment exactly
// ONE owner is responsible for each construct kind —
//
//   'local'            the CodeMirror Lezer projection in projection.ts;
//   'source-fallback'  the exact source text (no decorations at all);
//   'widget'           a P4B cohort/widget (tasks §7) — reserved extension
//                      point, nothing registers it in P4A;
//   'core'             a future Core-IR producer — TYPE-LEVEL PLACEHOLDER ONLY.
//                      The ADR reopens (ADR §5) if e.g. a qualified Rust parser
//                      appears, huge docs hit a UI-thread parse bottleneck, or
//                      P6 hidden-markers needs Core-side ranges. Until that
//                      re-negotiation nothing may register `core` (rejected at
//                      runtime below).
//
// design/05 §2 gives every render block an `owner`; design/05 §5 requires every
// cohort/widget to be independently flag-gated so one failing cohort can only
// close itself, never the base Live Preview. Hence `registerConstructOwner`
// accepts a `flag` gate: while the flag is off the registration is inert and
// resolution falls back to the default owner.
//
// Conflict rules (explicit and simple):
//   1. The default registry is the STATIC table below and 1:1 replicates the
//      pre-registry `classifyNode` behavior of projection.ts (enforced by the
//      parity oracle tests) — `local` for the nine projected kinds,
//      `source-fallback` for everything else.
//   2. Dynamic registration may only hand a kind to 'widget' or
//      'source-fallback'. 'local' is the built-in owner and not dynamically
//      registrable; 'core' is rejected outright (no Core IR exists — ADR §3.2).
//   3. Several dynamic registrations of the same kind may coexist: the LAST
//      ACTIVE one wins (an entry is active when its flag is absent or currently
//      true; if none is active the default owner applies). Overriding an
//      existing same-kind registration logs a structured warning and is
//      recorded in the debug snapshot — conflicts are detectable, never
//      silently swallowed.
//   4. The uniqueness invariant holds by construction: resolution is a pure
//      function of (kind, current flag states) → exactly one owner.
//
// Observability (design/05 §9): the debug snapshot contains ONLY the kind→owner
// map, registration/conflict counters and source labels — never document text.

import { logWarn } from '../logger';

/** Who renders a construct kind at a given render moment. */
export type ConstructOwner = 'local' | 'source-fallback' | 'widget' | 'core';

/**
 * Semantic construct kinds. The first nine are projected locally today (the
 * `cls`/`level` METADATA stays owned by projection.ts); the rest are the
 * exact-source fallback classes `classifyNode` returned null for. The
 * `taskCheckbox` identity deliberately names only the GFM `TaskMarker` slot:
 * its enclosing `listItem` remains local, so a task widget never steals the
 * list container or list marker. `codeFenceControls` likewise names the
 * opening fence/control slot, leaving the FencedCode local projection intact.
 * `unknown` covers every Lezer node name without a dedicated mapping.
 */
export type ConstructKind =
  | 'heading'
  | 'strong'
  | 'emphasis'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'blockquote'
  | 'listItem'
  | 'taskCheckbox'
  | 'fence'
  | 'codeFenceControls'
  | 'htmlBlock'
  | 'table'
  | 'frontmatter'
  | 'image'
  | 'footnoteDefinition'
  | 'unknown';

/** All known kinds, in declaration order (used to build snapshots / tests). */
export const CONSTRUCT_KINDS: readonly ConstructKind[] = [
  'heading',
  'strong',
  'emphasis',
  'strikethrough',
  'inlineCode',
  'link',
  'blockquote',
  'listItem',
  'taskCheckbox',
  'fence',
  'codeFenceControls',
  'htmlBlock',
  'table',
  'frontmatter',
  'image',
  'footnoteDefinition',
  'unknown',
];

/**
 * The STATIC default registry — 1:1 replication of the pre-registry
 * `classifyNode` (projection.ts): nine locally projected kinds, everything else
 * exact-source. This table is the parity baseline; do not change it without
 * changing projection.ts behavior in the same commit.
 */
const DEFAULT_OWNERS: Readonly<Record<ConstructKind, ConstructOwner>> = Object.freeze({
  heading: 'local',
  strong: 'local',
  emphasis: 'local',
  strikethrough: 'local',
  inlineCode: 'local',
  link: 'local',
  blockquote: 'local',
  listItem: 'local',
  // A Task node is a child of ListItem. It is source-fallback until the
  // independently gated checkbox widget claims just its marker slot.
  taskCheckbox: 'source-fallback',
  fence: 'local',
  // Controls are a child slot at the opening fence marker, not a replacement
  // for the locally projected FencedCode construct.
  codeFenceControls: 'source-fallback',
  htmlBlock: 'source-fallback',
  table: 'source-fallback',
  frontmatter: 'source-fallback',
  image: 'source-fallback',
  footnoteDefinition: 'source-fallback',
  unknown: 'source-fallback',
});

/** Owners a dynamic registration may request. */
const DYNAMIC_OWNERS: readonly ConstructOwner[] = ['widget', 'source-fallback'];

export interface ConstructOwnerRegistrationOptions {
  /**
   * Flag gate (design/05 §5: every cohort/widget is independently flag-gated).
   * Evaluated at RESOLUTION time — while it returns false the registration is
   * inert and the kind resolves to its default owner. A throwing flag is
   * treated as off so a broken gate can never break projection builds.
   */
  flag?: () => boolean;
  /** Stable label for conflict logs / snapshots (e.g. 'p4b.table-widget'). */
  label?: string;
}

export interface OwnerResolution {
  owner: ConstructOwner;
  /** Which registry entry produced the owner: 'default' or the entry label. */
  source: string;
}

export interface OwnerConflictRecord {
  kind: ConstructKind;
  /** Source label of the superseded registration. */
  supersededSource: string;
  /** Source label of the winning (later) registration. */
  source: string;
}

/**
 * Read-only debug/E2E snapshot (design/05 §9): kind→owner map and counters
 * only — never document text.
 */
export interface OwnerRegistrySnapshot {
  /** EFFECTIVE owner per kind (flag states applied at snapshot time). */
  owners: Readonly<Record<ConstructKind, ConstructOwner>>;
  /** Dynamic registrations currently held (active + inert). */
  registered: number;
  /** Dynamic registrations currently active (flag absent or true). */
  active: number;
  /** Cumulative same-kind override count since module load / last reset. */
  conflicts: number;
  /** Details of the most recent override, if any. */
  lastConflict: OwnerConflictRecord | null;
}

interface RegistryEntry {
  owner: (typeof DYNAMIC_OWNERS)[number];
  flag?: () => boolean;
  source: string;
}

// Dynamic registrations per kind, in registration order. Kept tiny: P4B cohorts
// register a handful of kinds at module init, so a linear last-active scan is
// cheaper than any index maintenance.
const dynamic = new Map<ConstructKind, RegistryEntry[]>();
let conflicts = 0;
let lastConflict: OwnerConflictRecord | null = null;
let seq = 0;

function isEntryActive(entry: RegistryEntry): boolean {
  if (!entry.flag) return true;
  try {
    return !!entry.flag();
  } catch {
    // A throwing flag gate is treated as OFF (fail closed): the registration
    // goes inert instead of breaking the projection build path.
    return false;
  }
}

function lastActiveEntry(entries: RegistryEntry[]): RegistryEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isEntryActive(entries[i])) return entries[i];
  }
  return null;
}

/**
 * Register a dynamic owner for `kind` (P4B extension point). Only
 * 'widget' | 'source-fallback' are accepted — 'local' is the built-in owner and
 * 'core' is the ADR-reserved placeholder (ADR §3.2/§5). Re-registering a kind
 * that already has a dynamic registration is allowed (last active wins) but
 * records a detectable conflict. Returns the teardown function (idempotent).
 */
export function registerConstructOwner(
  kind: ConstructKind,
  owner: ConstructOwner,
  opts: ConstructOwnerRegistrationOptions = {},
): () => void {
  // hasOwnProperty (NOT `in`): `in` walks the prototype chain, so a JS caller
  // passing a name like 'toString' would otherwise register a ghost kind via
  // Object.prototype.
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_OWNERS, kind)) {
    throw new Error(`renderOwnerRegistry: unknown construct kind "${String(kind)}"`);
  }
  if (owner === 'core') {
    throw new Error(
      "renderOwnerRegistry: owner 'core' is reserved for a future Core-IR producer (ADR §3.2/§5) and cannot be registered",
    );
  }
  if (!DYNAMIC_OWNERS.includes(owner)) {
    throw new Error(
      `renderOwnerRegistry: dynamic registration must be 'widget' | 'source-fallback', got "${String(owner)}"`,
    );
  }

  const source = opts.label?.trim() || `dynamic-${++seq}`;
  const entries = dynamic.get(kind);
  if (entries && entries.length > 0) {
    // Same-kind re-registration: allowed (last active wins) but NEVER silent.
    conflicts += 1;
    lastConflict = { kind, supersededSource: entries[entries.length - 1].source, source };
    logWarn('renderOwnerRegistry', 'construct owner override for kind', {
      kind,
      supersededSource: entries[entries.length - 1].source,
      source,
      owner,
    });
  }

  const entry: RegistryEntry = { owner, flag: opts.flag, source };
  if (entries) {
    entries.push(entry);
  } else {
    dynamic.set(kind, [entry]);
  }

  let tornDown = false;
  return () => {
    if (tornDown) return;
    tornDown = true;
    const current = dynamic.get(kind);
    if (!current) return;
    const idx = current.indexOf(entry);
    if (idx >= 0) current.splice(idx, 1);
    if (current.length === 0) dynamic.delete(kind);
  };
}

/**
 * Resolve the unique owner of `kind` at the CURRENT moment. Invariant: for any
 * kind, any flag state, this returns exactly one owner — the last active
 * dynamic registration, else the static default.
 */
export function resolveConstructOwner(kind: ConstructKind): OwnerResolution {
  const entries = dynamic.get(kind);
  if (entries) {
    const entry = lastActiveEntry(entries);
    if (entry) return { owner: entry.owner, source: entry.source };
  }
  // Defensive: an out-of-table kind (JS callers) degrades to exact source.
  // hasOwnProperty keeps the Object.prototype chain out of the lookup — a bare
  // `DEFAULT_OWNERS[kind] ?? …` would resolve 'toString' to the INHERITED
  // function and hand a bogus owner to the projection.
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_OWNERS, kind)) {
    return { owner: 'source-fallback', source: 'default' };
  }
  return { owner: DEFAULT_OWNERS[kind], source: 'default' };
}

// ── Task 7.5: parent/child editable-slot arbitration ─────────────────────────
//
// `resolveConstructOwner(kind)` answers WHO owns a construct kind at a render
// moment. The arbitration below answers a second, orthogonal question: given a
// CHILD construct nested strictly inside a PARENT construct's editable span,
// who owns the editable region? This is needed because a widget that owns a
// source span must yield/block a nested child widget ownership inside that
// span — otherwise two active widgets whose DOM ranges nest would fight over
// the same editable region.
//
// The unit of arbitration is an `EditableSlot`: an owner + the UTF-16
// `[from, to)` span (EditorState.doc coords) that owner actually edits. A
// widget's editable span is its DECLARED marker/interaction slot
// (widget protocol SourceRangeSet.markers), NOT its whole `source` construct
// range — so the `taskCheckbox` child identity owns only the 3-byte `[ ]`
// marker while its `listItem` parent and inner strong/emphasis/link stay local.
//
// This helper is PURE (registry owners + spans only — no DOM, no module state)
// and returns exactly ONE slot per call, so it cannot break the unique-owner
// invariant. `resolveNestedEditableSlot` is the production bridge consumed by
// the P4B task/fence widget builder before it mounts a child marker slot; the
// projection independently keeps each local parent decoration and suppresses
// only the explicitly widget-owned task marker.

/** An OWNER plus the UTF-16 `[from, to)` editable region it claims. */
export interface EditableSlot {
  owner: ConstructOwner;
  /** Which registry entry produced the owner (label or 'default'). */
  source: string;
  from: number;
  to: number;
}

/**
 * Resolve the editable slot a construct KIND claims at `[from, to)` using the
 * registry's CURRENT owner (flag closures evaluated at call time). Pure.
 */
export function editableSlotFor(kind: ConstructKind, from: number, to: number): EditableSlot {
  const { owner, source } = resolveConstructOwner(kind);
  return { owner, source, from, to };
}

/** A construct identity and the precise source slot it occupies. */
export interface ConstructEditableSlot {
  kind: ConstructKind;
  from: number;
  to: number;
}

export interface ArbitrateNestedOptions {
  /**
   * Child-yielding exemption: a PARENT widget may opt to hand its editable
   * region to a nested child widget whose registry `source` label matches. This
   * is the ONLY way a nested widget beats a parent widget. Default: never yield.
   */
  parentYieldsTo?: (childSource: string) => boolean;
}

/**
 * Arbitrate the effective editable slot for `child` given that it nests inside
 * `parent`'s editable span (task 7.5). Pure; returns exactly one slot.
 *
 * Rule (precedence order):
 *   1. NOT nested: if `child` does not lie properly inside `parent`'s span the
 *      editable regions don't overlap → no arbitration → child unchanged. This
 *      is the listItem case: the task widget's editable slot is only the 3-byte
 *      marker, so an inner strong/emphasis/link is NOT inside it → stays local.
 *   2. source-fallback parent: children of exact-source NEVER get widget DOM
 *      (nor local decoration) — the child degrades to exact source.
 *   3. BOTH widget: the PARENT widget wins the editable region
 *      (`{widget, parent.source, parent.from, parent.to}`) unless
 *      `parentYieldsTo(child.source)` → child wins.
 *   4. Exactly one widget: the widget wins. A parent widget consumes a local
 *      child (returns the parent widget slot); a child widget keeps its own
 *      slot over a local parent.
 *   5. Neither is a widget: both stay their default owners → child unchanged.
 */
export function arbitrateNestedOwner(
  parent: EditableSlot,
  child: EditableSlot,
  options?: ArbitrateNestedOptions,
): EditableSlot {
  const nested =
    child.from >= parent.from &&
    child.to <= parent.to &&
    !(child.from === parent.from && child.to === parent.to);
  // 1. Not nested → no conflict.
  if (!nested) return child;
  // 2. source-fallback parent never grants widget (or local) DOM to a child.
  if (parent.owner === 'source-fallback') {
    return { owner: 'source-fallback', source: 'default', from: child.from, to: child.to };
  }
  // 3. Both widget: parent by default; a declared yield flips to the child.
  if (parent.owner === 'widget' && child.owner === 'widget') {
    if (options?.parentYieldsTo?.(child.source)) return child;
    return { owner: parent.owner, source: parent.source, from: parent.from, to: parent.to };
  }
  // 4. Exactly one widget: the widget owns the editable region.
  if (parent.owner === 'widget') {
    return { owner: parent.owner, source: parent.source, from: parent.from, to: parent.to };
  }
  if (child.owner === 'widget') {
    return child;
  }
  // 5. Neither widget → default owners, no change.
  return child;
}

/**
 * Runtime bridge for nested source constructs. It deliberately resolves both
 * construct identities at call time and delegates conflict policy to
 * `arbitrateNestedOwner`; callers must not duplicate that precedence logic.
 *
 * The task-checkbox pilot calls this with the full ListItem source span as the
 * parent and the three-byte TaskMarker span as the child. Consequently the
 * default local list owner retains its container/list-marker decoration while
 * an enabled `taskCheckbox` widget owns only `[ ]`/`[x]`.
 */
export function resolveNestedEditableSlot(
  parent: ConstructEditableSlot,
  child: ConstructEditableSlot,
  options?: ArbitrateNestedOptions,
): EditableSlot {
  return arbitrateNestedOwner(
    editableSlotFor(parent.kind, parent.from, parent.to),
    editableSlotFor(child.kind, child.from, child.to),
    options,
  );
}

/** Read-only debug/E2E snapshot — kind→owner map and counters, no body text. */
export function getOwnerRegistrySnapshot(): OwnerRegistrySnapshot {
  const owners = {} as Record<ConstructKind, ConstructOwner>;
  for (const kind of CONSTRUCT_KINDS) {
    owners[kind] = resolveConstructOwner(kind).owner;
  }
  let registered = 0;
  let active = 0;
  for (const entries of dynamic.values()) {
    registered += entries.length;
    for (const entry of entries) {
      if (isEntryActive(entry)) active += 1;
    }
  }
  return Object.freeze({
    owners: Object.freeze(owners),
    registered,
    active,
    conflicts,
    lastConflict: lastConflict ? { ...lastConflict } : null,
  });
}

/**
 * Test-only: clear every dynamic registration and conflict bookkeeping so
 * suites start from the static default registry. NOT for production use.
 */
export function resetOwnerRegistry(): void {
  dynamic.clear();
  conflicts = 0;
  lastConflict = null;
  seq = 0;
}
