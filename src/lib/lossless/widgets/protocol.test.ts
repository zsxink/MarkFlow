// P4B Widget Protocol — task 7.3 contract tests (design 05 §4).
//
// Gates under test:
//   - a full, well-formed descriptor passes `defineWidget` (frozen, registered,
//     idempotent re-definition is a no-op);
//   - a descriptor missing a commit (control/composite), a security clause, a
//     contract field, or carrying an illegal range is REJECTED with an explicit
//     protocol error;
//   - stale identity semantics: `isWidgetResultCurrent` drops a result whose
//     binding/session/document/revision no longer match;
//   - the returned descriptor is deep-frozen (nested contracts included);
//   - the range gate accepts valid half-open UTF-16 ranges and rejects inverted
//     / out-of-source ranges;
//   - raw-HTML policy surfaces are forced to exact-source fallback;
//   - the edit boundary is TYPE-level: commit returns a local CodeMirror source
//     patch (TransactionSpec[]), never a serializer/DOM string.
//
// These tests prove the PROTOCOL, not any widget rendering (task 7.4 does the
// rendering).

import { describe, it, expect, beforeEach } from 'vitest';
import type { EditorSelection, EditorState } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import {
  deepFreeze,
  defineWidget,
  getDefinedWidget,
  getDefinedWidgets,
  isWidgetResultCurrent,
  resetWidgetRegistry,
  validateSourceRangeSet,
  type SourceRangeSet,
  type WidgetCommitContext,
  type WidgetDescriptor,
  type WidgetSourceChange,
} from './protocol';

const RANGES: SourceRangeSet = {
  source: { from: 10, to: 26 },
  content: { from: 12, to: 24 },
  markers: [
    [10, 12],
    [24, 26],
  ],
};

/** A minimal but FULL descriptor (task-checkbox-shaped, task 7.4 pilot). */
function fullDescriptor(overrides: Partial<WidgetDescriptor> = {}): WidgetDescriptor {
  return {
    id: 'task-checkbox',
    kind: 'checkbox',
    ownerKind: 'listItem',
    flag: 'taskCheckbox',
    label: 'p4b.task-checkbox',
    ranges: RANGES,
    surface: { type: 'control' },
    commit: (_ctx: WidgetCommitContext): WidgetSourceChange | null => {
      // The edit boundary returns a CodeMirror source patch ONLY — no DOM, no
      // serializer string (design 05 §4).
      return {
        spec: [{ changes: [{ from: 10, to: 11, insert: '[x]' }] }],
        undoable: true,
        userEvent: 'widget.task-checkbox.toggle',
      };
    },
    interaction: { commands: ['toggle', 'space', 'home', 'end'], atomic: true, revealOnFocus: 'markers', readOnly: 'disabled' },
    atomic: true,
    async: { asyncAllowed: false, staleResultHandler: 'discard-and-log', retry: 'none' },
    security: {
      untrustedContent: false, // the label/state is derived from the task list
      allowsUnsafeHtml: false,
      containerPolicy: 'none',
      allowedUrlProtocols: [],
      externalNetworkGated: false,
    },
    accessibility: { name: 'task checkbox', role: 'checkbox', state: { checked: false }, atomic: true },
    print: { default: 'source' },
    fallbackBehavior: 'exact-source',
    hooks: {
      before: (_ctx: WidgetCommitContext) => ({ allowed: true, change: null }),
      cancel: () => {},
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetWidgetRegistry();
});

describe('widget protocol — defineWidget accepts a complete descriptor', () => {
  it('a full descriptor passes, is deep-frozen and is registered', () => {
    const w = defineWidget(fullDescriptor());
    expect(w).toBeDefined();
    expect(w.id).toBe('task-checkbox');
    expect(w.ownerKind).toBe('listItem');
    expect(w.flag).toBe('taskCheckbox');

    // Registered and retrievable.
    expect(getDefinedWidget('task-checkbox')?.id).toBe('task-checkbox');
    expect(getDefinedWidgets()).toHaveLength(1);

    // Deep-frozen: outer + nested contracts immutability.
    expect(Object.isFrozen(w)).toBe(true);
    expect(Object.isFrozen(w.interaction)).toBe(true);
    expect(Object.isFrozen(w.security)).toBe(true);
    expect(Object.isFrozen(w.accessibility)).toBe(true);
    expect(Object.isFrozen(w.print)).toBe(true);
    expect(Object.isFrozen(w.async)).toBe(true);
    expect(w.__frozen).toBe(true);
  });

  it('a concrete range input is normalized to a getter and the frozen ranges match', () => {
    const w = defineWidget(fullDescriptor());
    // ranges getter returns the same (frozen) values
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got = (w.ranges as (u: ViewUpdate) => SourceRangeSet | null)({} as ViewUpdate);
    expect(got).toEqual(RANGES);
  });

  it('idempotent re-definition with the SAME contract is a no-op, not a registry growth', () => {
    const a = defineWidget(fullDescriptor());
    const b = defineWidget(fullDescriptor());
    expect(a).toBe(b);
    expect(getDefinedWidgets()).toHaveLength(1);
  });

  it('re-definition with a DIFFERENT contract for the same id is rejected', () => {
    defineWidget(fullDescriptor());
    expect(() => defineWidget(fullDescriptor({ ownerKind: 'fence' }))).toThrow(/DIFFERENT contract/);
  });
});

describe('widget protocol — rejection gates (协议边界)', () => {
  it('rejects a control widget WITHOUT a commit (the edit boundary)', () => {
    const { commit, ...rest } = fullDescriptor();
    void commit;
    expect(() => defineWidget(rest as WidgetDescriptor)).toThrow(/MUST declare commit/);
  });

  it('rejects a descriptor WITHOUT a security declaration (design 05 §7)', () => {
    const { security, ...rest } = fullDescriptor();
    void security;
    expect(() => defineWidget(rest as WidgetDescriptor)).toThrow(/security declaration is REQUIRED/);
  });

  it('rejects allowsUnsafeHtml without a sanitize function, and ungated URL allowances', () => {
    expect(() =>
      defineWidget(fullDescriptor({ security: { ...fullDescriptor().security, allowsUnsafeHtml: true } })),
    ).toThrow(/security.sanitize is REQUIRED/);

    expect(() =>
      defineWidget(
        fullDescriptor({
          security: {
            ...fullDescriptor().security,
            allowedUrlProtocols: ['https'],
            externalNetworkGated: false,
          },
        }),
      ),
    ).toThrow(/externalNetworkGated === true/);
  });

  it('rejects an illegal (inverted / out-of-source) concrete range', () => {
    expect(() =>
      defineWidget(
        fullDescriptor({
          ranges: { source: { from: 20, to: 10 }, content: { from: 0, to: 0 }, markers: [] },
        }),
      ),
    ).toThrow(/illegal ranges/);

    expect(() =>
      defineWidget(
        fullDescriptor({
          ranges: { source: { from: 0, to: 10 }, content: { from: 20, to: 30 }, markers: [] },
        }),
      ),
    ).toThrow(/illegal ranges/);
  });

  it('rejects missing interaction / async / accessibility / print / fallback contracts', () => {
    const full = fullDescriptor();
    const { interaction, ...noInteraction } = full;
    void interaction;
    expect(() => defineWidget(noInteraction as WidgetDescriptor)).toThrow(/interaction/);

    const { async, ...noAsync } = full;
    void async;
    expect(() => defineWidget(noAsync as WidgetDescriptor)).toThrow(/async/);

    const { accessibility, ...noA11y } = full;
    void accessibility;
    expect(() => defineWidget(noA11y as WidgetDescriptor)).toThrow(/accessibility/);

    const { print, ...noPrint } = full;
    void print;
    expect(() => defineWidget(noPrint as WidgetDescriptor)).toThrow(/print/);

    const { fallbackBehavior, ...noFallback } = full;
    void fallbackBehavior;
    expect(() => defineWidget(noFallback as WidgetDescriptor)).toThrow(/fallbackBehavior/);
  });

  it('rejects an empty id and an empty label', () => {
    expect(() => defineWidget(fullDescriptor({ id: ' ' }))).toThrow(/id must be a non-empty/);
    expect(() => defineWidget(fullDescriptor({ label: '' }))).toThrow(/label must be a non-empty/);
  });

  it('rejects an unknown construct kind / unknown flag / unknown widget kind', () => {
    expect(() =>
      defineWidget(fullDescriptor({ ownerKind: 'not-a-kind' as WidgetDescriptor['ownerKind'] })),
    ).toThrow(/ownerKind must be a known construct kind/);
    expect(() =>
      defineWidget(fullDescriptor({ flag: 'not-a-flag' as WidgetDescriptor['flag'] })),
    ).toThrow(/flag must be a known P4B flag/);
    expect(() =>
      defineWidget(fullDescriptor({ kind: 'not-a-widget' as WidgetDescriptor['kind'] })),
    ).toThrow(/kind must be one of/);
  });

  it("raw-html policy surfaces are forced to exact-source fallback (设计 05 §7)", () => {
    expect(() =>
      defineWidget(
        fullDescriptor({ kind: 'raw-html', fallbackBehavior: 'readonly-error-placeholder' }),
      ),
    ).toThrow(/MUST fall back to exact source/);
  });
});

describe('widget protocol — range gate', () => {
  it('validates the half-open UTF-16 contract for valid and invalid sets', () => {
    expect(validateSourceRangeSet(RANGES)).toEqual([]);
    // Outside-document capture (harness passes docLength).
    expect(validateSourceRangeSet(RANGES, 20)).not.toEqual([]);

    expect(
      validateSourceRangeSet({ source: { from: 5, to: 5 }, content: { from: 5, to: 5 }, markers: [] }),
    ).toEqual([]);

    expect(validateSourceRangeSet({ source: { from: 5, to: 3 }, content: { from: 5, to: 5 }, markers: [] })).not.toEqual([]);
    expect(
      validateSourceRangeSet({ source: { from: 0, to: 10 }, content: { from: 0, to: 12 }, markers: [] }),
    ).not.toEqual([]);
    expect(
      validateSourceRangeSet({ source: { from: 0, to: 10 }, content: { from: 0, to: 10 }, markers: [[-1, 2]] }),
    ).not.toEqual([]);
    expect(
      validateSourceRangeSet({ source: { from: 0, to: 10 }, content: { from: 0, to: 10 }, markers: [[11, 12]] }),
    ).not.toEqual([]);
  });
});

describe('widget protocol — stale identity / cancel', () => {
  it('isWidgetResultCurrent drops results whose binding/session/document/revision no longer match', () => {
    const identity = { bindingGeneration: 1, sessionId: 7, documentId: 42, revision: 5 };
    expect(
      isWidgetResultCurrent(identity, { bindingGeneration: 1, sessionId: 7, documentId: 42, revision: 5 }),
    ).toBe(true);

    expect(
      isWidgetResultCurrent(identity, { bindingGeneration: 2, sessionId: 7, documentId: 42, revision: 5 }),
    ).toBe(false);
    expect(
      isWidgetResultCurrent(identity, { bindingGeneration: 1, sessionId: 8, documentId: 42, revision: 5 }),
    ).toBe(false);
    expect(
      isWidgetResultCurrent(identity, { bindingGeneration: 1, sessionId: 7, documentId: 43, revision: 5 }),
    ).toBe(false);
    expect(
      isWidgetResultCurrent(identity, { bindingGeneration: 1, sessionId: 7, documentId: 42, revision: 6 }),
    ).toBe(false);
  });
});

describe('widget protocol — edit boundary is source-patch-only (类型级)', () => {
  it('commit returns TransactionSpec[] and is typed to never emit DOM/serializer text', () => {
    const w = defineWidget(fullDescriptor());
    const ctx: WidgetCommitContext = {
      state: undefined as unknown as EditorState,
      selection: undefined as unknown as EditorSelection,
      identity: { bindingGeneration: 1, sessionId: 7, documentId: 42, revision: 5 },
    };
    const change = w.commit!(ctx);
    expect(change).not.toBeNull();
    // The ONLY document truth a widget may produce is a local CM source patch.
    expect(Array.isArray(change!.spec)).toBe(true);
    expect(change!.undoable).toBe(true);
    expect(change!.userEvent).toBe('widget.task-checkbox.toggle');
    // The patch is structural: doc-replacing strings are a compile-time type
    // error at the protocol boundary (ChangeSpec vs string).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes = change!.spec as any[];
    expect(changes[0]?.changes).toBeDefined();
  });

  it('the deep-freeze primitive freezes arrays and tuples used as commit specs', () => {
    // Task 7.4 will freeze its commit-spec arrays before dispatch so no later
    // caller can mutate a dispatched widget patch.
    const spec = [{ changes: [{ from: 1, to: 2, insert: 'x' }] }];
    const frozen = deepFreeze(spec);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen((frozen as { changes: unknown }[])[0])).toBe(true);
  });
});