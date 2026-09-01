import { beforeEach, describe, expect, it } from 'vitest';
import {
  OpaqueRegistry,
  containsSentinel,
  opaqueDigest,
  parseSentinel,
  sentinelFor,
  OPAQUE_SENTINEL_PREFIX,
} from './editor.markdown.opaque';

/**
 * Task 7.2 — opaque registry + sentinel generation.
 *
 * A session registry assigns UNIQUE per-session slots with a random nonce,
 * never two entries sharing a slot even for identical raw fragments; a full
 * sentinel namespace present in user source is rejected (no forged sentinel);
 * and the slot digest lets restore validate one-to-one.
 */
describe('opaque registry / sentinel generation (7.2)', () => {
  // Deterministic random source for reproducible tests (1, 2, 3, ...).
  let n = 0;
  const seq = () => (n = (n + 1) % 0xffffffff);

  beforeEach(() => {
    n = 0;
  });

  it('assigns a unique slot per entry (no deduplication of identical raws)', () => {
    const src = '<!-- a -->\n\n<!-- a -->\n'; // identical payload, two positions
    const r = new OpaqueRegistry(src, { randomSource: seq });
    const e1 = r.register('html-comment', '<!-- a -->', { from: 0, to: 9 });
    const e2 = r.register('html-comment', '<!-- a -->', { from: 11, to: 20 });
    expect(e1.ok && e2.ok).toBe(true);
    if (!e1.ok || !e2.ok) return;
    // Distinct slots, sentinels, and digests derive the same raw → restore-safe.
    expect(e1.entry.slot).not.toBe(e2.entry.slot);
    expect(e1.sentinel).not.toBe(e2.sentinel);
    expect(r.get(e1.entry.slot)?.raw).toBe('<!-- a -->');
    expect(r.get(e2.entry.slot)?.raw).toBe('<!-- a -->');
    expect(r.size).toBe(2);
  });

  it('embeds a session nonce so slots are unique across sessions', () => {
    const a = new OpaqueRegistry('', { randomSource: seq });
    const b = new OpaqueRegistry('', { randomSource: seq });
    expect(a.nonce).not.toBe(b.nonce); // different nonce per registry instance
    const ea = a.register('html-block', '<div>x</div>', { from: 0, to: 10 });
    const eb = b.register('html-block', '<div>x</div>', { from: 0, to: 10 });
    if (!ea.ok || !eb.ok) return;
    expect(ea.entry.slot).not.toBe(eb.entry.slot);
  });

  it('rejects a forged sentinel embedded in user source (namespace collision)', () => {
    // A user who literally typed a sentinel opening must NOT be able to forge
    // a placeholder: the registry refuses to register a payload that embeds a
    // sentinel.
    const src = '# hi\n\nsome ⟦MF-OPAQUE:abc.0⟧ text\n';
    const r = new OpaqueRegistry(src, { nonce: 'abc', randomSource: seq });
    // A raw payload that already contains a sentinel is a collision.
    const bad = r.register('html-comment', '<!-- x ⟦MF-OPAQUE:abc.0⟧ -->', { from: 0, to: 5 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('namespace-collision');
  });

  it('regenerates a nonce when the chosen namespace already appears in source', () => {
    // The pre-supplied nonce "aabb" collides with user text, so the registry
    // must draw a fresh nonce from the random source instead of using it.
    const userSource = `text ${OPAQUE_SENTINEL_PREFIX}aabb. anything`;
    let i = 0;
    const source = () => (i += 1); // 1, 2, 3, … deterministic nibbles
    const r = new OpaqueRegistry(userSource, { nonce: 'aabb', randomSource: source });
    expect(r.nonce).not.toBe('aabb'); // first candidate rejected, redrawn
    expect(userSource.includes(`${OPAQUE_SENTINEL_PREFIX}${r.nonce}.`)).toBe(false);
  });

  it('digests are stable for identical raws and differ for distinct ones', () => {
    expect(opaqueDigest('<!-- a -->')).toBe(opaqueDigest('<!-- a -->'));
    expect(opaqueDigest('<!-- a -->')).not.toBe(opaqueDigest('<!-- b -->'));
    expect(opaqueDigest('').length).toBeGreaterThan(0);
  });

  it('sentinel round-trips through parseSentinel (slot only, no raw)', () => {
    const r = new OpaqueRegistry('', { randomSource: seq });
    const e = r.register('frontmatter', '---\na: 1\n---\n', { from: 0, to: 10 });
    if (!e.ok) return;
    // The sentinel carries ONLY the slot — never the raw payload.
    expect(e.sentinel).not.toContain('a: 1');
    expect(parseSentinel(e.sentinel)).toBe(e.entry.slot);
    expect(containsSentinel(e.sentinel)).toBe(true);
  });

  it('rejects malformed or foreign sentinels (does not resolve)', () => {
    expect(parseSentinel('not a sentinel')).toBe(null);
    expect(parseSentinel('⟦MF-OPAQUE:missing-suffix')).toBe(null); // no suffix
    expect(parseSentinel('⟦MF-OPAQUE:no-dot⟧')).toBe(null); // slot must be nonce.index
    expect(parseSentinel(sentinelFor('abc.0'))).toBe('abc.0');
  });

  it('a forged sentinel from another session does not resolve in this one', () => {
    const a = new OpaqueRegistry('', { randomSource: seq });
    const b = new OpaqueRegistry('', { randomSource: seq });
    const ea = a.register('html-comment', '<!-- x -->', { from: 0, to: 8 });
    if (!ea.ok) return;
    // Session `b` does not know session `a`'s slot.
    expect(b.get(ea.entry.slot)).toBeUndefined();
    expect(parseSentinel(ea.sentinel)).toBe(ea.entry.slot); // syntactically valid…
    expect(b.get(ea.entry.slot)).toBeUndefined(); // …but not registered here
  });

  it('is collision-safe under heavy random churn (unique slots)', () => {
    const r = new OpaqueRegistry('', { randomSource: seq });
    const slots = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const e = r.register('html-comment', `<!-- ${i} -->`, { from: 0, to: 5 });
      if (!e.ok) throw new Error('register failed');
      expect(slots.has(e.entry.slot)).toBe(false);
      slots.add(e.entry.slot);
    }
    expect(r.size).toBe(500);
  });

  it('clear() drops all entries (registry teardown)', () => {
    const r = new OpaqueRegistry('', { randomSource: seq });
    const e = r.register('html-comment', '<!-- x -->', { from: 0, to: 8 });
    if (!e.ok) return;
    expect(r.size).toBe(1);
    r.clear();
    expect(r.size).toBe(0);
    expect(r.get(e.entry.slot)).toBeUndefined();
    // Slot sequence restarts, so entries are never reused (fresh session).
    const e2 = r.register('html-comment', '<!-- y -->', { from: 0, to: 8 });
    if (!e2.ok) return;
    expect(e2.entry.slot).not.toBe(e.entry.slot);
  });
});
