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
  getOwnerRegistrySnapshot,
  registerConstructOwner,
  resetOwnerRegistry,
  resolveConstructOwner,
  type ConstructKind,
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
