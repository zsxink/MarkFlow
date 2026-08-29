// P4B Widget Protocol — task 7.3 contract module.
//
// This module DEFINES the contract every P4B widget must declare (design 05 §4:
// source/content/marker ranges, read-only projection vs editable control,
// focus/keyboard/selection/reveal, commit/cancel → CodeMirror PATCH-ONLY local
// source transaction + History boundary, async request identity/cancel, failure
// fallback, sanitize/CSP/URL policy, accessibility, print/export). It contains
// NO rendering and no widget implementation — task checkbox and code fence
// controls are task 7.4, image/table/diagram are P7.
//
// Hard invariants fixed here (design 05 §3/§6, specs rich-markdown-blocks §1,
// codemirror-live-preview "Atomic widget 边界"):
//
//   1. The widget DOM is NEVER the document truth. A widget may hold transient
//      control state (focused target, pending input, opened popup), but that
//      state can never round-trip into the document except through a commit
//      whose TYPE is a local CodeMirror source patch (`WidgetSourceChange`).
//   2. All ranges are UTF-16, half-open `[from, to)`, in the CodeMirror
//      `EditorState.doc` coordinate system — the same system the local Lezer
//      projection already uses (P4A ADR §3.1: Lezer is the trusted local
//      source-map and natively produces UTF-16 coordinates).
//   3. Async results carry an identity token bound to the binding/session/
//      document + revision they were requested for. Stale/mismatched results
//      are dropped by the caller, never applied (specs §5 stale/switch).
//   4. Every default surface is SECURITY-DECLARED (design 05 §7) before a
//      widget may render: no arbitrary script, no raw HTML beyond the declared
//      policy, external network/I/O gated.
//   5. Exported descriptor objects are deep-frozen. The protocol boundary is
//      static: widget authors cannot mutate a registered descriptor at runtime.
//
// `defineWidget` is the single authoring entry point: it validates a rough
// descriptor, normalizes it, deep-freezes it, and registers it. It never
// touches the DOM and never builds a transaction — it only proves the CONTRACT.
// (P4B design §0: widgets are the P4B infrastructure; real deployment of
// `widget` ownership is task 7.4.)

import type { EditorSelection, EditorState, StateCommand, TransactionSpec } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import type { P4bFlagName } from '../cohortFlags';
import { P4B_FLAG_NAMES } from '../cohortFlags';
import type { ConstructKind } from '../renderOwnerRegistry';
import { CONSTRUCT_KINDS } from '../renderOwnerRegistry';

/**
 * UTF-16 half-open source interval `[from, to)` in the CodeMirror
 * `EditorState.doc` coordinate system (identical to projection.ts
 * ConstructRange.from/to). A zero-length interval is legal: an empty construct
 * (e.g. an empty task checkbox) still owns a caret axis.
 */
export interface SourceInterval {
  from: number;
  to: number;
}

/** The three range classes every widget must expose (design 05 §4). */
export interface SourceRangeSet {
  /** The whole construct, including syntax markers. */
  source: SourceInterval;
  /** The inner content (between the markers) — may be empty. */
  content: SourceInterval;
  /**
   * Discrete marker/syntax spans — each `[from, to)` — mirroring
   * projection.ts ConstructRange.markers semantics. Each span must lie fully
   * inside `source`.
   */
  markers: Array<[number, number]>;
}

/**
 * Document-truth rule: a widget commit MUST return a local CodeMirror source
 * patch — NEVER DOM content, NEVER a serializer string (design 05 §3/§4, specs
 * "富块只是 Markdown source 的交互投影"). `TransactionSpec` is the
 * CodeMirror-native patch; offsets refer to the same `EditorState.doc`; the
 * consumer (task 7.4 harness) applies the spec through the active binding and
 * the same revision-bound patch pipeline P3 uses.
 */
export interface WidgetSourceChange {
  /** The local source patch this widget wants applied (canonical: already
   *  filtered/chosen for the active binding). */
  spec: TransactionSpec[];
  /**
   * History contract (design 05 §4 "History boundary", codemirror-live-preview
   * "Source History 在模式间唯一"): widget commits MUST join the SHARED source
   * History (one Undo undoes the whole widget edit). Declared here for the
   * harness to enforce — a widget returning `undoable: false` is a protocol
   * violation. Defaults to adding to history.
   */
  undoable?: true;
  /** Explicit History-group label (e.g. 'widget.task-checkbox.toggle'). */
  userEvent?: string;
}

/**
 * A widget edit context — the state available at a commit/cancel boundary.
 * Selection is expressed in CodeMirror source positions (never DOM offsets), so
 * a committing transaction can map the caret deterministically
 * (codemirror-live-preview "Selection 仅以 source position 映射").
 */
export interface WidgetCommitContext {
  state: EditorState;
  selection: EditorSelection;
  /** The identity the widget was mounted under. */
  identity: WidgetRequestIdentity;
}

/**
 * Request identity bound to the binding/session/document identity and the
 * source revision the ranges/edits were computed for (design 05 §2 RenderRequest
 * identity; ADR §3.3 keeps this LOCAL — no IPC). A result whose identity no
 * longer matches the current doc is STALE: it must be discarded, never applied.
 */
export interface WidgetRequestIdentity {
  /** Binding-generation token; a new value means the binding was rebuilt. */
  bindingGeneration: number;
  sessionId: number;
  documentId: number;
  /** Monotonic source revision that the ranges / preview were computed for. */
  revision: number;
}

/** URL protocol classes the security contract may permit (design 05 §7). */
export type UrlProtocol = 'http' | 'https' | 'mailto' | 'data' | 'sftp' | 'file' | 'ws' | 'wss';

/** Reads a project-level URL-allowance policy (design 05 §7). Instrumentation
 *  point: task 7.6 wires the real reader; the protocol fixes the shape. */
export interface UrlPolicyReader {
  allowed: () => boolean;
}

/**
 * Security declaration every widget MUST provide (design 05 §7,
 * rich-markdown-blocks "图表渲染遵守安全与网络策略"). Presence is REQUIRED —
 * `defineWidget` rejects a descriptor without a `security` clause.
 */
export interface WidgetSecurity {
  /** Does the rendered content derive from untrusted Markdown source text? */
  untrustedContent: boolean;
  /**
   * Does this widget, by default, mount RAW/untrusted HTML? Every sanctioned
   * raw-HTML default surface must declare it here (raw HTML policy, task 7.6).
   * A widget that declares `allowsUnsafeHtml: true` MUST also provide
   * `sanitize` and MUST keep script/event-handler/foreignObject/javascript: out
   * (design 05 §7; rich-markdown-blocks "Raw HTML 含脚本").
   */
  allowsUnsafeHtml: boolean;
  /**
   * Element sandbox: `iframe` = render may happen inside an isolated
   * iframe/WebView boundary; `dom` = plain DOM (never executing script
   * output); `none` = no markup may be mounted at all (source-only surfaces).
   */
  containerPolicy: 'iframe' | 'dom' | 'none';
  /**
   * URL protocols the widget may fetch. An EMPTY array means NO external
   * request is permitted at all. Any non-empty list is only honored when
   * `externalNetworkGated` is true (product setting + CSP + SSRF + download
   * policy gates every request — rich-markdown-blocks PlantUML scenarios).
   */
  allowedUrlProtocols: UrlProtocol[];
  /** Must be true whenever ANY external network/I/O may occur. */
  externalNetworkGated: boolean;
  /**
   * Sanitizer for raw/untrusted HTML (required when `allowsUnsafeHtml`). The
   * result must reject scripts, event-handler attributes, `javascript:` URLs,
   * `foreignObject` and oversized payloads.
   */
  sanitize?: (html: string) => { ok: boolean; html?: string };
  /** Hard cap for rendered DOM size / payload (design 05 §7 "超限 payload"). */
  maxRenderedBytes?: number;
}

/**
 * Accessibility contract (design 05 §8, P4B design §3.1): every interactive
 * widget surface MUST declare a name (screen-reader label; use the source
 * content / plain text so the reader never loses the Markdown), an ARIA role/
 * state, and an atomic scope. Widgets replace GLOBAL markers — the reader must
 * still be able to productively read and edit the source.
 */
export interface WidgetAccessibility {
  /** A11y name — normally the construct's plain-text content. */
  name: string;
  role: 'checkbox' | 'button' | 'switch' | 'combobox' | 'textbox' | 'img' | 'region' | 'listitem';
  /** Machine-readable ARIA state (e.g. `{ checked: true }`). */
  state?: Record<string, string | number | boolean>;
  /** ARIA-atomic subtree (the whole interactive widget DOM). */
  atomic: boolean;
}

/** Commands the keyboard contract may map (design 05 §4 focus/keyboard). */
export type WidgetCommandName =
  | 'toggle'
  | 'open-editor'
  | 'cancel-editor'
  | 'reveal-source'
  | 'tab'
  | 'tab-shift'
  | 'enter'
  | 'escape'
  | 'arrow'
  | 'home'
  | 'end'
  | 'space'
  | 'backspace'
  | 'delete';

/**
 * Focus/keyboard/selection/reveal contract (design 05 §4, §8;
 * codemirror-live-preview "Atomic widget 边界"). Atomic ranges drive Arrow/
 * Backspace/Delete/Select-All crossing EXPLICITLY through this contract — never
 * via browser `contenteditable=false` implicit behavior.
 */
export interface WidgetInteractionContract {
  /** Purposes the widget handles. MUST include 'toggle' for actionable
   *  controls. */
  commands: WidgetCommandName[];
  /** True: the widget's source range is atomic on the CM surface. */
  atomic: boolean;
  /**
   * Reveal strategy when the caret/selection enters the range: `markers` shows
   * the source markers (P4B keeps markers visible/dimmed; P6 true hiding is NOT
   * a P4B output — P4B design §1); `source` reveals the full source text.
   */
  revealOnFocus: 'markers' | 'source';
  /** Read-only handling: 'disabled' blocks interaction; 'readonly' keeps a
   *  focusable but non-editing surface; 'source-drop' degrades to source. */
  readOnly: 'disabled' | 'readonly' | 'source-drop';
}

/** Failure fallback (design 05 §3/§4, §9; tasks 7.6: exact-source for
 *  policy/HTML surfaces). */
export type WidgetFallbackBehavior =
  /** Exact source text in place of the widget (the ONLY sanctioned fallback). */
  | 'exact-source'
  /** Exact source + non-repeating error state + Retry affordance. */
  | 'exact-source-with-retry-error'
  /** Exact source + a safe reason annotation (e.g. safe-error placeholder). */
  | 'exact-source-with-explanation'
  /** Policy-approved read-only error placeholder until retry. */
  | 'readonly-error-placeholder';

export interface WidgetPrintPolicy {
  /** `'source'` = print/export replaces the widget with the exact source text
   *  (safe default: export never carries a live DOM). `'transient'` = the
   *  widget MAY render ephemeral content, still never serialized to bytes. */
  default: 'source' | 'transient';
}

/**
 * Async identity/cancel contract (rich-markdown-blocks "图片加载失败" /
 * "图表渲染离线或超时"). A widget owning in-flight async work MUST cancel its
 * pending request and drops any result whose identity no longer matches. The
 * local projection keeps staleness inside the CM update cycle (ADR §3.3); a
 * widget may still hold async work of its own (resource load, diagram render).
 */
export interface WidgetAsyncContract {
  /** May the widget perform async work? */
  asyncAllowed: boolean;
  /** What to do with a stale identity result — always DISCARD, never apply. */
  staleResultHandler: 'discard-and-log' | 'retry-once';
  /** Retry policy: user-initiated, count-bounded, or none (never an unbounded
   *  automatic loop). */
  retry: 'none' | 'bounded' | 'user-initiated';
}

/** A widget edit that wants mutation: before() produces a source patch. */
export interface WidgetBeforeResult {
  /** `allowed: false` = abort (no transaction at all). */
  allowed: boolean;
  /** The single source patch the widget wants applied, or null to abort. */
  change: WidgetSourceChange | null;
}

/**
 * Optional runtime hooks. All edit boundaries run through the source-patch
 * contract: `cancel()` MUST NOT produce a transaction (Escape / click-out /
 * command just aborts the transient control state).
 */
export interface WidgetRuntimeHooks {
  before?: (context: WidgetCommitContext) => WidgetBeforeResult;
  cancel?: () => void;
}

/** Stable semantic widget kinds (tasks 7.4 / 7.6). */
export type WidgetKind = 'checkbox' | 'fence-language' | 'code-control' | 'frontmatter' | 'raw-html';

export const WIDGET_KINDS: readonly WidgetKind[] = Object.freeze([
  'checkbox',
  'fence-language',
  'code-control',
  'frontmatter',
  'raw-html',
]);

/**
 * A widget MAY expose a CodeMirror `StateCommand` (design 05 §4 commit/cancel
 * surface) — the same command type the unified command router (P3 task 5.1)
 * executes. A widget command MUST only dispatch the source patch returned by
 * `commit()`; it never writes the DOM (specs "编辑命令统一产生 CodeMirror
 * transaction").
 */
export type WidgetStateCommand = StateCommand;

/**
 * The WIDGET descriptor — the complete contract every widget declares
 * (design 05 §4). `defineWidget` validates it and returns a deep-frozen copy.
 */
export interface WidgetDescriptor {
  /** Stable widget id (e.g. 'task-checkbox', 'code-fence-controls'). */
  id: string;
  /** Semantic widget kind. */
  kind: WidgetKind;
  /**
   * Construct kind this widget will own when its flag is on (renderOwnerRegistry
   * `ownerKind`; only 'widget' ownership is legal — the ownerKind VALUE names
   * the construct, e.g. 'listItem' for the task-checkbox widget).
   */
  ownerKind: ConstructKind;
  /** Independent flag gating this widget (design 05 §5: one flag per widget;
   *  OFF = inert rollback to the local/source-fallback owner). */
  flag: P4bFlagName;
  /** Stable label for logs / owner-registry source (`'p4b.task-checkbox'`). */
  label: string;
  /**
   * Source/content/marker ranges for the current doc, evaluated per update
   * (ranges shift with edits — never cache source positions). May be a concrete
   * SourceRangeSet, which `defineWidget` validates as its range gate.
   */
  ranges: ((update: ViewUpdate) => SourceRangeSet | null) | SourceRangeSet;
  /** Read-only projection vs editable control. */
  surface: { type: 'readonly' } | { type: 'control' } | { type: 'composite' };
  /**
   * THE edit boundary (design 05 §4): returns a source patch or null to abort.
   * Control/composite widgets MUST declare it; a read-only widget may omit it.
   * The function is the type-checked promise that commits never touch DOM.
   */
  commit?: (context: WidgetCommitContext) => WidgetSourceChange | null;
  /** Focus/keyboard/selection/atomic contract. */
  interaction: WidgetInteractionContract;
  /** Selection-atomic mirror (true when interaction.atomic). */
  atomic: boolean;
  /** Async identity/cancel/stale contract. */
  async: WidgetAsyncContract;
  /** Security declaration (design 05 §7). */
  security: WidgetSecurity;
  /** Accessibility name/role/state (design 05 §8). */
  accessibility: WidgetAccessibility;
  /** Print/export policy. */
  print: WidgetPrintPolicy;
  /** Failure fallback (exact-source for policy/HTML surfaces). */
  fallbackBehavior: WidgetFallbackBehavior;
  /** Optional before/cancel hooks. */
  hooks?: WidgetRuntimeHooks;
  /** Present only on the frosted descriptor returned by `defineWidget`. */
  readonly __frozen?: true;
}

/** Registry of defined widgets (id → frozen descriptor). */
const widgetRegistry = new Map<string, WidgetDescriptor>();

// ── Protocol-level helpers ──────────────────────────────────────────────────

/**
 * Stale-identity matcher (specs §5 "stale IR 返回"/"文档切换时旧结果返回").
 * Returns false when the identity a result was computed for no longer matches
 * the current binding/session/document/revision — the caller MUST discard the
 * result (and log with hashed identity per design 05 §9), never apply it.
 */
export function isWidgetResultCurrent(
  identity: WidgetRequestIdentity,
  current: Pick<WidgetRequestIdentity, 'bindingGeneration' | 'sessionId' | 'documentId' | 'revision'>,
): boolean {
  return (
    identity.bindingGeneration === current.bindingGeneration &&
    identity.sessionId === current.sessionId &&
    identity.documentId === current.documentId &&
    identity.revision === current.revision
  );
}

/**
 * Range gate: validates a `SourceRangeSet` against the UTF-16 half-open
 * contract. Used by `defineWidget` for a concrete range input and by the task
 * 7.4 harness at runtime (a range getter must never produce an illegal range).
 * A range fully outside the document (from > doc.length) is accepted here only
 * when `docLength` is omitted; the harness passes the doc length to catch it.
 */
export function validateSourceRangeSet(ranges: SourceRangeSet, docLength?: number): string[] {
  const errs: string[] = [];
  const { source, content } = ranges;
  if (source.from < 0 || source.to < source.from) errs.push(`source [${source.from}, ${source.to}) is not a valid half-open range`);
  if (content.from < source.from || content.to > source.to) errs.push(`content [${content.from}, ${content.to}) must lie inside source [${source.from}, ${source.to})`);
  if (content.from > content.to) errs.push(`content [${content.from}, ${content.to}) is inverted`);
  if (docLength !== undefined) {
    if (source.to > docLength) errs.push(`source.to ${source.to} exceeds doc length ${docLength}`);
    if (content.to > docLength) errs.push(`content.to ${content.to} exceeds doc length ${docLength}`);
  }
  for (const [mf, mt] of ranges.markers) {
    if (mf < 0 || mt < mf) errs.push(`marker [${mf}, ${mt}) is not a valid half-open range`);
    if (mf < source.from || mt > source.to) errs.push(`marker [${mf}, ${mt}) must lie inside source [${source.from}, ${source.to})`);
  }
  return errs;
}

/**
 * Deep-freeze an object (plain objects, arrays, tuples and functions). The
 * protocol's public immutability primitive — task 7.4 widget harnesses use it
 * to freeze their commit-transaction specs before dispatch.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  } else if (typeof value === 'function') {
    Object.freeze(value);
  }
  return value;
}

// ── `defineWidget` — the authoring boundary ─────────────────────────────────

/**
 * Authoring entry point for a P4B widget. Validates the descriptor's contract
 * and returns a DEEP-FROZEN, REGISTERED descriptor, or throws an explicit
 * protocol error. Rejected inputs include (but are not limited to):
 *
 *   - empty id / missing label / unknown ownerKind / unknown flag / unknown
 *     widget kind;
 *   - a CONTROL/COMPOSITE widget without a `commit` function (the edit boundary);
 *   - a missing or self-contradictory `security` declaration (design 05 §7);
 *   - an illegal concrete `SourceRangeSet` (inverted / out-of-source ranges);
 *   - missing interaction / async / accessibility / print / fallback contracts;
 *   - `allowsUnsafeHtml: true` without a `sanitize` function, or any URL
 *     allowance without `externalNetworkGated`;
 *   - a non-exact-source fallback for the policy/raw-html surfaces.
 *
 * The returned descriptor is deep-frozen (nested contracts included) — a
 * runtime mutation of a registered descriptor is a contradiction and is
 * impossible by construction.
 */
export function defineWidget(input: WidgetDescriptor): WidgetDescriptor {
  const errs: string[] = [];

  if (typeof input.id !== 'string' || input.id.trim() === '') {
    errs.push('id must be a non-empty string');
  }
  if (input.label == null || input.label.trim() === '') {
    errs.push('label must be a non-empty string');
  }
  if (!WIDGET_KINDS.includes(input.kind)) {
    errs.push(`kind must be one of ${WIDGET_KINDS.join('|')}, got "${String(input.kind)}"`);
  }
  if (!CONSTRUCT_KINDS.includes(input.ownerKind)) {
    errs.push(`ownerKind must be a known construct kind, got "${String(input.ownerKind)}"`);
  }
  if (!P4B_FLAG_NAMES.includes(input.flag)) {
    errs.push(`flag must be a known P4B flag, got "${String(input.flag)}"`);
  }

  // Edit boundary: control/composite widgets MUST declare commit().
  const editable = input.surface.type === 'control' || input.surface.type === 'composite';
  if (editable && typeof input.commit !== 'function') {
    errs.push('control/composite widget MUST declare commit() (the edit boundary)');
  }
  if (!editable && typeof input.commit === 'function') {
    // A read-only widget may still declare commit but it must never produce a
    // change — that is a soft check, not an error; documented in the type.
  }

  // Interaction contract.
  if (input.interaction == null || !Array.isArray(input.interaction.commands) || input.interaction.commands.length === 0) {
    errs.push('interaction.commands is REQUIRED (non-empty)');
  }
  if (input.interaction && input.interaction.atomic !== true && input.interaction.atomic !== false) {
    errs.push('interaction.atomic is REQUIRED (boolean)');
  }
  if (input.interaction && input.interaction.revealOnFocus !== 'markers' && input.interaction.revealOnFocus !== 'source') {
    errs.push('interaction.revealOnFocus must be "markers" | "source"');
  }
  if (
    input.interaction &&
    input.interaction.readOnly !== 'disabled' &&
    input.interaction.readOnly !== 'readonly' &&
    input.interaction.readOnly !== 'source-drop'
  ) {
    errs.push('interaction.readOnly must be "disabled" | "readonly" | "source-drop"');
  }

  // Async contract.
  if (input.async == null || typeof input.async.asyncAllowed !== 'boolean') {
    errs.push('async contract (asyncAllowed) is REQUIRED');
  }
  if (
    input.async &&
    input.async.staleResultHandler !== 'discard-and-log' &&
    input.async.staleResultHandler !== 'retry-once'
  ) {
    errs.push('async.staleResultHandler must be "discard-and-log" | "retry-once"');
  }

  // Security contract (design 05 §7).
  if (input.security == null) {
    errs.push('security declaration is REQUIRED (design 05 §7)');
  } else {
    const s = input.security;
    if (typeof s.untrustedContent !== 'boolean') errs.push('security.untrustedContent must be a boolean');
    if (typeof s.allowsUnsafeHtml !== 'boolean') errs.push('security.allowsUnsafeHtml must be a boolean');
    if (s.containerPolicy !== 'iframe' && s.containerPolicy !== 'dom' && s.containerPolicy !== 'none') {
      errs.push('security.containerPolicy must be "iframe" | "dom" | "none"');
    }
    if (s.allowsUnsafeHtml === true && typeof s.sanitize !== 'function') {
      errs.push('security.sanitize is REQUIRED when allowsUnsafeHtml is true (raw HTML policy)');
    }
    if (Array.isArray(s.allowedUrlProtocols) && s.allowedUrlProtocols.length > 0 && s.externalNetworkGated !== true) {
      errs.push('any allowedUrlProtocols REQUIRES security.externalNetworkGated === true (design 05 §7)');
    }
  }

  // Accessibility / print / fallback.
  if (input.accessibility == null || typeof input.accessibility.name !== 'string' || input.accessibility.name.trim() === '') {
    errs.push('accessibility.name is REQUIRED (design 05 §8)');
  }
  if (input.print == null || (input.print.default !== 'source' && input.print.default !== 'transient')) {
    errs.push('print policy is REQUIRED: "source" | "transient"');
  }
  if (
    input.fallbackBehavior == null ||
    (input.fallbackBehavior !== 'exact-source' &&
      input.fallbackBehavior !== 'exact-source-with-retry-error' &&
      input.fallbackBehavior !== 'exact-source-with-explanation' &&
      input.fallbackBehavior !== 'readonly-error-placeholder')
  ) {
    errs.push('fallbackBehavior is REQUIRED (one of the exact-source variants)');
  }
  // Policy surfaces may NEVER fall back to anything but the exact source
  // (design 05 §7 + rich-markdown-blocks "Raw HTML 含脚本" / "复杂 FrontMatter").
  if (
    input.kind === 'raw-html' &&
    input.fallbackBehavior !== undefined &&
    input.fallbackBehavior !== 'exact-source' &&
    input.fallbackBehavior !== 'exact-source-with-explanation'
  ) {
    errs.push('raw-html policy surface MUST fall back to exact source (design 05 §7)');
  }

  // Concrete range input: validate immediately.
  let ranges: (update: ViewUpdate) => SourceRangeSet | null;
  if (typeof input.ranges === 'function') {
    ranges = input.ranges;
  } else if (input.ranges && typeof input.ranges === 'object') {
    const rangeErrs = validateSourceRangeSet(input.ranges);
    if (rangeErrs.length > 0) {
      errs.push(`illegal ranges:\n   - ${rangeErrs.join('\n   - ')}`);
    }
    const frozenRanges = deepFreeze(input.ranges) as SourceRangeSet;
    ranges = () => frozenRanges;
  } else {
    errs.push('ranges must be a getter function or a concrete SourceRangeSet');
    // Definite-assignment: the error above throws before `ranges` is consumed.
    ranges = () => null;
  }

  if (errs.length > 0) {
    throw new Error(`widget protocol: invalid descriptor${input.id ? ` "${input.id}"` : ''}:\n- ${errs.join('\n- ')}`);
  }

  const normalized: WidgetDescriptor = {
    ...input,
    ranges,
    atomic: typeof input.atomic === 'boolean' ? input.atomic : Boolean(input.interaction?.atomic),
    // Normalize the surface union so it is always a literal-shaped object.
    surface: Object.freeze({ type: input.surface.type }) as WidgetDescriptor['surface'],
    interaction: input.interaction,
    async: input.async,
    security: input.security,
    accessibility: input.accessibility,
    print: { ...input.print },
    hooks: input.hooks,
    commit: input.commit,
    __frozen: true,
  };

  const existing = widgetRegistry.get(normalized.id);
  if (existing) {
    // Idempotence is judged on the STRUCTURAL contract (id/kind/ownerKind/flag/
    // label/surface/fallback + commit PRESENCE), never on function identity —
    // a re-init of the same module naturally creates fresh closures. A real
    // divergence in any contract field is a hard error (uniqueness invariant).
    if (
      existing.kind !== normalized.kind ||
      existing.ownerKind !== normalized.ownerKind ||
      existing.flag !== normalized.flag ||
      existing.label !== normalized.label ||
      existing.surface.type !== normalized.surface.type ||
      existing.fallbackBehavior !== normalized.fallbackBehavior ||
      Boolean(existing.commit) !== Boolean(normalized.commit)
    ) {
      throw new Error(`widget protocol: widget id "${normalized.id}" already defined with a DIFFERENT contract`);
    }
    return existing;
  }

  const frozen = deepFreeze(normalized) as WidgetDescriptor;
  widgetRegistry.set(frozen.id, frozen);
  return frozen;
}

/** All defined widgets (id → frozen descriptor), for tests / E2E snapshots. */
export function getDefinedWidgets(): readonly WidgetDescriptor[] {
  return [...widgetRegistry.values()];
}

/** Look up a defined widget by stable id. */
export function getDefinedWidget(id: string): WidgetDescriptor | undefined {
  return widgetRegistry.get(id);
}

/** Test-only: clear the registry (never used in production). */
export function resetWidgetRegistry(): void {
  widgetRegistry.clear();
}