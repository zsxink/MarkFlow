// Shared round-trip validator for the P4A parser spike (task 6.1).
//
// All candidates (TypeScript + Rust) are validated against the SAME frozen
// expectation table (../expectations.json). The validator is deliberately
// language-agnostic: candidates emit `SpikeConstruct`s in UTF-16 code units on
// the logical LF text (Rust adapters convert from their native coordinates and
// declare the conversion), and this module checks:
//
//   1. bounds invariants  — half-open ranges inside [0, len), content/markers
//                           inside sourceRange, no content/marker overlap;
//   2. source exactness   — text.slice(sourceRange) must equal the expected
//                           canonical source (MATCH), or match after trailing
//                           whitespace trim (CONVENTION — recorded separately);
//   3. content exactness  — exact for inline kinds, trim()-tolerant for blocks;
//   4. marker exactness   — marker slices must equal the expected delimiter
//                           strings (multiset) whenever the candidate provides
//                           markers at all ("none-provided" = capability gap).
//
// Unmatched table entries are MISS (coverage gap); unmatched constructs are
// SPURIOUS (e.g. Lezer misparsing frontmatter as a setext heading).
export type Range = [number, number];

export interface SpikeConstruct {
  kind: string;
  level?: number;
  meta?: Record<string, unknown>;
  sourceRange: Range;
  contentRange: Range | null;
  markerRanges: Range[];
}

export interface ExpectEntry {
  kind: string;
  source: string;
  content: string | null;
  markers: string[] | null;
  alsoMatch?: string[];
}

export type RoundTrip = 'MATCH' | 'CONVENTION' | 'SPURIOUS' | 'INVALID';

export interface ValidatedConstruct extends SpikeConstruct {
  sourceSlice: string;
  contentSlice: string | null;
  markerSlices: string[];
  roundTrip: RoundTrip;
  contentMatch: 'match' | 'mismatch' | 'none-provided' | 'n/a';
  markerMatch: 'match' | 'mismatch' | 'none-provided' | 'n/a';
  problems: string[];
}

export interface MissedExpectation {
  kind: string;
  source: string;
  alsoMatch?: string[];
}

export interface FixtureValidation {
  constructs: ValidatedConstruct[];
  missed: MissedExpectation[];
  summary: {
    match: number;
    convention: number;
    spurious: number;
    invalid: number;
    miss: number;
    contentMismatches: number;
    markerGaps: number;
    markerMismatches: number;
  };
}

const INLINE_EXACT_CONTENT = new Set([
  'strong', 'emphasis', 'strikethrough', 'inlineCode', 'link', 'image', 'footnoteReference',
]);

// Kinds whose markers WRAP the content (design 03 §2: only the syntax
// characters are weakened, never the content between delimiters). For these,
// markers must not overlap contentRange. Positional-marker kinds (table pipes,
// blockquote line-leading `>`, linkRefDef `:`) legitimately interleave with
// the content span and are exempt from the overlap invariant — markers must
// still lie inside sourceRange.
const MARKER_DISJOINT_KINDS = new Set([
  'strong', 'emphasis', 'strikethrough', 'inlineCode', 'link', 'image',
  'heading', 'listItem', 'taskCheckbox', 'fence', 'footnoteReference',
]);

function rangesValid(textLen: number, c: SpikeConstruct): string[] {
  const problems: string[] = [];
  const [from, to] = c.sourceRange;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > textLen || from > to) {
    problems.push(`sourceRange [${from},${to}) out of bounds (len ${textLen})`);
    return problems; // further checks meaningless
  }
  if (c.contentRange) {
    const [cf, ct] = c.contentRange;
    if (!Number.isInteger(cf) || !Number.isInteger(ct) || cf < from || ct > to || cf > ct) {
      problems.push(`contentRange [${cf},${ct}) not inside sourceRange [${from},${to})`);
    }
  }
  c.markerRanges.forEach(([mf, mt], i) => {
    if (!Number.isInteger(mf) || !Number.isInteger(mt) || mf < from || mt > to || mf > mt) {
      problems.push(`markerRanges[${i}] [${mf},${mt}) not inside sourceRange [${from},${to})`);
    }
  });
  if (c.contentRange && MARKER_DISJOINT_KINDS.has(c.kind)) {
    const [cf, ct] = c.contentRange;
    for (const [mf, mt] of c.markerRanges) {
      if (mf < ct && cf < mt) {
        problems.push(`marker [${mf},${mt}) overlaps content [${cf},${ct})`);
        break;
      }
    }
  }
  return problems;
}

export function validateFixture(
  text: string,
  constructs: SpikeConstruct[],
  expectEntries: ExpectEntry[],
  requireAll: boolean,
): FixtureValidation {
  const consumed = new Array<boolean>(expectEntries.length).fill(false);
  const out: ValidatedConstruct[] = [];

  for (const c of constructs) {
    const [from, to] = c.sourceRange;
    const sourceSlice = text.slice(from, to);
    const contentSlice = c.contentRange ? text.slice(c.contentRange[0], c.contentRange[1]) : null;
    const markerSlices = c.markerRanges.map(([f, t]) => text.slice(f, t));

    const problems = rangesValid(text.length, c);
    let roundTrip: RoundTrip = 'SPURIOUS';
    let entryIdx = -1;

    if (problems.length === 0) {
      entryIdx = expectEntries.findIndex(
        (e, i) =>
          !consumed[i] &&
          (e.kind === c.kind || (e.alsoMatch?.includes(c.kind) ?? false)) &&
          e.source === sourceSlice,
      );
      if (entryIdx !== -1) {
        roundTrip = 'MATCH';
      } else if (
        expectEntries.some(
          (e, i) =>
            !consumed[i] &&
            (e.kind === c.kind || (e.alsoMatch?.includes(c.kind) ?? false)) &&
            e.source === sourceSlice.replace(/[\n ]+$/, ''),
        )
      ) {
        // exact entry exists but our slice carries trailing whitespace the
        // canonical span excludes — convention difference, not a wrong range.
        entryIdx = expectEntries.findIndex(
          (e, i) =>
            !consumed[i] &&
            (e.kind === c.kind || (e.alsoMatch?.includes(c.kind) ?? false)) &&
            e.source === sourceSlice.replace(/[\n ]+$/, ''),
        );
        roundTrip = 'CONVENTION';
      }
    }

    if (entryIdx !== -1) consumed[entryIdx] = true;

    // content / marker checks only meaningful for matched entries
    let contentMatch: ValidatedConstruct['contentMatch'] = 'n/a';
    let markerMatch: ValidatedConstruct['markerMatch'] = 'n/a';
    if (entryIdx !== -1) {
      const e = expectEntries[entryIdx];
      if (e.content != null) {
        if (!contentSlice) contentMatch = 'none-provided';
        else {
          const ok = INLINE_EXACT_CONTENT.has(e.kind)
            ? contentSlice === e.content
            : contentSlice.trim() === e.content.trim();
          contentMatch = ok ? 'match' : 'mismatch';
        }
      }
      if (e.markers != null) {
        if (markerSlices.length === 0) markerMatch = 'none-provided';
        else {
          const want = [...e.markers].sort().join('\u0000');
          const got = [...markerSlices].sort().join('\u0000');
          markerMatch = want === got ? 'match' : 'mismatch';
        }
      }
    }

    out.push({
      ...c,
      sourceSlice,
      contentSlice,
      markerSlices,
      roundTrip,
      contentMatch,
      markerMatch,
      problems,
    });
  }

  const missed: MissedExpectation[] = [];
  expectEntries.forEach((e, i) => {
    if (!consumed[i]) missed.push({ kind: e.kind, source: e.source, alsoMatch: e.alsoMatch });
  });

  // requireAll=false (malformed): constructs are informational only — do not
  // count SPURIOUS as a signal, and there are no entries so no MISS.
  const summary = {
    match: out.filter((c) => c.roundTrip === 'MATCH').length,
    convention: out.filter((c) => c.roundTrip === 'CONVENTION').length,
    spurious: requireAll ? out.filter((c) => c.roundTrip === 'SPURIOUS').length : 0,
    invalid: out.filter((c) => c.roundTrip === 'INVALID' || c.problems.length > 0).length,
    miss: requireAll ? missed.length : 0,
    contentMismatches: out.filter((c) => c.contentMatch === 'mismatch').length,
    markerGaps: out.filter((c) => c.markerMatch === 'none-provided').length,
    markerMismatches: out.filter((c) => c.markerMatch === 'mismatch').length,
  };

  return { constructs: out, missed: requireAll ? missed : [], summary };
}
