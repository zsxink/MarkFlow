import type { OpaqueCategory, OpaqueEntry } from '../types';

// ── Opaque registry + sentinel generation (task 7.2 / design Decision 5) ──
//
// Each WYSIWYG session owns a registry keyed by a cryptographically random,
// session-local nonce. A sentinel is the only string that may stand in for an
// opaque raw span inside the editor document; it carries ONLY the slot id
// (never the raw payload). Because the nonce is random and the full sentinel
// namespace is verified absent from user source, a user's own text can never
// be mistaken for (nor forge) a placeholder.
//
//   sentinel  ::=  "⟦MF-OPAQUE:" nonce "." index "⟧"
//   slot      :=  nonce "." index         (unique within the session)
//
// `digest` is a bounded FNV-1a prefix used for one-to-one restore validation.

/** Characters that delimit an opaque sentinel (never expected in prose). */
export const OPAQUE_SENTINEL_PREFIX = '⟦MF-OPAQUE:'; // ⟦MF-OPAQUE:
export const OPAQUE_SENTINEL_SUFFIX = '⟧'; // ⟧

const DEFAULT_NONCE_BYTES = 8; // 64 bits of entropy per session
const DIGEST_PREFIX_LEN = 16;  // 64 bits, enough to catch corruption/copy

/**
 * Compute a bounded, synchronous digest of `raw` (hex). We avoid Web Crypto's
 * async `subtle.digest` so registration stays in the synchronous bridge path
 * and works identically in the Tauri renderer and the test environment. Two
 * independent 32-bit FNV-1a passes give 64 bits of discrimination against
 * copy/misplacement — far more than needed to catch a swapped or corrupted
 * opaque slot.
 */
export function opaqueDigest(raw: string): string {
  const len = raw.length;
  // Pass 1 (standard FNV-1a over UTF-16 code units) and pass 2 (a second salt
  // applied to the reversed byte stream) so equal-length swaps change both.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < len; i += 1) {
    const c = raw.charCodeAt(i);
    h1 ^= c & 0xff;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    const c2 = raw.charCodeAt(len - 1 - i);
    h2 ^= (c2 & 0xff) ^ (i * 31);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.slice(0, DIGEST_PREFIX_LEN);
}

/** Build the sentinel string for a slot. */
export function sentinelFor(slot: string): string {
  return `${OPAQUE_SENTINEL_PREFIX}${slot}${OPAQUE_SENTINEL_SUFFIX}`;
}

/** Whether `text` contains any opaque sentinel (used for no-sentinel checks). */
export function containsSentinel(text: string): boolean {
  return text.includes(OPAQUE_SENTINEL_PREFIX);
}

/** Extract the slot from a sentinel, or `null` for a malformed/foreign one. */
export function parseSentinel(text: string): string | null {
  const start = text.indexOf(OPAQUE_SENTINEL_PREFIX);
  if (start === -1) return null;
  const from = start + OPAQUE_SENTINEL_PREFIX.length;
  const end = text.indexOf(OPAQUE_SENTINEL_SUFFIX, from);
  if (end === -1) return null;
  const slot = text.slice(from, end);
  // A slot must be `nonce.index` — two dot-separated bare tokens. Anything else
  // (a forged/foreign sentinel) does not resolve.
  if (!/^[0-9a-zA-Z]+\.[0-9]+$/.test(slot)) return null;
  return slot;
}

/** A random source returning a 32-bit unsigned integer (injectable for tests). */
export type RandomSource = () => number;

function defaultRandomBytes(len: number): string {
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    // Non-crypto fallback; callers inject a source in tests.
    for (let i = 0; i < len; i += 1) arr[i] = Math.floor(Math.random() * 256);
  }
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Draw `byteLen * 2` hex characters from `random` (full 32 bits per call). */
function randomToken(byteLen: number, random: RandomSource): string {
  let out = '';
  const needed = byteLen * 2;
  while (out.length < needed) {
    out += (random() >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, needed);
}

export interface OpaqueRegistryOptions {
  /** 32-bit random source used for nonce + slots (defaults to crypto-backed). */
  randomSource?: RandomSource;
  /** Pre-supplied session nonce (tests / lifecycle replay). */
  nonce?: string;
  /** Token used to regenerate a nonce before inserting (omitted by default). */
  avoidNamespaceIn?: string;
  /** Analog of source to check for an existing sentinel namespace. */
  source?: string;
}

export type RegisterOpaqueResult =
  | { ok: true; entry: OpaqueEntry; sentinel: string }
  | { ok: false; code: 'namespace-collision'; message: string };

/**
 * A per-session opaque registry. Holds raw payloads ONLY in memory keyed by a
 * cryptographically random, session-local nonce; serialization emits sentinels
 * (slot-only), never raw text, and restore resolves them back one-to-one.
 */
export class OpaqueRegistry {
  readonly nonce: string;
  private entries = new Map<string, OpaqueEntry>();
  private sequence = 0;
  private random: RandomSource;

  constructor(private userSource: string, opts: OpaqueRegistryOptions = {}) {
    this.random = opts.randomSource ?? (() => {
      const raw = defaultRandomBytes(4);
      return Number.parseInt(raw, 16) >>> 0;
    });
    const nonceSource = opts.nonce ?? randomToken(DEFAULT_NONCE_BYTES, this.random);
    // The sentinel namespace must never already appear in user source: a user
    // who literally typed a sentinel must not be able to forge a placeholder
    // (design Decision 5: "rejected if the exact sentinel namespace already
    // appears in user source").
    const candidate = (n: string) => `${OPAQUE_SENTINEL_PREFIX}${n}.`;
    let nonce = nonceSource;
    let guard = 0;
    while ((this.userSource.includes(candidate(nonce))) && guard++ < 16) {
      nonce = randomToken(DEFAULT_NONCE_BYTES, this.random);
    }
    this.nonce = nonce;
  }

  /** Number of registered entries. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Register an opaque raw span and return a unique per-session slot + the
   * sentinel that stands in for it. The caller chooses the slot sequence; a
   * duplicate raw at a different position still gets its own slot (no
   * deduplication), which is what keeps identical fragments un-mixed (spec).
   */
  register(
    category: OpaqueCategory,
    raw: string,
    originalRange: { from: number; to: number },
  ): RegisterOpaqueResult {
    // Guard against a foreign sentinel already present in the raw payload: an
    // opaque entry must never itself embed a sentinel (it would be ambiguous).
    if (containsSentinel(raw)) {
      return { ok: false, code: 'namespace-collision', message: 'Opaque payload embeds a sentinel' };
    }
    const index = this.sequence;
    this.sequence += 1;
    const slot = `${this.nonce}.${index}`;
    const entry: OpaqueEntry = {
      slot,
      category,
      raw,
      originalRange: { from: originalRange.from, to: originalRange.to },
      digest: opaqueDigest(raw),
    };
    this.entries.set(slot, entry);
    return { ok: true, entry, sentinel: sentinelFor(slot) };
  }

  /** Look up an entry by slot, or `undefined` for an unknown/foreign slot. */
  get(slot: string): OpaqueEntry | undefined {
    return this.entries.get(slot);
  }

  /** All registered entries, in insertion order. */
  all(): OpaqueEntry[] {
    return [...this.entries.values()];
  }

  /** The sentinel for a known entry (or `null` if it is not registered). */
  sentinel(slot: string): string | null {
    return this.entries.has(slot) ? sentinelFor(slot) : null;
  }

  /**
   * Drop all entries and roll the session nonce (session teardown / pipeline
   * degrade, task 7.6). Rolling the nonce guarantees a sentinel emitted before
   * a `clear()` can never collide with a slot registered after it, even if the
   * same registry object is reused (an old atom node cannot be re-resolved).
   */
  clear(): void {
    this.entries.clear();
    this.sequence = 0;
    this.rollNonce();
  }

  private rollNonce(): void {
    let nonce = randomToken(DEFAULT_NONCE_BYTES, this.random);
    let guard = 0;
    while (this.userSource.includes(`${OPAQUE_SENTINEL_PREFIX}${nonce}.`) && guard++ < 16) {
      nonce = randomToken(DEFAULT_NONCE_BYTES, this.random);
    }
    (this as { nonce: string }).nonce = nonce;
  }
}
