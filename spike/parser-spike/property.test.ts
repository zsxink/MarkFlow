// P4A task 6.2 — property tests for range→source slice on the TypeScript
// candidate (CodeMirror Lezer + GFM, the product's local projection parser).
//
// Deterministic: fixed seed list + mulberry32 + fixed perturbation pools, the
// same SPEC as the Rust harness (spike/parser-spike-rust/src/property.rs —
// see lib/property-spec.mjs for the mirror contract). Both reports print
// SPEC_SHA256; the two fingerprints must be byte-identical.
//
// Property classes (design/phases/P4A-render-ir.md §4):
//   P1-context    — known construct embedded in random CJK/emoji/escape/...
//                   context: a construct of the same kind must slice EXACTLY
//                   to the known source text and its marker slices must equal
//                   the expected delimiter multiset (Lezer provides markers
//                   natively — none-provided would itself be a regression).
//   P2-nested     — fixed nested docs: same-kind constructs nest cleanly (no
//                   partial overlap); documented parent>child pairs have the
//                   child's sourceRange inside the parent's.
//   P3-malformed  — unclosed fence/emphasis/link/HTML, invalid table,
//                   truncated frontmatter, orphan `***`, reversed delimiters:
//                   no throw, every reported range in bounds + invariants.
//   P4-boundary   — a non-delimiter char inserted inside a known construct's
//                   SAFE zone (structure cannot change): the construct MUST
//                   survive with its range slicing EXACTLY to the perturbed
//                   source at the exact expected range. Unsafe/edge
//                   insertions: survived / legitimately absorbed / destroyed.
//                   A same-kind range overlapping the expected region without
//                   matching = MISPLACED (stale-position hazard) = failure.
//   P5-validator  — the harness validator itself is fuzzed with out-of-bounds
//                   / inverted / overlapping / NaN ranges: every case must be
//                   classified INVALID and a well-formed construct must not be
//                   flagged (guards against an always-true validator).
//   P6-heavy      — 10k-deep mixed container chain, 10k quote chain, 1k
//                   indented list chain, 5MB single word, ~5MB no-newline
//                   paragraph, 1e5 runs of `*` / `` ` `` / `#`: bounded time
//                   (5s per case, asserted), no throw, tree spans the doc,
//                   all reported ranges in bounds.
//   P7-eol        — inputs with bare (unpaired) \r and CRLF: no throw, no
//                   out-of-bounds (behavior recorded; EOL restoration belongs
//                   to the Core LineEndingMap — design/04 — and is out of
//                   scope; the logical text of the real pipeline is LF).
//   PF-frontmatter— doc starting with the canonical frontmatter + known body
//                   heading: the 6.1 KNOWN SPURIOUS (Lezer misparses
//                   frontmatter as setext/hr/link) is exempted ONLY inside
//                   the frontmatter span (frozen exemption list); anything
//                   else inside is a new finding; the body heading must match
//                   exactly; the absent frontmatter node is the 6.1 MISS.
//
// Range failures (invalid / misplaced / marker or content mismatch on a
// matched construct / throw / over-budget / validator bypass) are
// elimination evidence per the P4A criteria; coverage gaps (miss,
// none-provided) are recorded data per the 6.1 convention.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWithLezer, coordinateProbe } from './lib/lezer';
import { validateFixture, type SpikeConstruct, type Range } from './lib/validate';
import {
  SEEDS, SALT_CONTEXT, SALT_BOUNDARY, KNOWN_CONSTRUCTS, BOUNDARY_CHARS,
  BOUNDARY_SAFE_CHARS, NESTED_DOCS, NESTED_PAIRS, MALFORMED_DOCS, EOL_DOCS,
  heavyCases, FRONTMATTER_SOURCE, FRONTMATTER_DOC_TAIL, FRONTMATTER_EXEMPT_KINDS,
  mulberry32, caseSeed, randomContext, u16len, embedConstruct, docWithOccurrence,
  insertChar, specFingerprint,
} from './lib/property-spec.mjs';

const outDir = process.env.SPIKE_OUT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

// ── counters (mirror of the Rust ClassCounters) ─────────────────────────────

interface Counters {
  matched: number;
  destroyed: number;
  absorbed: number;
  miss: number;
  markerNoneProvided: number;
  spuriousExempted: number;
  markerMismatch: number;
  misplaced: number;
  invalid: number;
  panic: number;
  timeout: number;
  parseError: number;
  validatorInvalidCaught: number;
  validatorBypass: number;
}

const emptyCounters = (): Counters => ({
  matched: 0, destroyed: 0, absorbed: 0, miss: 0, markerNoneProvided: 0,
  spuriousExempted: 0, markerMismatch: 0, misplaced: 0, invalid: 0, panic: 0,
  timeout: 0, parseError: 0, validatorInvalidCaught: 0, validatorBypass: 0,
});

const rangeFailures = (c: Counters): number =>
  c.markerMismatch + c.misplaced + c.invalid + c.panic + c.timeout + c.validatorBypass;

const classes: Record<string, Counters> = {};
const elapsedMs: Record<string, number> = {};
const countersOf = (key: string) => (classes[key] ??= emptyCounters());
const classElapsed = (key: string, t0: number) => {
  elapsedMs[key] = Math.round((performance.now() - t0) * 100) / 100;
};

/** Global range invariants for one construct (UTF-16 space, native JS): bounds,
 *  content inside source, markers inside source, wrapping-kind markers disjoint
 *  from content, no slice splitting a surrogate pair. Empty = valid. */
function rangeProblems(kind: string, text: string, c: SpikeConstruct): string[] {
  const problems: string[] = [];
  const len = text.length;
  const [from, to] = c.sourceRange;
  if (from > to || to > len) {
    problems.push(`sourceRange [${from},${to}) out of bounds (len ${len})`);
  }
  if (c.contentRange) {
    const [cf, ct] = c.contentRange;
    if (cf < from || ct > to || cf > ct) {
      problems.push(`contentRange [${cf},${ct}) not inside sourceRange [${from},${to})`);
    }
  }
  c.markerRanges.forEach(([mf, mt], i) => {
    if (mf < from || mt > to || mf > mt) {
      problems.push(`markerRanges[${i}] [${mf},${mt}) not inside sourceRange [${from},${to})`);
    }
  });
  const WRAPPING = new Set([
    'strong', 'emphasis', 'strikethrough', 'inlineCode', 'link', 'image',
    'heading', 'listItem', 'taskCheckbox', 'fence', 'footnoteReference',
  ]);
  if (c.contentRange && WRAPPING.has(kind)) {
    const [cf, ct] = c.contentRange;
    for (const [mf, mt] of c.markerRanges) {
      if (mf < ct && cf < mt) {
        problems.push(`marker [${mf},${mt}) overlaps content [${cf},${ct})`);
        break;
      }
    }
  }
  if (problems.length === 0) {
    const slices = [text.slice(from, to)];
    if (c.contentRange) slices.push(text.slice(c.contentRange[0], c.contentRange[1]));
    for (const [mf, mt] of c.markerRanges) slices.push(text.slice(mf, mt));
    if (slices.some(hasLoneSurrogate)) {
      problems.push('slice splits a surrogate pair (coordinate drift)');
    }
  }
  return problems;
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= 0xd800 && u <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    }
  }
  return false;
}

function parseOrRecord(text: string, cc: Counters, label: string): SpikeConstruct[] | null {
  const parsed = parseWithLezer(text);
  if (parsed.threw) {
    cc.panic += 1; // a throw is the TS equivalent of a parser panic
    console.error(`[property] ${label} THROW lezer: ${parsed.error}`);
    return null;
  }
  return parsed.constructs;
}

// ── P1: random context ──────────────────────────────────────────────────────

function runContextClass(): void {
  const cc = countersOf('P1-context');
  let caseIndex = 0;
  for (const seed of SEEDS) {
    for (const kc of KNOWN_CONSTRUCTS) {
      const rand = mulberry32(caseSeed(seed, SALT_CONTEXT, caseIndex));
      caseIndex += 1;
      const [pre, suf] = randomContext(rand);
      const [doc] = embedConstruct(kc.embed, pre, suf);
      const constructs = parseOrRecord(doc, cc, 'P1');
      if (!constructs) continue;
      let matched = false;
      for (const c of constructs) {
        const problems = rangeProblems(c.kind, doc, c);
        if (problems.length > 0) {
          cc.invalid += 1;
          console.error(`[property] P1 INVALID lezer ${kc.kind}: ${problems.join('; ')}`);
          continue;
        }
        if (c.kind !== kc.kind || matched) continue;
        const slice = doc.slice(c.sourceRange[0], c.sourceRange[1]);
        if (slice === kc.source) {
          matched = true;
          if (kc.markers != null) {
            if (c.markerRanges.length === 0) {
              cc.markerNoneProvided += 1;
            } else {
              const want = [...kc.markers].sort().join('\u0000');
              const got = c.markerRanges.map(([f, t]) => doc.slice(f, t)).sort().join('\u0000');
              if (want !== got) {
                cc.markerMismatch += 1;
                console.error(`[property] P1 MARKER-MISMATCH lezer ${kc.kind}: want ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
              }
            }
          }
        }
      }
      if (matched) {
        cc.matched += 1;
      } else if (constructs.some((c) => c.kind === kc.kind)) {
        cc.misplaced += 1;
        console.error(`[property] P1 MISPLACED lezer seed=${seed} kind=${kc.kind} — same-kind constructs but no exact slice == known source`);
      } else {
        cc.miss += 1;
      }
    }
  }
}

// ── P2: nested containment ──────────────────────────────────────────────────

function runNestedClass(): void {
  const cc = countersOf('P2-nested');
  for (const [di, doc] of NESTED_DOCS.entries()) {
    const constructs = parseOrRecord(doc, cc, 'P2');
    if (!constructs) continue;
    for (const c of constructs) {
      const problems = rangeProblems(c.kind, doc, c);
      if (problems.length > 0) {
        cc.invalid += 1;
        console.error(`[property] P2 INVALID lezer doc=${di}: ${problems.join('; ')}`);
      }
    }
    // same-kind pairs must nest cleanly or be disjoint — never partially overlap
    for (const a of constructs) {
      for (const b of constructs) {
        if (a === b || a.kind !== b.kind) continue;
        const [af, at] = a.sourceRange;
        const [bf, bt] = b.sourceRange;
        const nested = (af <= bf && bt <= at) || (bf <= af && at <= bt);
        const disjoint = at <= bf || bt <= af;
        if (!nested && !disjoint) {
          cc.misplaced += 1;
          console.error(`[property] P2 PARTIAL-OVERLAP lezer doc=${di} kind=${a.kind} a=[${af},${at}) b=[${bf},${bt})`);
        }
      }
    }
    for (const [parentKind, childKind] of NESTED_PAIRS[di] ?? []) {
      const parents = constructs.filter((c) => c.kind === parentKind);
      const children = constructs.filter((c) => c.kind === childKind);
      if (parents.length === 0 || children.length === 0) {
        cc.miss += 1; // structural coverage gap
        continue;
      }
      const contained = parents.some((p) => {
        const [pf, pt] = p.sourceRange;
        return children.some((ch) => {
          const [cf, ct] = ch.sourceRange;
          return pf <= cf && ct <= pt;
        });
      });
      if (contained) {
        cc.matched += 1;
      } else {
        cc.misplaced += 1;
        console.error(`[property] P2 CONTAINMENT-FAIL lezer doc=${di} ${parentKind}>${childKind}`);
      }
    }
  }
}

// ── P3: malformed ───────────────────────────────────────────────────────────

function runMalformedClass(): void {
  const cc = countersOf('P3-malformed');
  for (const [di, doc] of MALFORMED_DOCS.entries()) {
    const constructs = parseOrRecord(doc, cc, 'P3');
    if (!constructs) continue;
    for (const c of constructs) {
      const problems = rangeProblems(c.kind, doc, c);
      if (problems.length > 0) {
        cc.invalid += 1;
        console.error(`[property] P3 INVALID lezer doc=${di}: ${problems.join('; ')}`);
      }
    }
  }
}

// ── P4: boundary perturbation ───────────────────────────────────────────────

function runBoundaryClass(safeReps: number): void {
  const cc = countersOf('P4-boundary');
  let caseIndex = 0;
  for (const seed of SEEDS) {
    for (const kc of KNOWN_CONSTRUCTS) {
      const sourceChars = [...kc.source];
      // SAFE reps: insertion inside the frozen safe zone — the construct MUST
      // survive with its range slicing exactly to the perturbed source.
      for (let rep = 0; rep < safeReps; rep++) {
        const rand = mulberry32(caseSeed(seed, SALT_BOUNDARY, caseIndex));
        caseIndex += 1;
        const zone = kc.safe[0];
        if (!zone) continue; // no safe zone for this construct
        const [lo, hiRaw] = zone;
        const hi = Math.min(hiRaw === Number.MAX_SAFE_INTEGER ? sourceChars.length : hiRaw, sourceChars.length);
        const o = lo + pick(rand, hi - lo + 1);
        const ch = BOUNDARY_SAFE_CHARS[pick(rand, BOUNDARY_SAFE_CHARS.length)];
        const perturbed = insertChar(sourceChars, o, ch);
        const pre = `前文${(kc.kind.length % 3) + 1}行`;
        const [doc, region] = docWithOccurrence(kc.embed, kc.source, perturbed, pre, '後suffix行');
        const constructs = parseOrRecord(doc, cc, 'P4');
        if (!constructs) continue;
        let survived = false;
        let anyKindAnywhere = false;
        let overlapped = false;
        for (const c of constructs) {
          const problems = rangeProblems(c.kind, doc, c);
          if (problems.length > 0) {
            cc.invalid += 1;
            console.error(`[property] P4 INVALID lezer ${kc.kind}: ${problems.join('; ')}`);
            continue;
          }
          if (c.kind !== kc.kind) continue;
          anyKindAnywhere = true;
          const [cf, ct] = c.sourceRange;
          if (!(cf < region[1] && region[0] < ct)) continue;
          overlapped = true;
          const slice = doc.slice(cf, ct);
          if (cf === region[0] && ct === region[1] && slice === perturbed) {
            survived = true;
          } else {
            cc.misplaced += 1;
            console.error(`[property] P4 SAFE-ZONE-VIOLATION lezer seed=${seed} kind=${kc.kind} o=${o} char=${JSON.stringify(ch)} range=[${cf},${ct}) want=[${region[0]},${region[1]}] slice=${JSON.stringify(slice)} want=${JSON.stringify(perturbed)}`);
          }
        }
        if (survived) {
          cc.matched += 1;
        } else if (overlapped) {
          // counted per offending construct above
        } else if (anyKindAnywhere) {
          cc.misplaced += 1;
          console.error(`[property] P4 SAFE-ZONE-MISS lezer seed=${seed} kind=${kc.kind} o=${o} — same-kind construct exists but not at the expected region`);
        } else {
          cc.miss += 1;
          console.error(`[property] P4 MISS lezer seed=${seed} kind=${kc.kind} o=${o} char=${JSON.stringify(ch)} — parser reports no such construct`);
        }
      }
      // UNSAFE rep: insertion anywhere in the embed (edges included) — the
      // construct is then intact/perturbed, legitimately absorbed, or
      // legitimately destroyed.
      const rand = mulberry32(caseSeed(seed, SALT_BOUNDARY, caseIndex));
      caseIndex += 1;
      const ch = BOUNDARY_CHARS[pick(rand, BOUNDARY_CHARS.length)];
      const embedChars = [...kc.embed];
      const o = pick(rand, embedChars.length + 1);
      const perturbedEmbed = insertChar(embedChars, o, ch);
      const pre = `前文${(kc.kind.length % 3) + 1}行`;
      const doc = `${pre}\n\n${perturbedEmbed}\n\n後suffix行`;
      const startU16 = u16len(pre) + 2;
      // allowed exact slices: the original source (if still contiguous) and
      // the source with the char inserted at the relative offset
      const occStartChar = [...kc.embed.slice(0, kc.embed.indexOf(kc.source))].length;
      const rel = Math.max(0, o - occStartChar);
      const allowed: string[] = [kc.source];
      if (rel <= sourceChars.length) {
        allowed.push(insertChar(sourceChars, rel, ch));
      }
      const region: Range = [startU16, startU16 + u16len(perturbedEmbed)];
      const constructs = parseOrRecord(doc, cc, 'P4');
      if (!constructs) continue;
      let survived = false;
      let absorbed = false;
      let overlapped = false;
      for (const c of constructs) {
        const problems = rangeProblems(c.kind, doc, c);
        if (problems.length > 0) {
          cc.invalid += 1;
          console.error(`[property] P4 INVALID lezer ${kc.kind}: ${problems.join('; ')}`);
          continue;
        }
        if (c.kind !== kc.kind) continue;
        const [cf, ct] = c.sourceRange;
        if (!(cf < region[1] && region[0] < ct)) continue;
        overlapped = true;
        const stripped = doc.slice(cf, ct);
        if (allowed.some((a) => stripped === a)) {
          survived = true;
        } else if (allowed.some((a) => stripped.includes(a))) {
          // legitimate structural absorption (e.g. an unclosed fence swallowing
          // the context). A stale/shifted construct-length range can never
          // CONTAIN the strictly longer occurrence text, so absorption cannot
          // mask drift.
          absorbed = true;
        } else if (allowed.some((a) => a.includes(stripped))) {
          // REMNANT: the construct was legitimately re-partitioned by the
          // insertion and a NEW same-kind construct formed from a sub-part
          // (e.g. "![alt](x" → the shorthand image "![alt]"). The remnant's
          // slice is a proper substring of the occurrence text; a shifted
          // construct-length stale range can never be (it would have to
          // include text outside the occurrence).
          cc.destroyed += 1;
          console.error(`[property] P4 REMNANT lezer seed=${seed} kind=${kc.kind} o=${o} char=${JSON.stringify(ch)} remnant=${JSON.stringify(stripped)}`);
        } else {
          cc.misplaced += 1;
          console.error(`[property] P4 MISPLACED lezer seed=${seed} kind=${kc.kind} o=${o} char=${JSON.stringify(ch)} slice=${JSON.stringify(stripped)} allowed=${JSON.stringify(allowed)}`);
        }
      }
      if (survived) {
        cc.matched += 1;
      } else if (absorbed) {
        cc.absorbed += 1;
      } else if (!overlapped) {
        cc.destroyed += 1;
      }
    }
  }
}

// ── P5: validator fuzz (property of the harness validator itself) ───────────

const VALIDATOR_U16_LEN = 20;

function runValidatorClass(): void {
  const cc = countersOf('P5-validator');
  const mk = (kind: string, src: Range, content: Range | null, markers: Range[]): SpikeConstruct => ({
    kind, sourceRange: src, contentRange: content, markerRanges: markers,
  });
  const cases: [string, SpikeConstruct][] = [
    ['source-to>len', mk('heading', [0, VALIDATOR_U16_LEN + 1], null, [])],
    ['source-to>>len', mk('heading', [0, Number.MAX_SAFE_INTEGER], null, [])],
    ['source-from>len', mk('heading', [Number.MAX_SAFE_INTEGER - 1, 3], null, [])],
    ['source-inverted', mk('heading', [5, 3], null, [])],
    ['source-NaN', mk('heading', [NaN, 5], null, [])],
    ['content-outside-source', mk('strong', [0, 10], [0, 12], [[0, 2], [8, 10]])],
    ['content-inverted', mk('strong', [0, 10], [6, 4], [[0, 2], [8, 10]])],
    ['marker-outside-source', mk('strong', [2, 10], [4, 8], [[0, 2]])],
    ['marker-overlaps-content', mk('strong', [0, 10], [2, 8], [[7, 9]])],
    ['marker-inverted', mk('strong', [0, 10], [2, 8], [[5, 4]])],
  ];
  const text = 'x'.repeat(VALIDATOR_U16_LEN);
  for (const [name, c] of cases) {
    const validation = validateFixture(text, [c], [], false);
    if (validation.constructs.every((v) => v.problems.length > 0)) {
      cc.validatorInvalidCaught += 1;
    } else {
      cc.validatorBypass += 1;
      console.error(`[property] P5 VALIDATOR-BYPASS lezer case=${name}`);
    }
  }
  // sanity: a well-formed construct must NOT be flagged (no false positive)
  const goodText = '# t'.repeat(4);
  const good = mk('heading', [0, 2], [2, 2], [[0, 1]]);
  const validation = validateFixture(goodText, [good], [], false);
  if (validation.constructs.every((v) => v.problems.length === 0)) {
    cc.matched += 1;
  } else {
    cc.validatorBypass += 1;
    console.error('[property] P5 FALSE-POSITIVE lezer — valid construct flagged');
  }
}

// ── P6: heavy cases (deep nesting / huge token) ─────────────────────────────

function runHeavyCase(doc: string): {
  elapsed: number;
  threw: string | null;
  constructCount: number;
  covered: boolean;
  constructs: SpikeConstruct[];
} {
  const t0 = performance.now();
  const parsed = parseWithLezer(doc);
  const elapsed = performance.now() - t0;
  if (parsed.threw) {
    return { elapsed, threw: parsed.error, constructCount: 0, covered: false, constructs: [] };
  }
  return {
    elapsed,
    threw: null,
    constructCount: parsed.constructs.length,
    covered: parsed.treeLength === doc.length,
    constructs: parsed.constructs,
  };
}

// ── P7: EOL / bare CR ───────────────────────────────────────────────────────

function runEolClass(): void {
  const cc = countersOf('P7-eol');
  for (const [di, doc] of EOL_DOCS.entries()) {
    const constructs = parseOrRecord(doc, cc, 'P7');
    if (!constructs) continue;
    for (const c of constructs) {
      const problems = rangeProblems(c.kind, doc, c);
      if (problems.length > 0) {
        cc.invalid += 1;
        console.error(`[property] P7 INVALID lezer doc=${di}: ${problems.join('; ')}`);
      }
    }
  }
}

// ── PF: frontmatter (frozen 6.1 SPURIOUS exemption) ─────────────────────────

function runFrontmatterClass(): void {
  const cc = countersOf('PF-frontmatter');
  const doc = FRONTMATTER_SOURCE + FRONTMATTER_DOC_TAIL;
  const fmU16Len = u16len(FRONTMATTER_SOURCE);
  const constructs = parseOrRecord(doc, cc, 'PF');
  if (!constructs) return;
  let sawFrontmatter = false;
  for (const c of constructs) {
    const problems = rangeProblems(c.kind, doc, c);
    if (problems.length > 0) {
      cc.invalid += 1;
      console.error(`[property] PF INVALID lezer: ${problems.join('; ')}`);
      continue;
    }
    const [from, to] = c.sourceRange;
    const insideFrontmatter = from < fmU16Len && to <= fmU16Len + 1;
    if (insideFrontmatter && FRONTMATTER_EXEMPT_KINDS.includes(c.kind)) {
      cc.spuriousExempted += 1;
      continue;
    }
    if (c.kind === 'frontmatter') {
      sawFrontmatter = true;
      const slice = doc.slice(from, to);
      if (slice === FRONTMATTER_SOURCE) {
        cc.matched += 1;
      } else {
        cc.misplaced += 1;
        console.error(`[property] PF SLICE-MISMATCH lezer frontmatter slice=${JSON.stringify(slice)}`);
      }
    } else if (from >= fmU16Len && c.kind === 'heading') {
      const slice = doc.slice(from, to);
      if (slice === '# Body after frontmatter') {
        cc.matched += 1;
      } else {
        cc.misplaced += 1;
        console.error(`[property] PF MISPLACED lezer heading slice=${JSON.stringify(slice)}`);
      }
    } else if (from < fmU16Len) {
      // SPURIOUS construct inside the frontmatter not in the frozen
      // exemption list → new finding
      cc.misplaced += 1;
      console.error(`[property] PF NEW-SPURIOUS lezer kind=${c.kind} range=[${from},${to}) inside frontmatter [0,${fmU16Len})`);
    }
  }
  if (!sawFrontmatter) {
    // Lezer has no frontmatter node — the 6.1 MISS
    cc.miss += 1;
  }
}

// ── report ──────────────────────────────────────────────────────────────────

async function writeReport(partial: boolean, totalStarted: number, heavyResults: Record<string, unknown>[]): Promise<void> {
  const failures = Object.values(classes).reduce((acc, cc) => acc + rangeFailures(cc), 0);
  const report = {
    spike: 'parser-candidate-property-tests',
    change: 'refactor-lossless-live-preview',
    task: 'P4A 6.2 (CodeMirror Lezer range→source property tests)',
    generatedAt: new Date().toISOString(),
    partial,
    totalElapsedMs: Math.round((performance.now() - totalStarted) * 100) / 100,
    spec: {
      seeds: SEEDS,
      knownConstructs: KNOWN_CONSTRUCTS.length,
      specFingerprint: specFingerprint(),
      note: 'same SPEC as spike/parser-spike-rust/src/property.rs (Rust side); fingerprints must match',
    },
    coordinateProbe: coordinateProbe(),
    heavyResults,
    candidates: [
      {
        id: 'lezer',
        language: 'TypeScript',
        packages: ['@codemirror/lang-markdown (product dependency)', '@lezer/markdown (product dependency)'],
        parserConfig: 'markdown({ extensions: [GFM] }).language.parser — the exact product path',
        nativeCoordinateSystem: 'utf16-code-units (JS string indices; confirmed by coordinate probe)',
        classes,
        elapsedMs,
        failures,
      },
    ],
  };
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, 'property-ts.json');
  await writeFile(file, JSON.stringify(report, null, 1) + '\n');
  console.log(`[spike] wrote ${file}`);
}

// small helper mirroring the Rust pick()
function pick(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}

describe('P4A 6.2 — Lezer range→source property tests', () => {
  const totalStarted = performance.now();
  const heavyResults: Record<string, unknown>[] = [];

  it('P1/P2/P3/P7/PF — context + nested + malformed + EOL + frontmatter', async () => {
    let t0 = performance.now();
    runContextClass();
    classElapsed('P1-context', t0);
    t0 = performance.now();
    runNestedClass();
    classElapsed('P2-nested', t0);
    t0 = performance.now();
    runMalformedClass();
    classElapsed('P3-malformed', t0);
    t0 = performance.now();
    runEolClass();
    classElapsed('P7-eol', t0);
    t0 = performance.now();
    runFrontmatterClass();
    classElapsed('PF-frontmatter', t0);
    await writeReport(true, totalStarted, heavyResults);
    for (const key of ['P1-context', 'P2-nested', 'P3-malformed', 'P7-eol', 'PF-frontmatter']) {
      expect(rangeFailures(classes[key]), `${key} range failures`).toBe(0);
    }
  });

  it('P4 — random boundary perturbation (safe zone must survive exactly)', async () => {
    const t0 = performance.now();
    runBoundaryClass(1);
    classElapsed('P4-boundary', t0);
    await writeReport(true, totalStarted, heavyResults);
    expect(rangeFailures(classes['P4-boundary']), 'P4-boundary range failures').toBe(0);
  });

  it('P5 — validator fuzz (validator must reject malformed ranges)', async () => {
    const t0 = performance.now();
    runValidatorClass();
    classElapsed('P5-validator', t0);
    await writeReport(true, totalStarted, heavyResults);
    expect(rangeFailures(classes['P5-validator']), 'P5-validator range failures').toBe(0);
    expect(classes['P5-validator'].validatorInvalidCaught, 'all 10 fuzz cases classified INVALID').toBe(10);
  });

  for (const hc of heavyCases()) {
    it(`P6 — ${hc.name} terminates within ${hc.budgetMs}ms`, async () => {
      const t0 = performance.now();
      const r = runHeavyCase(hc.doc);
      classElapsed(`P6:${hc.name}`, t0);
      const cc = countersOf('P6-heavy');
      heavyResults.push({
        case: hc.name,
        docUtf16Length: hc.doc.length,
        elapsedMs: Math.round(r.elapsed * 100) / 100,
        budgetMs: hc.budgetMs,
        threw: r.threw,
        covered: r.covered,
        constructCount: r.constructCount,
      });
      if (r.threw != null) {
        cc.panic += 1;
        console.error(`[property] P6 THROW lezer ${hc.name}: ${r.threw}`);
      } else if (r.elapsed > hc.budgetMs) {
        cc.timeout += 1;
        console.error(`[property] P6 TIMEOUT lezer ${hc.name}: ${r.elapsed}ms > ${hc.budgetMs}ms budget`);
      } else if (!r.covered) {
        cc.invalid += 1;
        console.error(`[property] P6 UNCOVERED lezer ${hc.name}: tree does not span the document`);
      } else {
        cc.matched += 1;
      }
      if (!r.threw) {
        for (const c of r.constructs) {
          const problems = rangeProblems(c.kind, hc.doc, c);
          if (problems.length > 0) {
            cc.invalid += 1;
            console.error(`[property] P6 INVALID lezer ${hc.name}: ${problems.join('; ')}`);
          }
        }
      }
      await writeReport(false, totalStarted, heavyResults);
      expect(r.threw, `${hc.name} threw`).toBeNull();
      expect(r.elapsed, `${hc.name} exceeded ${hc.budgetMs}ms budget`).toBeLessThanOrEqual(hc.budgetMs);
      expect(r.covered, `${hc.name} tree must span the document`).toBe(true);
      expect(rangeFailures(cc), `P6-heavy range failures (${hc.name})`).toBe(0);
    });
  }
});
