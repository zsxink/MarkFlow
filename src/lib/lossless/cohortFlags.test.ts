// P4B per-cohort feature flags — unit + integration-lite tests (design 05 §5).
//
// Gates:
//   - every P4B cohort/widget switch defaults to OFF and is independently
//     readable (headings, emphasis/strike/inline-code, links, quote+lists,
//     fence markers; task checkbox, code fence controls, frontmatter policy,
//     raw HTML policy);
//   - `set…Enabled(true)` → in-memory ON, `localStorage['markflow.p4b.<n>']`
//     persisted as '1'; reading it back after a storage-level re-seed (module
//     reload simulation) is ON;
//   - `'0'` / absent / deleted storage key → OFF (explicit rollback semantics);
//   - the E2E-only `window.__markflowCohortFlags` hook is NOT exposed in a
//     non-e2e build (vitest runs with MODE 'test');
//   - integration-lite: `registerConstructOwner('strong','widget',{flag})`
//     resolves 'local' while the flag is OFF and 'widget' while ON, teardown
//     falls back (reuses renderOwnerRegistry semantics; the real cohort wiring
//     is task 7.1's job — this only proves the flag mechanism drives the
//     owner registry).

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Re-import cohortFlags as a FRESH module instance (the singleton switches map
 * is module-scoped, so a fresh import rebuilds it and re-seeds from the CURRENT
 * localStorage — a faithful simulation of an app cold boot).
 */
async function freshCohortFlags(): Promise<typeof import('./cohortFlags')> {
  vi.resetModules();
  return await import('./cohortFlags');
}
import {
  P4B_FLAG_NAMES,
  cohortFlagClosure,
  isCodeFenceControlsEnabled,
  isEmphasisStrikeInlineCodeEnabled,
  isFenceEnabled,
  isFrontmatterPolicyEnabled,
  isHeadingStrongEnabled,
  isLinksEnabled,
  isP4bFlagEnabled,
  isQuoteListsEnabled,
  isRawHtmlPolicyEnabled,
  isTaskCheckboxEnabled,
  p4bStorageKey,
  resetAllCohortFlags,
  setP4bFlagEnabled,
} from './cohortFlags';
import {
  registerConstructOwner,
  resolveConstructOwner,
  resetOwnerRegistry,
  type ConstructKind,
} from './renderOwnerRegistry';

/** Every flag name plus the ConstructKind its cohort will gate (task 7.1 +
 *  widgets 7.4 + policy 7.6). Guarantees the 5+4 coverage contract. */
const EXPECTED_FLAGS: Array<{ name: (typeof P4B_FLAG_NAMES)[number]; kind: ConstructKind }> = [
  { name: 'headingStrong', kind: 'heading' },
  { name: 'emphasisStrikeInlineCode', kind: 'strong' },
  { name: 'links', kind: 'link' },
  { name: 'quoteLists', kind: 'listItem' },
  { name: 'fence', kind: 'fence' },
  { name: 'taskCheckbox', kind: 'listItem' },
  { name: 'codeFenceControls', kind: 'fence' },
  { name: 'frontmatterPolicy', kind: 'frontmatter' },
  { name: 'rawHtmlPolicy', kind: 'htmlBlock' },
];

const COHORT_READERS: Record<string, () => boolean> = {
  headingStrong: isHeadingStrongEnabled,
  emphasisStrikeInlineCode: isEmphasisStrikeInlineCodeEnabled,
  links: isLinksEnabled,
  quoteLists: isQuoteListsEnabled,
  fence: isFenceEnabled,
  taskCheckbox: isTaskCheckboxEnabled,
  codeFenceControls: isCodeFenceControlsEnabled,
  frontmatterPolicy: isFrontmatterPolicyEnabled,
  rawHtmlPolicy: isRawHtmlPolicyEnabled,
};

beforeEach(() => {
  // Every test starts from the P4B default: all switches OFF, storage clean.
  localStorage.clear();
  resetAllCohortFlags();
  resetOwnerRegistry();
});

describe('cohortFlags — default state', () => {
  it('every cohort/widget switch is OFF by default', () => {
    for (const name of P4B_FLAG_NAMES) {
      expect(isP4bFlagEnabled(name)).toBe(false);
      expect(COHORT_READERS[name]()).toBe(false);
    }
  });

  it('exposes exactly the 5 marker cohorts + 4 widget/policy switches (9 total)', () => {
    expect(P4B_FLAG_NAMES).toEqual([
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
    expect(P4B_FLAG_NAMES).toHaveLength(9);
    // The flag set covers every P4B construct of tasks 7.1/7.4/7.6.
    expect(EXPECTED_FLAGS).toHaveLength(P4B_FLAG_NAMES.length);
  });
});

describe('cohortFlags — localStorage persistence', () => {
  it("persists the key, and a cold-boot re-import seeds ON from the '1' value", async () => {
    setP4bFlagEnabled('links', true);
    expect(isLinksEnabled()).toBe(true);
    expect(localStorage.getItem(p4bStorageKey('links'))).toBe('1');

    const fresh = await freshCohortFlags();
    expect(fresh.isLinksEnabled()).toBe(true);
    // Every OTHER switch is still OFF after re-import.
    for (const name of P4B_FLAG_NAMES) {
      if (name !== 'links') expect(fresh.isP4bFlagEnabled(name)).toBe(false);
    }
  });

  it("'0' and a deleted key both boot OFF (rollback semantics)", async () => {
    const first = await freshCohortFlags();
    first.setP4bFlagEnabled('taskCheckbox', true);
    expect(first.isTaskCheckboxEnabled()).toBe(true);

    // Write '0' through storage directly, then cold-boot: OFF.
    localStorage.setItem(p4bStorageKey('taskCheckbox'), '0');
    const second = await freshCohortFlags();
    expect(second.isTaskCheckboxEnabled()).toBe(false);

    // Deleted key, cold-boot: OFF.
    localStorage.removeItem(p4bStorageKey('taskCheckbox'));
    const third = await freshCohortFlags();
    expect(third.isTaskCheckboxEnabled()).toBe(false);
  });

  it('an unknown or non-`\'1\'` value keeps the switch off at boot', async () => {
    localStorage.setItem(p4bStorageKey('rawHtmlPolicy'), 'yes');
    const fresh = await freshCohortFlags();
    expect(fresh.isRawHtmlPolicyEnabled()).toBe(false);
  });
});

describe('cohortFlags — mutators are independent', () => {
  it('enabling one switch never flips any other', () => {
    setP4bFlagEnabled('fence', true);
    setP4bFlagEnabled('taskCheckbox', true);
    for (const name of P4B_FLAG_NAMES) {
      const expected = name === 'fence' || name === 'taskCheckbox';
      expect(isP4bFlagEnabled(name)).toBe(expected);
    }
    for (const name of P4B_FLAG_NAMES) {
      const key = p4bStorageKey(name);
      const storageExpected = name === 'fence' || name === 'taskCheckbox' ? '1' : null;
      expect(localStorage.getItem(key)).toBe(storageExpected);
    }
  });

  it("turning a switch back off clears its storage key ('0'/deleted → OFF)", () => {
    setP4bFlagEnabled('quoteLists', true);
    expect(isQuoteListsEnabled()).toBe(true);
    setP4bFlagEnabled('quoteLists', false);
    expect(isQuoteListsEnabled()).toBe(false);
    expect(localStorage.getItem(p4bStorageKey('quoteLists'))).toBeNull();
  });

  it('cohortFlagClosure stays a read-only view of the live flag state', () => {
    const gate = cohortFlagClosure('headingStrong');
    expect(gate()).toBe(false);
    setP4bFlagEnabled('headingStrong', true);
    expect(gate()).toBe(true);
    setP4bFlagEnabled('headingStrong', false);
    expect(gate()).toBe(false);
  });
});

describe('cohortFlags — E2E hook gating', () => {
  it('window.__setP4bFlag is NOT exposed outside e2e builds', () => {
    // vitest runs with MODE 'test'; the hook only mounts in MODE 'e2e'.
    const w = window as unknown as { __setP4bFlag?: unknown };
    expect(w.__setP4bFlag).toBeUndefined();
  });
});

describe('cohortFlags — owner registry integration (lite: flag drives owner)', () => {
  it("flag OFF → 'local', ON → 'widget', teardown → default (design 05 §5 rollback)", () => {
    const unregister = registerConstructOwner('strong', 'widget', {
      label: 'p4b.strong-cohort',
      flag: cohortFlagClosure('emphasisStrikeInlineCode'),
    });

    // Default OFF: the registration is INERT — strong keeps its local owner.
    expect(resolveConstructOwner('strong')).toEqual({ owner: 'local', source: 'default' });

    // Flip the cohort flag ON: the same registration becomes ACTIVE.
    setP4bFlagEnabled('emphasisStrikeInlineCode', true);
    expect(resolveConstructOwner('strong')).toEqual({
      owner: 'widget',
      source: 'p4b.strong-cohort',
    });

    // Flip back OFF: inert again, local projection resumes (no teardown needed).
    setP4bFlagEnabled('emphasisStrikeInlineCode', false);
    expect(resolveConstructOwner('strong')).toEqual({ owner: 'local', source: 'default' });

    // Explicit teardown also restores the default.
    unregister();
    setP4bFlagEnabled('emphasisStrikeInlineCode', true);
    expect(resolveConstructOwner('strong')).toEqual({ owner: 'local', source: 'default' });
  });

  it('flag→owner works for a fallback construct (frontmatter policy), too', () => {
    const unregister = registerConstructOwner('frontmatter', 'widget', {
      label: 'p4b.frontmatter-policy',
      flag: cohortFlagClosure('frontmatterPolicy'),
    });
    expect(resolveConstructOwner('frontmatter').owner).toBe('source-fallback');
    setP4bFlagEnabled('frontmatterPolicy', true);
    expect(resolveConstructOwner('frontmatter')).toEqual({
      owner: 'widget',
      source: 'p4b.frontmatter-policy',
    });
    unregister();
    expect(resolveConstructOwner('frontmatter').owner).toBe('source-fallback');
  });
});