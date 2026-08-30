// Unit tests for the construct owner registry — P4A task 6.5, ADR §3.3.
//
// Core invariant under test: for ANY construct kind and ANY
// registration/flag state, `resolveConstructOwner` returns EXACTLY ONE owner
// (last active dynamic registration, else the static default).
//
// Additional gates:
//   - the static default registry replicates the pre-registry `classifyNode`
//     of projection.ts 1:1 (name-level parity oracle against a FROZEN copy);
//   - dynamic registrations (P4B cohorts/widgets) may only hand a kind to
//     'widget' | 'source-fallback' under a flag; 'core' and 'local' are
//     rejected;
//   - same-kind re-registration conflicts are DETECTABLE (snapshot counters +
//     structured lastConflict), never silently swallowed;
//   - the projection classification consumes the registry: non-local owners
//     stand the local projection down, teardown restores it.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONSTRUCT_KINDS,
  arbitrateNestedOwner,
  editableSlotFor,
  getOwnerRegistrySnapshot,
  registerConstructOwner,
  resetOwnerRegistry,
  resolveNestedEditableSlot,
  resolveConstructOwner,
  type ConstructKind,
  type EditableSlot,
} from './renderOwnerRegistry';
import { classifyLezerNode, PROJECTION_CLASSES } from './projection';

const LOCAL_KINDS: ConstructKind[] = [
  'heading',
  'strong',
  'emphasis',
  'strikethrough',
  'inlineCode',
  'link',
  'blockquote',
  'listItem',
  'fence',
];

const FALLBACK_KINDS: ConstructKind[] = [
  'htmlBlock',
  'taskCheckbox',
  'codeFenceControls',
  'table',
  'frontmatter',
  'image',
  'footnoteDefinition',
  'unknown',
];

// FROZEN copy of the pre-registry `classifyNode` (projection.ts before the
// task 6.5 wiring) — the behavior-preservation oracle. Do NOT "update" it when
// the wired classifier changes: it may only change when the PRODUCT behavior
// intentionally changes (together with the frozen ConstructRange golden in
// projection.test.ts).
function legacyClassifyNode(name: string): { cls: string; level?: number } | null {
  if (name.startsWith('ATXHeading')) {
    const level = Number(name.slice('ATXHeading'.length)) || 1;
    return { cls: PROJECTION_CLASSES.heading, level };
  }
  if (name.startsWith('SetextHeading')) {
    return { cls: PROJECTION_CLASSES.heading, level: name.endsWith('2') ? 2 : 1 };
  }
  switch (name) {
    case 'StrongEmphasis':
      return { cls: PROJECTION_CLASSES.strong };
    case 'Emphasis':
      return { cls: PROJECTION_CLASSES.emphasis };
    case 'Strikethrough':
      return { cls: PROJECTION_CLASSES.strikethrough };
    case 'InlineCode':
      return { cls: PROJECTION_CLASSES.inlineCode };
    case 'Link':
    case 'URL':
      return { cls: PROJECTION_CLASSES.link };
    case 'Blockquote':
      return { cls: PROJECTION_CLASSES.blockquote };
    case 'ListItem':
      return { cls: PROJECTION_CLASSES.listItem };
    case 'FencedCode':
      return { cls: PROJECTION_CLASSES.fence };
    default:
      return null;
  }
}

// Every Lezer node name the projection can observe: all locally projected
// kinds, the explicit fallback mappings, and the structural/inline names that
// hit 'unknown' (incl. delimiter names, which the real buildDecorations
// consumes as marker spans BEFORE classification — see projection.ts).
const ORACLE_NODE_NAMES = [
  'ATXHeading', 'ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
  'SetextHeading1', 'SetextHeading2', 'SetextHeading3',
  'StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode', 'Link', 'URL',
  'Blockquote', 'ListItem', 'FencedCode',
  'HTMLBlock', 'Comment', 'ProcessingInstruction',
  'Table', 'TableHeader', 'TableRow', 'TableCell', 'TableDelimiter',
  'Image', 'FrontMatter', 'FootnoteDefinition',
  'Document', 'Paragraph', 'CodeBlock', 'CodeText', 'CodeMark', 'HardBreak', 'Escape',
  'Autolink', 'LinkLabel', 'LinkMark', 'EmphasisMark', 'StrongEmphasisMark',
  'HeaderMark', 'ListMark', 'BlockquoteMark', 'QuoteMark', 'Task', 'TaskMarker',
  'StrikethroughMark', 'ImageMark', 'ThematicBreak', 'HTMLTag',
];

beforeEach(() => {
  resetOwnerRegistry();
});

describe('renderOwnerRegistry — static default registry', () => {
  it('resolves every kind to a unique default owner (task 6.5 default table)', () => {
    for (const kind of LOCAL_KINDS) {
      expect(resolveConstructOwner(kind)).toEqual({ owner: 'local', source: 'default' });
    }
    for (const kind of FALLBACK_KINDS) {
      expect(resolveConstructOwner(kind)).toEqual({ owner: 'source-fallback', source: 'default' });
    }
    // The two lists partition the declared kind set exactly.
    expect([...LOCAL_KINDS, ...FALLBACK_KINDS].sort()).toEqual([...CONSTRUCT_KINDS].sort());
  });

  it('unknown kinds are rejected at registration and degrade to source-fallback at resolution', () => {
    expect(() => registerConstructOwner('nope' as ConstructKind, 'widget')).toThrow(/unknown construct kind/);
    // Defensive runtime resolution for a JS caller with a bogus kind.
    expect(resolveConstructOwner('made-up' as ConstructKind)).toEqual({
      owner: 'source-fallback',
      source: 'default',
    });
  });

  it("prototype-chain names ('toString'/'constructor'/'hasOwnProperty') are not registrable and degrade to source-fallback", () => {
    // Regression: `in` / a bare index read walk the Object.prototype chain, so
    // these names used to register a ghost kind / resolve to the INHERITED
    // function. Both paths must be prototype-chain proof.
    for (const protoName of ['toString', 'constructor', 'hasOwnProperty'] as unknown as ConstructKind[]) {
      expect(() => registerConstructOwner(protoName, 'widget')).toThrow(/unknown construct kind/);
      expect(resolveConstructOwner(protoName)).toEqual({ owner: 'source-fallback', source: 'default' });
    }
    const snap = getOwnerRegistrySnapshot();
    expect(snap.registered).toBe(0);
    expect(snap.conflicts).toBe(0);
  });
});

describe('renderOwnerRegistry — dynamic registration', () => {
  it('upgrades a kind to widget and teardown restores the default owner', () => {
    const unregister = registerConstructOwner('strong', 'widget', { label: 'p4b.strong-cohort' });
    expect(resolveConstructOwner('strong')).toEqual({ owner: 'widget', source: 'p4b.strong-cohort' });
    unregister();
    expect(resolveConstructOwner('strong')).toEqual({ owner: 'local', source: 'default' });

    // A fallback kind can also be handed to a future widget (e.g. table).
    const unTable = registerConstructOwner('table', 'widget', { label: 'p4b.table-widget' });
    expect(resolveConstructOwner('table').owner).toBe('widget');
    unTable();
    expect(resolveConstructOwner('table').owner).toBe('source-fallback');
  });

  it('auto-generates a source label when none is provided', () => {
    registerConstructOwner('link', 'widget');
    const resolution = resolveConstructOwner('link');
    expect(resolution.owner).toBe('widget');
    expect(resolution.source).toMatch(/^dynamic-\d+$/);
  });

  it('flag gating: an inert registration falls back to the default owner', () => {
    let flagOn = false;
    const unregister = registerConstructOwner('link', 'widget', {
      label: 'p4b.link-cohort',
      flag: () => flagOn,
    });
    expect(resolveConstructOwner('link')).toEqual({ owner: 'local', source: 'default' });
    flagOn = true;
    expect(resolveConstructOwner('link')).toEqual({ owner: 'widget', source: 'p4b.link-cohort' });
    flagOn = false;
    expect(resolveConstructOwner('link')).toEqual({ owner: 'local', source: 'default' });
    unregister();
    expect(resolveConstructOwner('link')).toEqual({ owner: 'local', source: 'default' });
  });

  it('a throwing flag gate is treated as off (fail closed, never breaks resolution)', () => {
    registerConstructOwner('emphasis', 'widget', {
      flag: () => {
        throw new Error('broken gate');
      },
    });
    expect(resolveConstructOwner('emphasis')).toEqual({ owner: 'local', source: 'default' });
  });

  it('teardown is idempotent and re-registration after teardown is NOT a conflict', () => {
    const unregister = registerConstructOwner('inlineCode', 'source-fallback', { label: 'a' });
    expect(getOwnerRegistrySnapshot().registered).toBe(1);
    unregister();
    unregister(); // idempotent
    const after = getOwnerRegistrySnapshot();
    expect(after.registered).toBe(0);
    expect(after.active).toBe(0);
    expect(resolveConstructOwner('inlineCode')).toEqual({ owner: 'local', source: 'default' });

    const reRegister = registerConstructOwner('inlineCode', 'source-fallback', { label: 'b' });
    const snap = getOwnerRegistrySnapshot();
    expect(snap.conflicts).toBe(0);
    expect(snap.lastConflict).toBeNull();
    expect(resolveConstructOwner('inlineCode')).toEqual({ owner: 'source-fallback', source: 'b' });
    reRegister();
  });
});

describe('renderOwnerRegistry — unique owner invariant and conflicts', () => {
  it('same-kind double registration: last active wins and the conflict is detectable', () => {
    const unregisterFirst = registerConstructOwner('heading', 'widget', { label: 'cohort-a' });
    expect(getOwnerRegistrySnapshot().conflicts).toBe(0);

    const unregisterSecond = registerConstructOwner('heading', 'source-fallback', { label: 'cohort-b' });
    expect(resolveConstructOwner('heading')).toEqual({ owner: 'source-fallback', source: 'cohort-b' });
    const snap = getOwnerRegistrySnapshot();
    expect(snap.conflicts).toBe(1);
    expect(snap.lastConflict).toEqual({
      kind: 'heading',
      supersededSource: 'cohort-a',
      source: 'cohort-b',
    });

    // Teardown of the winner falls back to the still-registered earlier entry.
    unregisterSecond();
    expect(resolveConstructOwner('heading')).toEqual({ owner: 'widget', source: 'cohort-a' });
    unregisterFirst();
    expect(resolveConstructOwner('heading')).toEqual({ owner: 'local', source: 'default' });
  });

  it('an inert later entry never shadows an active earlier one (flag-combo invariant)', () => {
    let flagB = false;
    registerConstructOwner('fence', 'widget', { label: 'fence-a' });
    const unregisterB = registerConstructOwner('fence', 'widget', {
      label: 'fence-b',
      flag: () => flagB,
    });
    expect(resolveConstructOwner('fence')).toEqual({ owner: 'widget', source: 'fence-a' });
    flagB = true;
    expect(resolveConstructOwner('fence')).toEqual({ owner: 'widget', source: 'fence-b' });
    flagB = false;
    expect(resolveConstructOwner('fence')).toEqual({ owner: 'widget', source: 'fence-a' });
    unregisterB();
    expect(resolveConstructOwner('fence')).toEqual({ owner: 'widget', source: 'fence-a' });
  });

  it("registering the reserved 'core' owner is rejected and changes nothing", () => {
    expect(() => registerConstructOwner('heading', 'core')).toThrow(/core/);
    expect(() => registerConstructOwner('htmlBlock', 'core', { label: 'x' })).toThrow(/core/);
    expect(resolveConstructOwner('heading')).toEqual({ owner: 'local', source: 'default' });
    const snap = getOwnerRegistrySnapshot();
    expect(snap.registered).toBe(0);
    expect(snap.conflicts).toBe(0);
  });

  it("dynamic registration of the built-in 'local' owner is rejected", () => {
    expect(() => registerConstructOwner('strong', 'local')).toThrow(/'widget' \| 'source-fallback'/);
    expect(resolveConstructOwner('strong')).toEqual({ owner: 'local', source: 'default' });
  });
});

describe('renderOwnerRegistry — debug snapshot', () => {
  it('exposes the effective kind→owner map and counters, frozen and body-free', () => {
    registerConstructOwner('table', 'widget', { label: 'p4b.table-widget' });
    const snap = getOwnerRegistrySnapshot();
    expect(Object.keys(snap.owners).sort()).toEqual([...CONSTRUCT_KINDS].sort());
    expect(snap.owners.table).toBe('widget');
    expect(snap.owners.heading).toBe('local');
    expect(snap.owners.htmlBlock).toBe('source-fallback');
    expect(snap.registered).toBe(1);
    expect(snap.active).toBe(1);
    expect(snap.conflicts).toBe(0);
    expect(snap.lastConflict).toBeNull();
    // Values are owners only (no ranges, no document text — design/05 §9), and
    // the snapshot is a frozen read-only debug surface.
    const owners = ['local', 'source-fallback', 'widget', 'core'];
    expect(Object.values(snap.owners).every((o) => owners.includes(o))).toBe(true);
    expect(Object.isFrozen(snap.owners)).toBe(true);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('reflects registration/teardown consistently across resolution and counters', () => {
    const unregister = registerConstructOwner('blockquote', 'source-fallback', { label: 'q' });
    let snap = getOwnerRegistrySnapshot();
    expect(snap.registered).toBe(1);
    expect(snap.active).toBe(1);
    expect(snap.owners.blockquote).toBe('source-fallback');
    unregister();
    snap = getOwnerRegistrySnapshot();
    expect(snap.registered).toBe(0);
    expect(snap.active).toBe(0);
    expect(snap.owners.blockquote).toBe('local');
  });
});

describe('renderOwnerRegistry — projection wiring parity (task 6.5)', () => {
  it('name-level parity: the wired classifier matches the frozen pre-registry classifier', () => {
    for (const name of ORACLE_NODE_NAMES) {
      expect(classifyLezerNode(name)).toEqual(legacyClassifyNode(name));
    }
  });

  it('classification consumes the registry: non-local owners stand down, teardown restores', () => {
    expect(classifyLezerNode('StrongEmphasis')).toEqual({ cls: PROJECTION_CLASSES.strong });

    // source-fallback owner → exact source (no decoration metadata at all).
    const unFallback = registerConstructOwner('strong', 'source-fallback', { label: 't1' });
    expect(classifyLezerNode('StrongEmphasis')).toBeNull();
    unFallback();
    expect(classifyLezerNode('StrongEmphasis')).toEqual({ cls: PROJECTION_CLASSES.strong });

    // A widget owner also takes the kind away from the local projection.
    const unWidget = registerConstructOwner('strong', 'widget', { label: 't2' });
    expect(classifyLezerNode('StrongEmphasis')).toBeNull();
    unWidget();

    // Flag-gated: classification follows the CURRENT flag state.
    let flagOn = false;
    const unFlagged = registerConstructOwner('fence', 'widget', { flag: () => flagOn });
    expect(classifyLezerNode('FencedCode')).toEqual({ cls: PROJECTION_CLASSES.fence });
    flagOn = true;
    expect(classifyLezerNode('FencedCode')).toBeNull();
    flagOn = false;
    expect(classifyLezerNode('FencedCode')).toEqual({ cls: PROJECTION_CLASSES.fence });
    unFlagged();
  });

  it('the nine local kinds keep their exact metadata through the wiring', () => {
    expect(classifyLezerNode('ATXHeading1')).toEqual({ cls: PROJECTION_CLASSES.heading, level: 1 });
    expect(classifyLezerNode('SetextHeading2')).toEqual({ cls: PROJECTION_CLASSES.heading, level: 2 });
    expect(classifyLezerNode('Emphasis')).toEqual({ cls: PROJECTION_CLASSES.emphasis });
    expect(classifyLezerNode('InlineCode')).toEqual({ cls: PROJECTION_CLASSES.inlineCode });
    expect(classifyLezerNode('URL')).toEqual({ cls: PROJECTION_CLASSES.link });
    expect(classifyLezerNode('ListItem')).toEqual({ cls: PROJECTION_CLASSES.listItem });
    // Fallback kinds never fabricate decorations.
    expect(classifyLezerNode('HTMLBlock')).toBeNull();
    expect(classifyLezerNode('Table')).toBeNull();
    expect(classifyLezerNode('Image')).toBeNull();
    expect(classifyLezerNode('Paragraph')).toBeNull();
  });
});

describe('renderOwnerRegistry — task 7.5 parent/child editable-slot arbitration', () => {
  it('a taskCheckbox widget owns ONLY the 3-byte marker, so listItem and inner strong stay local (the key scenario)', () => {
    // `- [ ] **bold**`  — Task node `[0, 13)`, marker `[ ]` = `[2, 5)`.
    // The task widget's editable slot is the marker ONLY (SourceRangeSet.markers),
    // NOT the whole list item source. The parent listItem stays local; the
    // child Task identity is the independently-owned taskCheckbox slot.
    registerConstructOwner('taskCheckbox', 'widget', { label: 'p4b.task-checkbox' });

    expect(resolveConstructOwner('listItem')).toEqual({ owner: 'local', source: 'default' });
    expect(resolveConstructOwner('taskCheckbox')).toEqual({ owner: 'widget', source: 'p4b.task-checkbox' });

    const parentSlot = { kind: 'listItem' as const, from: 0, to: 13 };
    const taskMarkerSlot = { kind: 'taskCheckbox' as const, from: 2, to: 5 };
    // The inner **bold** strong is strictly OUTSIDE the marker slot.
    const childSlot = editableSlotFor('strong', 6, 13);
    expect(childSlot.owner).toBe('local');

    // The production bridge delegates to arbitrateNestedOwner: a local parent
    // yields its nested marker slot to the enabled child widget.
    expect(resolveNestedEditableSlot(parentSlot, taskMarkerSlot)).toEqual({
      owner: 'widget', source: 'p4b.task-checkbox', from: 2, to: 5,
    });
    // Inner source content is outside the child marker and stays local.
    expect(arbitrateNestedOwner(editableSlotFor('taskCheckbox', 2, 5), childSlot)).toEqual(childSlot);
    expect(arbitrateNestedOwner(editableSlotFor('taskCheckbox', 2, 5), childSlot).owner).toBe('local');
  });

  it('same listItem widget — inner emphasis/inlineCode/link also stay local (outside the marker slot)', () => {
    // `- [ ] `em` and `code` and [l](u)` — those inline marks are all in the item
    // text, strictly after the 3-byte `[ ]` marker `[2,5)`.
    registerConstructOwner('taskCheckbox', 'widget', { label: 'p4b.task-checkbox' });
    const parentSlot: EditableSlot = { owner: 'widget', source: 'p4b.task-checkbox', from: 2, to: 5 };
    for (const span of [
      [6, 11] /* emphasis */,
      [16, 24] /* inlineCode */,
      [29, 34] /* link text */,
    ] as const) {
      const result = arbitrateNestedOwner(parentSlot, {
        owner: 'local',
        source: 'default',
        from: span[0],
        to: span[1],
      });
      expect(result.owner).toBe('local');
      expect(result.from).toBe(span[0]);
      expect(result.to).toBe(span[1]);
    }
  });

  it('blockquote containing listItem — both local by default → no arbitration (both decorate)', () => {
    const parent = editableSlotFor('blockquote', 0, 20);
    const child = editableSlotFor('listItem', 2, 18);
    expect(parent.owner).toBe('local');
    expect(child.owner).toBe('local');
    // Neither is a widget → child unchanged; projection decorates both.
    expect(arbitrateNestedOwner(parent, child)).toEqual(child);
    expect(arbitrateNestedOwner(parent, child).owner).toBe('local');
  });

  it('fence widget owns only the opening CodeMark slot; the code body has nothing interactive → no conflict', () => {
    // ` ```js\nbody\n``` ` — FencedCode stays local while the controls own
    // only an independently named opening-marker slot.
    registerConstructOwner('codeFenceControls', 'widget', { label: 'p4b.code-fence-controls' });
    expect(resolveConstructOwner('fence')).toEqual({ owner: 'local', source: 'default' });
    const parentSlot = { kind: 'fence' as const, from: 0, to: 16 };
    const controlSlot = { kind: 'codeFenceControls' as const, from: 0, to: 3 };
    expect(resolveNestedEditableSlot(parentSlot, controlSlot)).toEqual({
      owner: 'widget', source: 'p4b.code-fence-controls', from: 0, to: 3,
    });
    // The body span is strictly outside the opening-marker slot.
    const bodySlot: EditableSlot = { owner: 'local', source: 'default', from: 4, to: 20 };
    expect(arbitrateNestedOwner(editableSlotFor('codeFenceControls', 0, 3), bodySlot)).toEqual(bodySlot);
    expect(arbitrateNestedOwner(editableSlotFor('codeFenceControls', 0, 3), bodySlot).owner).toBe('local');
  });

  it('a link widget owned concurrently with the 4-marker reveal still keeps url/text source-editable as local', () => {
    // `[text](url)` — a link cohort widget owns the construct while the reveal
    // is active; its DECLARED editable slot is the delimiter marker(s) only, so
    // the link text and url remain plain local source-editable (they are NOT the
    // widget's editable span, even though the `link` KIND resolves to widget).
    registerConstructOwner('link', 'widget', { label: 'p4b.link-cohort' });
    expect(resolveConstructOwner('link').owner).toBe('widget');
    // The declared widget slot is, say, the opening `[` delimiter `[0,1)`.
    const widgetSlot: EditableSlot = { owner: 'widget', source: 'p4b.link-cohort', from: 0, to: 1 };
    // The link text and url live OUTSIDE the widget's declared marker slot and
    // stay source-editable as plain local (the widget owns only its declared slot).
    const textSlot: EditableSlot = { owner: 'local', source: 'default', from: 1, to: 5 };
    const urlSlot: EditableSlot = { owner: 'local', source: 'default', from: 6, to: 9 };
    // Neither is inside the widget's declared slot → both stay local.
    expect(arbitrateNestedOwner(widgetSlot, textSlot)).toEqual(textSlot);
    expect(arbitrateNestedOwner(widgetSlot, urlSlot)).toEqual(urlSlot);
  });

  it('two NESTED whole-span widgets: the PARENT widget wins the editable region', () => {
    // Forward-looking: a future blockquote widget owning the whole construct and
    // a list widget inside it — both whole-span. Parent must win (block the child).
    const parentWidget: EditableSlot = { owner: 'widget', source: 'p4b.blockquote-widget', from: 0, to: 20 };
    const childWidget: EditableSlot = { owner: 'widget', source: 'p4b.list-widget', from: 2, to: 18 };
    expect(arbitrateNestedOwner(parentWidget, childWidget)).toEqual(parentWidget);
    expect(arbitrateNestedOwner(parentWidget, childWidget).owner).toBe('widget');
  });

  it('parentYieldsTo lets a parent widget hand its region to a specific nested widget', () => {
    const parentWidget: EditableSlot = { owner: 'widget', source: 'p4b.blockquote-widget', from: 0, to: 20 };
    const childWidget: EditableSlot = { owner: 'widget', source: 'p4b.list-widget', from: 2, to: 18 };
    const yieldToList = { parentYieldsTo: (s: string) => s === 'p4b.list-widget' };
    expect(arbitrateNestedOwner(parentWidget, childWidget, yieldToList)).toEqual(childWidget);
    // A different child label is NOT yielded → parent still wins.
    const otherChild: EditableSlot = { owner: 'widget', source: 'p4b.other-widget', from: 3, to: 17 };
    expect(arbitrateNestedOwner(parentWidget, otherChild, yieldToList)).toEqual(parentWidget);
  });

  it('a widget parent consumes a nested LOCAL child (one widget → the widget wins)', () => {
    const parentWidget: EditableSlot = { owner: 'widget', source: 'p4b.blockquote-widget', from: 0, to: 20 };
    const childLocal: EditableSlot = { owner: 'local', source: 'default', from: 2, to: 18 };
    expect(arbitrateNestedOwner(parentWidget, childLocal)).toEqual(parentWidget);
  });

  it('a child widget over a LOCAL parent keeps its own slot (one widget → the widget wins)', () => {
    const parentLocal: EditableSlot = { owner: 'local', source: 'default', from: 0, to: 20 };
    const childWidget: EditableSlot = { owner: 'widget', source: 'p4b.list-widget', from: 2, to: 18 };
    expect(arbitrateNestedOwner(parentLocal, childWidget)).toEqual(childWidget);
  });

  it('children of a source-fallback parent degrade to exact source — a widget child NEVER gets widget DOM', () => {
    const fallbackParent: EditableSlot = { owner: 'source-fallback', source: 'default', from: 0, to: 20 };
    const childWidget: EditableSlot = { owner: 'widget', source: 'p4b.some-widget', from: 2, to: 18 };
    const result = arbitrateNestedOwner(fallbackParent, childWidget);
    expect(result.owner).toBe('source-fallback');
    expect(result.source).toBe('default');
    expect(result.from).toBe(2);
    expect(result.to).toBe(18);
  });

  it('is pure and returns exactly one slot without mutating inputs (unique-owner invariant preserved)', () => {
    const parentWidget: EditableSlot = { owner: 'widget', source: 'p4b.parent', from: 0, to: 20 };
    const childWidget: EditableSlot = { owner: 'widget', source: 'p4b.child', from: 2, to: 18 };
    const before = [parentWidget, childWidget];
    const out = arbitrateNestedOwner(parentWidget, childWidget);
    // Inputs untouched.
    expect([parentWidget, childWidget]).toEqual(before);
    // Exactly one owner in the result (never two owners over one region).
    expect(out.owner).toBe('widget');
    expect(out).toEqual(parentWidget);
  });
});

describe('renderOwnerRegistry — task 7.5 "core" is never a runtime owner', () => {
  it("resolveConstructOwner never returns 'core' for ANY kind", () => {
    for (const kind of CONSTRUCT_KINDS) {
      expect(resolveConstructOwner(kind).owner).not.toBe('core');
    }
  });

  it('the debug snapshot never contains core as an owner', () => {
    const owners = Object.values(getOwnerRegistrySnapshot().owners);
    expect(owners).not.toContain('core');
    expect(owners.every((o) => o !== 'core')).toBe(true);
  });
});

describe('renderOwnerRegistry — task 7.5 debug snapshot coverage', () => {
  it('snapshot owners flip widget/local across flag ON/OFF transitions', () => {
    let flagOn = false;
    const teardown = registerConstructOwner('fence', 'widget', {
      label: 'p4b.fence-cohort',
      flag: () => flagOn,
    });
    expect(getOwnerRegistrySnapshot().owners.fence).toBe('local');
    flagOn = true;
    expect(getOwnerRegistrySnapshot().owners.fence).toBe('widget');
    flagOn = false;
    expect(getOwnerRegistrySnapshot().owners.fence).toBe('local');
    teardown();
    expect(getOwnerRegistrySnapshot().owners.fence).toBe('local');
  });

  it('conflict counter increments when a same-kind widget registration overrides an existing one', () => {
    const first = registerConstructOwner('link', 'widget', { label: 'cohort-a' });
    expect(getOwnerRegistrySnapshot().conflicts).toBe(0);
    const second = registerConstructOwner('link', 'widget', { label: 'cohort-b' });
    const snap = getOwnerRegistrySnapshot();
    expect(snap.conflicts).toBe(1);
    expect(snap.lastConflict).toEqual({ kind: 'link', supersededSource: 'cohort-a', source: 'cohort-b' });
    expect(snap.owners.link).toBe('widget');
    expect(snap.active).toBe(2);
    second();
    expect(getOwnerRegistrySnapshot().owners.link).toBe('widget'); // first still active
    first();
    expect(getOwnerRegistrySnapshot().owners.link).toBe('local'); // teardown restores default
  });

  it('teardown restores the default owner in the snapshot', () => {
    const teardown = registerConstructOwner('emphasis', 'widget', { label: 'p4b.em' });
    expect(getOwnerRegistrySnapshot().owners.emphasis).toBe('widget');
    expect(getOwnerRegistrySnapshot().registered).toBe(1);
    teardown();
    const snap = getOwnerRegistrySnapshot();
    expect(snap.owners.emphasis).toBe('local');
    expect(snap.registered).toBe(0);
    expect(snap.active).toBe(0);
    expect(snap.conflicts).toBe(0);
  });
});
