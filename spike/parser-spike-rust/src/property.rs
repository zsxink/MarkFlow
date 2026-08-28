// P4A task 6.2 — property tests for range→source slice on the Rust candidates
// (markdown-rs / pulldown-cmark / comrak).
//
// Deterministic: fixed seed list + mulberry32 PRNG + fixed perturbation pools,
// the same SPEC as the TypeScript side (spike/parser-spike/lib/property-spec.mjs).
// Any change here must be mirrored there (and vice versa); both reports print
// SPEC_SHA256 (sha256 over the canonical serialization of seeds + constructs +
// pools + doc lists) so drift between the two harnesses is machine-detectable.
//
// Property classes (design/phases/P4A-render-ir.md §4):
//   P1-context    — known construct embedded in a random CJK/emoji/escape/...
//                   context: some construct of the same kind must slice to the
//                   known source text (trailing-newline tolerant, mirroring the
//                   6.1 CONVENTION rule); markers, when the candidate provides
//                   them, must equal the expected delimiter multiset.
//   P2-nested     — fixed nested docs: same-kind constructs nest cleanly (no
//                   partial overlap); documented parent>child pairs have the
//                   child's sourceRange inside the parent's.
//   P3-malformed  — unclosed fence/emphasis/link/HTML, invalid table, truncated
//                   frontmatter, orphan `***`, reversed delimiters: no panic,
//                   every reported range in bounds and satisfies invariants.
//   P4-boundary   — a NON-delimiter char (CJK / astral emoji / combining /
//                   zero-width / fullwidth space) inserted inside or at the
//                   edges of a known construct: the construct either survives
//                   (some same-kind range slices to the perturbed or original
//                   text, or legitimately absorbs it — unclosed-fence style),
//                   or is destroyed. A same-kind range overlapping the expected
//                   region WITHOUT matching/absorbing = MISPLACED (the
//                   stale-position hazard: byte-vs-UTF-16 drift) = range failure.
//   P5-validator  — the harness validator itself is fuzzed with out-of-bounds /
//                   inverted / overlapping ranges: every case must be classified
//                   INVALID, and a well-formed construct must not be flagged
//                   (guards against an always-true validator).
//   P6-heavy      — 10k-deep mixed container chain, 10k quote chain, 1k
//                   indented list chain, 5MB single word, ~5MB no-newline
//                   paragraph, 1e5 runs of `*` / `` ` `` / `#`: bounded time
//                   (5s per case), no panic, all reported ranges in bounds.
//   P7-eol        — inputs with bare (unpaired) \r and CRLF: no panic, no
//                   out-of-bounds (behavior recorded; EOL restoration belongs
//                   to the Core LineEndingMap — design/04 — and is out of
//                   scope; the logical text of the real pipeline is LF).
//   PF-frontmatter— doc starting with the canonical frontmatter + known body
//                   heading: the 6.1 KNOWN SPURIOUS (Lezer AND pulldown-cmark
//                   misparse frontmatter as setext/hr/link) is exempted ONLY
//                   inside the frontmatter span (exemption list frozen below);
//                   anything else inside, or any SPURIOUS outside, is a new
//                   finding. Candidates with native frontmatter must report a
//                   'frontmatter' construct slicing to the exact source.
//
// Candidate capability gaps (no marker spans, no escape node, no linkRefDef
// events, ...) are recorded as miss / markerNoneProvided statistics per the
// 6.1 convention — they are NOT range failures. Range failures are:
// out-of-bounds / inverted / invariant violations (invalid), MISPLACED,
// marker or content mismatch on a matched construct, panic, timeout, and a
// validator fuzz bypass.

use crate::adapters;
use crate::common::{CoordMap, SpikeConstruct};
use crate::validate;
use serde::Serialize;
use std::collections::BTreeMap;
use std::time::Instant;

// ── SPEC (must mirror spike/parser-spike/lib/property-spec.mjs) ────────────

pub const SEEDS: [u32; 10] = [42, 1337, 20260829, 7, 99, 12345, 5150, 8080, 314159, 271828];

/// Faithful port of the JS mulberry32 (32-bit integer arithmetic, identical
/// bit patterns; the JS version divides by 2^32, so do we).
pub fn mulberry32(mut seed: u32) -> impl FnMut() -> f64 {
    move || {
        seed = seed.wrapping_add(0x6d2b79f5);
        let mut t = (seed ^ (seed >> 15)).wrapping_mul(1 | seed);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        let r = (t ^ (t >> 14)) as f64;
        r / 4294967296.0
    }
}

/// Per-case seed derivation, identical in the TS spec:
///   ((Math.imul(seed, 1000003) + salt + caseIndex) | 0) >>> 0
/// Math.imul = low 32 bits of the product (i32); `+ ... | 0` wraps via ToInt32
/// — bitwise identical to u32 wrapping_add.
fn case_seed(seed: u32, salt: u32, case_index: usize) -> u32 {
    seed.wrapping_mul(1000003)
        .wrapping_add(salt)
        .wrapping_add(case_index as u32)
}

/// Floor-mapped PRNG draw — same arithmetic as the TS spec helper.
fn pick(rand: &mut impl FnMut() -> f64, n: usize) -> usize {
    (rand() * n as f64) as usize
}

pub struct KnownConstruct {
    pub kind: &'static str,
    pub source: &'static str,
    /// Expected marker multiset. None = informational (6.1 expectations
    /// `markers: null` — e.g. blockquote/list/table where the markers interleave
    /// with content or the kind has no wrapping delimiters); Some(list) = the
    /// candidate's marker slices must equal this multiset when provided.
    pub markers: Option<&'static [&'static str]>,
    /// How the construct is embedded ("expectations" = verbatim as its own
    /// block; inline constructs wrapped in a neutral paragraph, the task
    /// checkbox inside its list item).
    pub embed: &'static str,
    pub origin: &'static str,
    /// SAFE insertion offsets (INCLUSIVE char-offset pairs, source
    /// coordinates) for the P4 boundary class: inserting a non-delimiter,
    /// non-whitespace char strictly inside these ranges cannot change the
    /// construct's parse structure, so the construct MUST survive with its
    /// range slicing to the perturbed source text. Hand-verified once and
    /// frozen (e.g. heading offsets ≥ marker length; fence excludes the
    /// opening info-string start and the closing fence; autolink excludes
    /// the URI scheme, where a non-ASCII char legitimately kills the link;
    /// table excludes the delimiter row). Empty = no safe zone (the
    /// construct is only ever classified survived/destroyed there).
    pub safe: &'static [(usize, usize)],
}

pub const KNOWN_CONSTRUCTS: &[KnownConstruct] = &[
    // Sources from the frozen 6.1 expectations.json table (markers mirror the
    // table's markers field: null -> None = informational, list -> Some).
    KnownConstruct { kind: "heading", source: "# Title", markers: Some(&["#"]), embed: "# Title", origin: "expectations:utf8-lf-tail0(heading)", safe: &[(3, 7)] },
    KnownConstruct { kind: "heading", source: "# 中文标题", markers: Some(&["#"]), embed: "# 中文标题", origin: "expectations:unicode-cjk", safe: &[(2, 5)] },
    KnownConstruct { kind: "paragraph", source: "Body paragraph with ASCII and CJK 中文。\nAnother line.", markers: None, embed: "Body paragraph with ASCII and CJK 中文。\nAnother line.", origin: "expectations:utf8-lf-tail0", safe: &[(0, usize::MAX)] },
    KnownConstruct { kind: "paragraph", source: "日本語の段落。\n한국어 문단입니다.\n混合 CJK: 中文 English 日本語", markers: None, embed: "日本語の段落。\n한국어 문단입니다.\n混合 CJK: 中文 English 日本語", origin: "expectations:unicode-cjk", safe: &[(0, usize::MAX)] },
    KnownConstruct { kind: "paragraph", source: "Emoji: 😀 🎉\nZWJ family: 👨‍👩‍👧‍👦\nSkin tone: 👍🏽\nFlags: 🇯🇵", markers: None, embed: "Emoji: 😀 🎉\nZWJ family: 👨‍👩‍👧‍👦\nSkin tone: 👍🏽\nFlags: 🇯🇵", origin: "expectations:unicode-emoji", safe: &[(0, usize::MAX)] },
    KnownConstruct { kind: "fence", source: "```js\nconst x = 1;\n\n\nfunction f() {}\n```", markers: Some(&["```", "```"]), embed: "```js\nconst x = 1;\n\n\nfunction f() {}\n```", origin: "expectations:syntax-fence", safe: &[(4, 36)] },
    KnownConstruct { kind: "list", source: "- item one", markers: None, embed: "- item one", origin: "expectations:syntax-lists", safe: &[(2, 10)] },
    KnownConstruct { kind: "listItem", source: "- item one", markers: Some(&["-"]), embed: "- item one", origin: "expectations:syntax-lists", safe: &[(2, 10)] },
    KnownConstruct { kind: "listItem", source: "1. ordered", markers: Some(&["1."]), embed: "1. ordered", origin: "expectations:syntax-lists", safe: &[(3, 10)] },
    KnownConstruct { kind: "blockquote", source: "> blockquote", markers: None, embed: "> blockquote", origin: "expectations:syntax-lists(blockquote line; markers informational)", safe: &[(2, 12)] },
    KnownConstruct { kind: "table", source: "| a | b |\n| --- | --- |\n| 1 | 2 |", markers: None, embed: "| a | b |\n| --- | --- |\n| 1 | 2 |", origin: "expectations:syntax-table-reference-footnote", safe: &[(2, 3), (6, 7), (26, 27), (30, 31)] },
    KnownConstruct { kind: "linkRefDef", source: "[ref]: https://example.com", markers: None, embed: "[ref]: https://example.com", origin: "expectations:syntax-table-reference-footnote", safe: &[(1, 26)] },
    KnownConstruct { kind: "htmlComment", source: "<!-- html comment -->", markers: None, embed: "<!-- html comment -->", origin: "expectations:syntax-html", safe: &[(4, 18)] },
    KnownConstruct { kind: "image", source: "![alt](image.png)", markers: Some(&["![", "]", "(", ")"]), embed: "text ![alt](image.png) tail", origin: "expectations:syntax-image-blanklines", safe: &[(2, 4), (7, 16)] },
    KnownConstruct { kind: "strong", source: "**bold with *nested em* inside**", markers: Some(&["**", "**"]), embed: "a **bold with *nested em* inside** b", origin: "expectations:spike-extra-task-inline", safe: &[(2, 30)] },
    KnownConstruct { kind: "emphasis", source: "*nested em*", markers: Some(&["*", "*"]), embed: "a *nested em* b", origin: "expectations:spike-extra-task-inline", safe: &[(1, 10)] },
    KnownConstruct { kind: "inlineCode", source: "`inline code`", markers: Some(&["`", "`"]), embed: "a `inline code` b", origin: "expectations:spike-extra-task-inline", safe: &[(1, 12)] },
    KnownConstruct { kind: "strikethrough", source: "~~strike~~", markers: Some(&["~~", "~~"]), embed: "a ~~strike~~ b", origin: "expectations:spike-extra-task-inline", safe: &[(2, 8)] },
    KnownConstruct { kind: "link", source: "<https://example.com>", markers: Some(&["<", ">"]), embed: "a <https://example.com> b", origin: "expectations:spike-extra-task-inline", safe: &[(9, 20)] },
    KnownConstruct { kind: "link", source: "[link with *em*](https://example.com)", markers: Some(&["[", "]", "(", ")"]), embed: "a [link with *em*](https://example.com) b", origin: "expectations:spike-extra-task-inline", safe: &[(1, 15), (17, 36)] },
    KnownConstruct { kind: "escape", source: "\\*", markers: None, embed: "an escaped \\* star", origin: "expectations:spike-extra-task-inline", safe: &[] },
    // Hand construction (task checkbox): content/markers from the
    // spike-extra-task-inline expectations entries.
    KnownConstruct { kind: "taskCheckbox", source: "[ ] task one", markers: Some(&["[ ]"]), embed: "- [ ] task one", origin: "hand:spike-extra-task-inline", safe: &[(4, 11)] },
];

/// Self-contained perturbation lines, always separated from each other and
/// from the embedded construct by a blank line, so a context line can never
/// change the construct's own parse. (Unclosed HTML comments would legitimately
/// swallow following blocks per CommonMark — the pool therefore uses a CLOSED
/// comment; unclosed forms are exercised by the malformed class.)
pub const PERTURB_LINES: &[&str] = &[
    "中文标点、。！？「」测试",
    "日本語のテキストです。",
    "한국어 문장입니다.",
    "Emoji: 😀 🎉 👨‍👩‍👧‍👦 👍🏽 🇯🇵 ❤️",
    "Combining: é ä नमस्ते",
    "\u{200b}\u{feff}zero width\u{200b}",
    "　fullwidth space　",
    "**",
    "`",
    "_",
    "escaped \\* \\` \\\\ \\[ marks",
    "<!-- spike comment -->",
    "[spikeref]: https://example.com/x",
];

/// Prefix-only pool: a TAB-indented line AFTER a list construct would
/// legitimately continue the list item (indented code inside the item), so it
/// may only appear in the PREFIX (an indented code block before the construct
/// cannot merge into it). Not usable in suffixes.
pub const PERTURB_PREFIX_EXTRA: &[&str] = &["\ttab led line"];

/// Non-delimiter characters for the boundary-insertion class. Delimiter
/// characters (`*` `` ` `` `_` `\`) are excluded: inserting them legitimately
/// re-partitions delimiter runs, which would make "survived with a different
/// extent" indistinguishable from a misplaced range without a full reference
/// model. The stale-position target (byte-vs-UTF-16 unit drift) is fully
/// exercised by the astral/CJK/zero-width/fullwidth chars.
pub const BOUNDARY_CHARS: &[&str] = &["中", "😀", "\u{0301}", "\u{200b}", "\u{3000}"];

/// Safe-zone insertion chars: like BOUNDARY_CHARS but WITHOUT the Unicode
/// whitespace chars (U+200B/U+3000) — inserted directly after an opening
/// delimiter run they legitimately break left-flanking (verified on all three
/// Rust candidates), so they may only be used in the unsafe/destroyed-allowed
/// cases. `中` (letter), `😀` (symbol) and U+0301 (combining mark) can never
/// change delimiter decisions.
pub const BOUNDARY_SAFE_CHARS: &[&str] = &["中", "😀", "\u{0301}"];

pub const NESTED_DOCS: &[&str] = &[
    // 0: quote > list > fence
    "> - item with fence\n>   ```js\n>   const x = 1;\n>   ```\n> - second item\n",
    // 1: strong > emphasis (triple delimiter)
    "a ***triple*** b\n",
    // 2: link > strong > emphasis
    "x [label **bold *inner* end** tail](url) y\n",
    // 3: three-deep quote chain
    ">>> deep quote\n",
    // 4: inline code inside strong
    "**a `code` b**\n",
    // 5: list > quote > list (loose)
    "- item\n  > quote in item\n  > - nested list\n- tail\n",
    // 6: fence inside quote
    "> ```md\n> # not a heading\n> ```\n",
];

pub const MALFORMED_DOCS: &[&str] = &[
    "```js\ncode without end\n",
    "**never closed\nstill open?\n",
    "[text](http://x\n",
    "<!-- never ends\nmore text\n",
    "| a | b |\n| only one |\n| 1 | 2 |\n",
    "---\ntitle: truncated\n",
    "***\n",
    "]reversed[ and )link(\n",
    "a `code b\n",
    "![alt\n",
    "> \n",
    "- item\n  > ```\n  unclosed fence in quote\n",
    "a | b |\n| --- |\nmissing header row\n",
];

pub const EOL_DOCS: &[&str] = &[
    "a\rb\r\n#c\rTitle\r\nbody\rlast",
    "# t\r\rTitle\n===\r\n\rbody",
    "line1\r\nline2\rline3\n\r\n-tail\r",
];

/// Canonical SPEC serialization — byte-identical to the TS side
/// (lib/property-spec.mjs canonicalSpec): escape() = backslash, newline, tab;
/// records joined with \n; safe ranges as "lo..hi" (usize::MAX -> "MAX").
fn esc(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\n', "\\n").replace('\t', "\\t")
}

fn safe_ranges(safe: &[(usize, usize)]) -> String {
    let parts: Vec<String> = safe
        .iter()
        .map(|(lo, hi)| {
            if *hi == usize::MAX {
                format!("{lo}..MAX")
            } else {
                format!("{lo}..{hi}")
            }
        })
        .collect();
    format!("[{}]", parts.join(","))
}

/// sha256 over the canonical SPEC serialization (seeds, constructs, pools, doc
/// lists) — printed in both the TS and Rust property reports so drift between
/// the two harnesses is machine-detectable.
pub fn spec_fingerprint() -> String {
    let mut records: Vec<String> = Vec::new();
    records.push(format!("seeds|{}", SEEDS.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(",")));
    for c in KNOWN_CONSTRUCTS {
        let markers = match c.markers {
            None => "null".to_string(),
            Some(list) => list.iter().map(|m| esc(m)).collect::<Vec<_>>().join(","),
        };
        records.push(format!(
            "c|{}|{}|{}|{}|{}|{}",
            c.kind,
            esc(c.source),
            markers,
            esc(c.embed),
            esc(c.origin),
            safe_ranges(c.safe)
        ));
    }
    for p in PERTURB_LINES {
        records.push(format!("p|{}", esc(p)));
    }
    for p in PERTURB_PREFIX_EXTRA {
        records.push(format!("q|{}", esc(p)));
    }
    for b in BOUNDARY_CHARS {
        records.push(format!("b|{}", esc(b)));
    }
    for b in BOUNDARY_SAFE_CHARS {
        records.push(format!("s|{}", esc(b)));
    }
    for d in NESTED_DOCS {
        records.push(format!("n|{}", esc(d)));
    }
    for d in MALFORMED_DOCS {
        records.push(format!("m|{}", esc(d)));
    }
    for d in EOL_DOCS {
        records.push(format!("e|{}", esc(d)));
    }
    let mut canonical = records.join("\n");
    canonical.push('\n');
    format!("sha256:{}", spec_sha256(canonical.as_bytes()))
}

// ── minimal SHA-256 (spec fingerprint only; no new dependencies) ───────────

fn spec_sha256(data: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let k: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut msg = data.to_vec();
    let bitlen = (data.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bitlen.to_be_bytes());
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for (i, word) in chunk.chunks(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
            (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(k[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (hi, add) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *hi = hi.wrapping_add(add);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

// ── counters ────────────────────────────────────────────────────────────────

#[derive(Serialize, Default, Clone)]
pub struct ClassCounters {
    /// same-kind construct whose slice equaled the expected text
    pub matched: usize,
    /// construct legitimately absent after perturbation (recorded, not failure)
    pub destroyed: usize,
    /// legitimate structural absorption (slice ⊇ perturbed construct text,
    /// e.g. an unclosed fence swallowing the context) — recorded, not failure
    pub absorbed: usize,
    /// candidate does not produce this construct/kind at all (6.1 coverage gap)
    pub miss: usize,
    /// candidate provides no markers for the matched construct (6.1 gap)
    pub markerNoneProvided: usize,
    /// known 6.1 frontmatter SPURIOUS, exempted and counted (REPORT §3.1)
    pub spuriousExempted: usize,
    /// marker slices != expected delimiter multiset — FAILURE
    pub markerMismatch: usize,
    /// MISPLACED ranges (stale-position hazard / wrong extent) — FAILURE
    pub misplaced: usize,
    /// out-of-bounds / inverted / invariant violations — FAILURE
    pub invalid: usize,
    pub panic: usize,
    pub timeout: usize,
    /// graceful Result-Err refusal (recorded data, not a range failure)
    pub parseError: usize,
    /// validator-fuzz cases correctly classified INVALID
    pub validatorInvalidCaught: usize,
    /// validator-fuzz cases wrongly passed — FAILURE (always-true validator)
    pub validatorBypass: usize,
}

impl ClassCounters {
    pub fn range_failures(&self) -> usize {
        self.markerMismatch + self.misplaced + self.invalid + self.panic + self.timeout
            + self.validatorBypass
    }
}

pub type BTreeClasses = BTreeMap<String, ClassCounters>;
pub type ClassElapsed = BTreeMap<String, f64>;

// ── helpers ─────────────────────────────────────────────────────────────────

/// Slice the logical text by UTF-16 offsets (the shared coordinate system).
fn u16_slice(map: &CoordMap, text: &str, r: (usize, usize)) -> String {
    let (b0, b1) = map.u16_slice(text, r);
    let (b0, b1) = (b0.min(b1), b1.max(b0));
    text.get(b0..b1).unwrap_or("").to_string()
}

/// Trailing [\n \t] tolerance — mirrors the 6.1 CONVENTION rule for candidates
/// whose block spans carry a trailing newline (pulldown-cmark 0.13, some
/// comrak blocks). The TS candidate is compared EXACTLY (Lezer had 0
/// CONVENTION in 6.1); only the Rust harnesses apply this tolerance.
fn strip_trailing(s: &str) -> &str {
    s.trim_end_matches(['\n', ' ', '\t'])
}

struct Candidate {
    id: &'static str,
    parse: fn(&str) -> Result<Vec<SpikeConstruct>, String>,
}

const CANDIDATES: &[Candidate] = &[
    Candidate { id: "markdown-rs", parse: adapters::parse_mdast },
    Candidate { id: "pulldown-cmark", parse: adapters::parse_pulldown },
    Candidate { id: "comrak", parse: adapters::parse_comrak },
];

/// Global range invariants on one reported construct. Empty = valid: bounds in
/// the UTF-16 space, content inside source, markers inside source, wrapping-
/// kind markers disjoint from content, and no slice splitting a surrogate
/// pair (a lone surrogate = a byte/code-point coordinate leaked into the
/// UTF-16 space — hard INVALID).
fn range_problems(kind: &str, map: &CoordMap, text: &str, c: &SpikeConstruct) -> Vec<String> {
    let mut problems = Vec::new();
    let u16_len = map.b2u(usize::MAX);
    let (from, to) = c.sourceRange;
    if from > to || to > u16_len {
        problems.push(format!("sourceRange [{from},{to}) out of bounds (len {u16_len})"));
    }
    if let Some((cf, ct)) = c.contentRange {
        if cf < from || ct > to || cf > ct {
            problems.push(format!(
                "contentRange [{cf},{ct}) not inside sourceRange [{from},{to})"
            ));
        }
    }
    for (i, (mf, mt)) in c.markerRanges.iter().enumerate() {
        if *mf < from || *mt > to || mf > mt {
            problems.push(format!(
                "markerRanges[{i}] [{mf},{mt}) not inside sourceRange [{from},{to})"
            ));
        }
    }
    const WRAPPING: [&str; 11] = [
        "strong", "emphasis", "strikethrough", "inlineCode", "link", "image", "heading",
        "listItem", "taskCheckbox", "fence", "footnoteReference",
    ];
    if let Some((cf, ct)) = c.contentRange {
        if WRAPPING.contains(&kind) {
            for (mf, mt) in &c.markerRanges {
                if *mf < ct && cf < *mt {
                    problems.push(format!("marker [{mf},{mt}) overlaps content [{cf},{ct})"));
                    break;
                }
            }
        }
    }
    if problems.is_empty() {
        let mut slices: Vec<String> = vec![u16_slice(map, text, c.sourceRange)];
        if let Some(r) = c.contentRange {
            slices.push(u16_slice(map, text, r));
        }
        for r in &c.markerRanges {
            slices.push(u16_slice(map, text, *r));
        }
        for s in &slices {
            if has_lone_surrogate(s) {
                problems.push("slice splits a surrogate pair (coordinate drift)".to_string());
                break;
            }
        }
    }
    problems
}

/// True if the string contains half of a surrogate pair.
fn has_lone_surrogate(s: &str) -> bool {
    let units: Vec<u16> = s.encode_utf16().collect();
    units
        .windows(2)
        .any(|w| (0xD800..0xDC00).contains(&w[0]) && !(0xDC00..0xE000).contains(&w[1]))
        || units
            .last()
            .map(|u| (0xD800..0xDC00).contains(u))
            .unwrap_or(false)
}

fn parse_candidate(cand: &Candidate, text: &str) -> (Option<Vec<SpikeConstruct>>, bool) {
    // catch_unwind: a parser panic is a recorded finding, never fatal.
    // NOTE: a Rust stack overflow ABORTS the process (uncatchable) — the heavy
    // class therefore runs LAST on worker threads and the report is flushed
    // incrementally (see run_property_suite).
    match std::panic::catch_unwind(|| (cand.parse)(text)) {
        Ok(Ok(cs)) => (Some(cs), false),
        Ok(Err(_)) => (None, false),
        Err(_) => (None, true),
    }
}

fn embed_construct(embed: &str, prefix: &str, suffix: &str) -> (String, usize) {
    let doc = format!("{prefix}\n\n{embed}\n\n{suffix}");
    let start_u16 = prefix.chars().map(|c| c.len_utf16() as usize).sum::<usize>() + 2;
    (doc, start_u16)
}

// ── P1: random context ──────────────────────────────────────────────────────

fn random_context(rand: &mut impl FnMut() -> f64) -> (String, String) {
    let n_pre = 1 + pick(rand, 3);
    let n_suf = 1 + pick(rand, 3);
    let prefix_pool_len = PERTURB_LINES.len() + PERTURB_PREFIX_EXTRA.len();
    let mut pre = Vec::new();
    let mut suf = Vec::new();
    for _ in 0..n_pre {
        let i = pick(rand, prefix_pool_len);
        let line = if i < PERTURB_LINES.len() { PERTURB_LINES[i] } else { PERTURB_PREFIX_EXTRA[i - PERTURB_LINES.len()] };
        pre.push(line);
    }
    for _ in 0..n_suf {
        suf.push(PERTURB_LINES[pick(rand, PERTURB_LINES.len())]);
    }
    (pre.join("\n\n"), suf.join("\n\n"))
}

fn run_context_class(cand: &Candidate, cc: &mut ClassCounters) {
    let mut case_index = 0usize;
    for seed in SEEDS {
        for kc in KNOWN_CONSTRUCTS {
            let mut rand = mulberry32(case_seed(seed, 7919, case_index));
            case_index += 1;
            let (pre, suf) = random_context(&mut rand);
            let (doc, _start) = embed_construct(kc.embed, &pre, &suf);
            let (constructs, panicked) = parse_candidate(cand, &doc);
            if panicked {
                cc.panic += 1;
                eprintln!("[property] P1 PANIC {} seed={seed} kind={}", cand.id, kc.kind);
                continue;
            }
            let Some(constructs) = constructs else {
                cc.parseError += 1;
                continue;
            };
            let map = CoordMap::build(&doc);
            let mut matched = false;
            for c in &constructs {
                let problems = range_problems(&c.kind, &map, &doc, c);
                if !problems.is_empty() {
                    cc.invalid += 1;
                    eprintln!("[property] P1 INVALID {} {}: {}", cand.id, kc.kind, problems.join("; "));
                    continue;
                }
                if c.kind != kc.kind || matched {
                    continue;
                }
                let slice = u16_slice(&map, &doc, c.sourceRange);
                if strip_trailing(&slice) == strip_trailing(kc.source) {
                    matched = true;
                    if let Some(want_markers) = kc.markers {
                        if c.markerRanges.is_empty() {
                            cc.markerNoneProvided += 1;
                        } else {
                            let mut want: Vec<&str> = want_markers.to_vec();
                            let mut got: Vec<String> = c
                                .markerRanges
                                .iter()
                                .map(|r| u16_slice(&map, &doc, *r))
                                .collect();
                            want.sort_unstable();
                            got.sort_unstable();
                            if want != got {
                                cc.markerMismatch += 1;
                                eprintln!(
                                    "[property] P1 MARKER-MISMATCH {} {}: want {want:?} got {got:?}",
                                    cand.id, kc.kind
                                );
                            }
                        }
                    }
                }
            }
            if matched {
                cc.matched += 1;
            } else if constructs.iter().any(|c| c.kind == kc.kind) {
                // same-kind constructs exist but none slices to the known
                // source: in a blank-line-separated context the construct's
                // own parse cannot change shape — treat as misplaced.
                cc.misplaced += 1;
                eprintln!(
                    "[property] P1 MISPLACED {} seed={seed} kind={} — same-kind constructs but no slice == known source",
                    cand.id, kc.kind
                );
            } else {
                cc.miss += 1;
            }
        }
    }
}

// ── P2: nested containment ──────────────────────────────────────────────────

fn run_nested_class(cand: &Candidate, cc: &mut ClassCounters) {
    for (di, doc) in NESTED_DOCS.iter().enumerate() {
        let (constructs, panicked) = parse_candidate(cand, doc);
        if panicked {
            cc.panic += 1;
            eprintln!("[property] P2 PANIC {} doc={di}", cand.id);
            continue;
        }
        let Some(constructs) = constructs else {
            cc.parseError += 1;
            continue;
        };
        let map = CoordMap::build(doc);
        for c in &constructs {
            let problems = range_problems(&c.kind, &map, doc, c);
            if !problems.is_empty() {
                cc.invalid += 1;
                eprintln!("[property] P2 INVALID {} doc={di}: {}", cand.id, problems.join("; "));
            }
        }
        // same-kind pairs must nest cleanly or be disjoint — never partially
        // overlap (partial overlap = wrong extent = misplaced).
        for a in &constructs {
            for b in &constructs {
                if std::ptr::eq(a, b) || a.kind != b.kind {
                    continue;
                }
                let (af, at) = a.sourceRange;
                let (bf, bt) = b.sourceRange;
                let nested =
                    (af <= bf && bt <= at) || (bf <= af && at <= bt);
                let disjoint = at <= bf || bt <= af;
                if !nested && !disjoint {
                    cc.misplaced += 1;
                    eprintln!(
                        "[property] P2 PARTIAL-OVERLAP {} doc={di} kind={} a=[{af},{at}) b=[{bf},{bt})",
                        cand.id, a.kind
                    );
                }
            }
        }
        // documented parent/child containment pairs per doc (verified against
        // all four parsers in 6.2 probing: `***triple***` nests strong INSIDE
        // emphasis per CommonMark)
        let want_pairs: &[(&str, &str)] = match di {
            0 => &[("blockquote", "list"), ("list", "listItem"), ("listItem", "fence")],
            1 => &[("emphasis", "strong")],
            2 => &[("link", "strong"), ("strong", "emphasis")],
            3 => &[("blockquote", "blockquote")],
            4 => &[("strong", "inlineCode")],
            5 => &[("list", "blockquote"), ("blockquote", "list")],
            6 => &[("blockquote", "fence")],
            _ => &[],
        };
        for (parent_kind, child_kind) in want_pairs {
            let parents: Vec<&SpikeConstruct> =
                constructs.iter().filter(|c| c.kind == *parent_kind).collect();
            let children: Vec<&SpikeConstruct> =
                constructs.iter().filter(|c| c.kind == *child_kind).collect();
            if parents.is_empty() || children.is_empty() {
                cc.miss += 1; // structural coverage gap on this candidate
                continue;
            }
            let contained = parents.iter().any(|p| {
                let (pf, pt) = p.sourceRange;
                children.iter().any(|ch| {
                    let (cf, ct) = ch.sourceRange;
                    pf <= cf && ct <= pt
                })
            });
            if contained {
                cc.matched += 1;
            } else {
                cc.misplaced += 1;
                eprintln!(
                    "[property] P2 CONTAINMENT-FAIL {} doc={di} {parent_kind}>{child_kind}",
                    cand.id
                );
            }
        }
    }
}

// ── P3: malformed ───────────────────────────────────────────────────────────

fn run_malformed_class(cand: &Candidate, cc: &mut ClassCounters) {
    for (di, doc) in MALFORMED_DOCS.iter().enumerate() {
        let (constructs, panicked) = parse_candidate(cand, doc);
        if panicked {
            cc.panic += 1;
            eprintln!("[property] P3 PANIC {} doc={di}", cand.id);
            continue;
        }
        let Some(constructs) = constructs else {
            // graceful Result-Err refusal on malformed input: recorded data,
            // not a range failure (the contract forbids panics/omissions of
            // range invariants, not refusals).
            cc.parseError += 1;
            continue;
        };
        let map = CoordMap::build(doc);
        for c in &constructs {
            let problems = range_problems(&c.kind, &map, doc, c);
            if !problems.is_empty() {
                cc.invalid += 1;
                eprintln!("[property] P3 INVALID {} doc={di}: {}", cand.id, problems.join("; "));
            }
        }
    }
}

// ── P4: boundary perturbation ───────────────────────────────────────────────

/// Build `doc = pre + "\n\n" + embed' + "\n\n" + suffix` where `embed'` is the
/// embed form with the construct occurrence replaced by `occurrence_text`.
/// Returns the doc and the UTF-16 range of the occurrence inside it.
fn doc_with_occurrence(
    embed: &str,
    source: &str,
    occurrence_text: &str,
    pre: &str,
    suffix: &str,
) -> (String, (usize, usize)) {
    let byte_pos = embed.find(source).expect("occurrence must be in embed");
    let occ_start_embed = embed[..byte_pos].chars().map(|c| c.len_utf16() as usize).sum::<usize>();
    let doc = format!("{pre}\n\n{embed}\n\n{suffix}").replacen(source, occurrence_text, 1);
    // NOTE: replacen on the WHOLE doc is safe: `source` occurs exactly once in
    // embed and never in pre/suffix (contexts are from fixed pools that do not
    // contain any known construct source verbatim).
    let start = pre.chars().map(|c| c.len_utf16() as usize).sum::<usize>()
        + 2
        + occ_start_embed;
    let len = occurrence_text.chars().map(|c| c.len_utf16() as usize).sum::<usize>();
    (doc, (start, start + len))
}

fn run_boundary_class(cand: &Candidate, cc: &mut ClassCounters, safe_reps: usize) {
    let mut case_index = 0usize;
    for seed in SEEDS {
        for kc in KNOWN_CONSTRUCTS {
            let source_chars: Vec<char> = kc.source.chars().collect();
            // SAFE reps: insertion inside the frozen safe zone — the construct
            // MUST survive with its range slicing to the perturbed source.
            for _ in 0..safe_reps {
                let mut rand = mulberry32(case_seed(seed, 104_729, case_index));
                case_index += 1;
                let Some(&(lo, hi)) = kc.safe.first() else {
                    continue; // no safe zone for this construct
                };
                let hi = hi.min(source_chars.len());
                let o = lo + pick(&mut rand, hi - lo + 1);
                let ch = BOUNDARY_SAFE_CHARS[pick(&mut rand, BOUNDARY_SAFE_CHARS.len())];
                let mut perturbed = String::new();
                for (i, c) in source_chars.iter().enumerate() {
                    if i == o {
                        perturbed.push_str(ch);
                    }
                    perturbed.push(*c);
                }
                if o >= source_chars.len() {
                    perturbed.push_str(ch);
                }
                let pre = format!("前文{}行", kc.kind.len() % 3 + 1);
                let (doc, region) = doc_with_occurrence(kc.embed, kc.source, &perturbed, &pre, "後suffix行");
                let (constructs, panicked) = parse_candidate(cand, &doc);
                if panicked {
                    cc.panic += 1;
                    eprintln!("[property] P4 PANIC {} seed={seed} kind={} (safe)", cand.id, kc.kind);
                    continue;
                }
                let Some(constructs) = constructs else {
                    cc.parseError += 1;
                    continue;
                };
                let map = CoordMap::build(&doc);
                let mut survived = false;
                let mut any_kind_anywhere = false;
                let mut overlapped = false;
                for c in &constructs {
                    let problems = range_problems(&c.kind, &map, &doc, c);
                    if !problems.is_empty() {
                        cc.invalid += 1;
                        eprintln!("[property] P4 INVALID {} {}: {}", cand.id, kc.kind, problems.join("; "));
                        continue;
                    }
                    if c.kind == kc.kind {
                        any_kind_anywhere = true;
                        let (cf, ct) = c.sourceRange;
                        if !(cf < region.1 && region.0 < ct) {
                            continue;
                        }
                        overlapped = true;
                        let slice = u16_slice(&map, &doc, c.sourceRange);
                        if cf == region.0 && strip_trailing(&slice) == strip_trailing(&perturbed) {
                            survived = true;
                        } else {
                            cc.misplaced += 1;
                            eprintln!(
                                "[property] P4 SAFE-ZONE-VIOLATION {} seed={seed} kind={} o={o} char={ch:?} range=[{cf},{ct}) want=[{},{}] slice={slice:?} want={perturbed:?}",
                                cand.id, kc.kind, region.0, region.1
                            );
                        }
                    }
                }
                if survived {
                    cc.matched += 1;
                } else if overlapped {
                    // already counted per offending construct
                } else if any_kind_anywhere {
                    cc.misplaced += 1;
                    eprintln!(
                        "[property] P4 SAFE-ZONE-MISS {} seed={seed} kind={} o={o} — same-kind construct exists but not at the expected region",
                        cand.id, kc.kind
                    );
                } else {
                    // candidate never reports this kind (6.1 coverage gap)
                    cc.miss += 1;
                    eprintln!(
                        "[property] P4 MISS {} seed={seed} kind={} o={o} char={ch:?} — candidate reports no such construct",
                        cand.id, kc.kind
                    );
                }
            }
            // UNSAFE reps: insertion anywhere in the embed (edges included) —
            // the construct is then either intact/perturbed, legitimately
            // absorbed by an enclosing structure, or legitimately destroyed.
            let mut rand = mulberry32(case_seed(seed, 104_729, case_index));
            case_index += 1;
            let ch = BOUNDARY_CHARS[pick(&mut rand, BOUNDARY_CHARS.len())];
            let embed_chars: Vec<char> = kc.embed.chars().collect();
            let o = pick(&mut rand, embed_chars.len() + 1);
            let mut perturbed_embed = String::new();
            for (i, c) in embed_chars.iter().enumerate() {
                if i == o {
                    perturbed_embed.push_str(ch);
                }
                perturbed_embed.push(*c);
            }
            if o >= embed_chars.len() {
                perturbed_embed.push_str(ch);
            }
            let pre = format!("前文{}行", kc.kind.len() % 3 + 1);
            let doc = format!("{pre}\n\n{perturbed_embed}\n\n後suffix行");
            let start_u16 = pre.chars().map(|c| c.len_utf16() as usize).sum::<usize>() + 2;
            // allowed exact slices: the original source (if still contiguous)
            // and the source with the char inserted at the relative offset
            // (when the insertion fell inside the occurrence)
            let occ_byte = kc.embed.find(kc.source).unwrap_or(0);
            let occ_start = kc.embed[..occ_byte].chars().count();
            let rel = o.saturating_sub(occ_start);
            let mut allowed: Vec<String> = vec![kc.source.to_string()];
            if rel <= source_chars.len() {
                let mut p = String::new();
                for (i, c) in source_chars.iter().enumerate() {
                    if i == rel {
                        p.push_str(ch);
                    }
                    p.push(*c);
                }
                if rel >= source_chars.len() {
                    p.push_str(ch);
                }
                allowed.push(p);
            }
            let region_len: usize = perturbed_embed.chars().map(|c| c.len_utf16() as usize).sum();
            let region = (start_u16, start_u16 + region_len);

            let (constructs, panicked) = parse_candidate(cand, &doc);
            if panicked {
                cc.panic += 1;
                eprintln!("[property] P4 PANIC {} seed={seed} kind={} (unsafe)", cand.id, kc.kind);
                continue;
            }
            let Some(constructs) = constructs else {
                cc.parseError += 1;
                continue;
            };
            let map = CoordMap::build(&doc);
            let mut survived = false;
            let mut absorbed = false;
            let mut overlapped = false;
            for c in &constructs {
                let problems = range_problems(&c.kind, &map, &doc, c);
                if !problems.is_empty() {
                    cc.invalid += 1;
                    eprintln!("[property] P4 INVALID {} {}: {}", cand.id, kc.kind, problems.join("; "));
                    continue;
                }
                if c.kind != kc.kind {
                    continue;
                }
                let (cf, ct) = c.sourceRange;
                if !(cf < region.1 && region.0 < ct) {
                    continue;
                }
                overlapped = true;
                let slice = u16_slice(&map, &doc, c.sourceRange);
                let stripped = strip_trailing(&slice);
                if allowed.iter().any(|a| stripped == strip_trailing(a)) {
                    survived = true;
                } else if allowed.iter().any(|a| stripped.contains(strip_trailing(a))) {
                    // legitimate structural absorption (e.g. an unclosed fence
                    // swallowing the context). A stale/shifted range of
                    // construct length can never CONTAIN the strictly longer
                    // occurrence text, so absorption cannot mask drift.
                    absorbed = true;
                } else if allowed.iter().any(|a| strip_trailing(a).contains(stripped)) {
                    // REMNANT: the construct was legitimately re-partitioned by
                    // the insertion and a NEW same-kind construct formed from a
                    // sub-part (e.g. "![alt](x" → shorthand image "![alt]").
                    // A shifted construct-length stale range can never be a
                    // proper substring of the occurrence text.
                    cc.destroyed += 1;
                    eprintln!(
                        "[property] P4 REMNANT {} seed={seed} kind={} o={o} char={ch:?} remnant={stripped:?}",
                        cand.id, kc.kind
                    );
                } else {
                    cc.misplaced += 1;
                    eprintln!(
                        "[property] P4 MISPLACED {} seed={seed} kind={} o={o} char={ch:?} slice={stripped:?} allowed={allowed:?}",
                        cand.id, kc.kind
                    );
                }
            }
            if survived {
                cc.matched += 1;
            } else if absorbed {
                cc.absorbed += 1;
            } else if !overlapped {
                cc.destroyed += 1;
            }
        }
    }
}

// ── P5: validator fuzz (property of the harness validator itself) ───────────

const VALIDATOR_U16_LEN: usize = 20;

fn fuzz_constructs() -> Vec<(String, SpikeConstruct)> {
    let mk = |kind: &str, src: (usize, usize), content: Option<(usize, usize)>, markers: Vec<(usize, usize)>| {
        SpikeConstruct {
            kind: kind.to_string(),
            level: None,
            meta: None,
            sourceRange: src,
            contentRange: content,
            markerRanges: markers,
        }
    };
    vec![
        ("source-to>len".into(), mk("heading", (0, VALIDATOR_U16_LEN + 1), None, vec![])),
        ("source-to>>len".into(), mk("heading", (0, usize::MAX), None, vec![])),
        ("source-from>len".into(), mk("heading", (usize::MAX - 1, 3), None, vec![])),
        ("source-inverted".into(), mk("heading", (5, 3), None, vec![])),
        ("content-outside-source".into(), mk("strong", (0, 10), Some((0, 12)), vec![(0, 2), (8, 10)])),
        ("content-inverted".into(), mk("strong", (0, 10), Some((6, 4)), vec![(0, 2), (8, 10)])),
        ("marker-outside-source".into(), mk("strong", (2, 10), Some((4, 8)), vec![(0, 2)])),
        ("marker-overlaps-content".into(), mk("strong", (0, 10), Some((2, 8)), vec![(7, 9)])),
        ("marker-inverted".into(), mk("strong", (0, 10), Some((2, 8)), vec![(5, 4)])),
    ]
}

fn run_validator_class(cand: &Candidate, cc: &mut ClassCounters) {
    for (name, c) in fuzz_constructs() {
        let text = "x".repeat(VALIDATOR_U16_LEN);
        let map = CoordMap::build(&text);
        let validation = validate::validate_fixture(&map, &text, &[c.clone()], &[], false);
        if validation.constructs.iter().all(|v| !v.problems.is_empty()) {
            cc.validatorInvalidCaught += 1;
        } else {
            cc.validatorBypass += 1;
            eprintln!("[property] P5 VALIDATOR-BYPASS {} case={name}", cand.id);
        }
    }
    // sanity: a well-formed construct must NOT be flagged (no false positive)
    let text = "# t".repeat(4);
    let map = CoordMap::build(&text);
    let good = SpikeConstruct {
        kind: "heading".into(),
        level: None,
        meta: None,
        sourceRange: (0, 2),
        contentRange: Some((2, 2)),
        markerRanges: vec![(0, 1)],
    };
    let validation = validate::validate_fixture(&map, &text, &[good], &[], false);
    if validation.constructs.iter().all(|v| v.problems.is_empty()) {
        cc.matched += 1;
    } else {
        cc.validatorBypass += 1;
        eprintln!("[property] P5 FALSE-POSITIVE {} — valid construct flagged", cand.id);
    }
}

// ── P6: deep nesting / huge token ───────────────────────────────────────────

pub struct HeavyCase {
    pub name: &'static str,
    pub doc: String,
    /// per-case wall-clock budget in ms (bounded-time assertion)
    pub budget_ms: u128,
}

pub fn heavy_cases() -> Vec<HeavyCase> {
    // NOTE: the mixed-container 10k case runs LAST for every candidate — it is
    // the one case that can exceed its budget (markdown-rs), and its detached
    // worker thread would otherwise compete for CPU and skew the remaining
    // measurements.
    vec![
        HeavyCase {
            name: "quote-nest-10k",
            doc: format!("{} leaf", ">".repeat(10000)),
            budget_ms: 5_000,
        },
        HeavyCase {
            name: "list-indent-nest-1k",
            doc: (0..1000)
                .map(|i| format!("{}- x", " ".repeat(2 * i)))
                .collect::<Vec<_>>()
                .join("\n"),
            budget_ms: 5_000,
        },
        HeavyCase { name: "single-word-5mb", doc: "a".repeat(5_000_000), budget_ms: 5_000 },
        HeavyCase {
            // ~5 MB UTF-8 (12 bytes per rep), a single paragraph with no \n
            name: "no-newline-para-5mb",
            doc: "中文 word ".repeat(420_000),
            budget_ms: 5_000,
        },
        HeavyCase { name: "stars-1e5", doc: "*".repeat(100_000), budget_ms: 5_000 },
        HeavyCase { name: "backticks-1e5", doc: "`".repeat(100_000), budget_ms: 5_000 },
        HeavyCase { name: "hashes-1e5", doc: "#".repeat(100_000), budget_ms: 5_000 },
        HeavyCase {
            name: "mixed-container-nest-10k",
            doc: format!("{}leaf", "> - ".repeat(10000)),
            budget_ms: 5_000,
        },
    ]
}

enum HeavyOutcome {
    Done(Result<Vec<SpikeConstruct>, String>),
    Timeout,
}

trait JoinTimeout {
    fn join_timeout(self, budget_ms: u128) -> HeavyOutcome;
}

impl JoinTimeout for std::thread::JoinHandle<Result<Vec<SpikeConstruct>, String>> {
    fn join_timeout(self, budget_ms: u128) -> HeavyOutcome {
        use std::sync::mpsc;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(self.join());
        });
        match rx.recv_timeout(std::time::Duration::from_millis(budget_ms as u64)) {
            Ok(Ok(res)) => HeavyOutcome::Done(res),
            // join() itself failed (worker died unexpectedly) — treat as panic
            Ok(Err(_)) => HeavyOutcome::Done(Err("panic".to_string())),
            Err(_) => HeavyOutcome::Timeout,
        }
    }
}

/// Run the heavy cases for one candidate. Each case runs on a worker thread
/// (512 MB stack — deep AST drop recursion) with a wall-clock budget; a case
/// over budget is recorded as TIMEOUT (the worker keeps running detached; the
/// report is flushed before/after). Panics inside the worker are caught by
/// catch_unwind; a stack overflow would abort the process, so callers must
/// flush the report BEFORE this function runs.
fn run_heavy_class(cand: &Candidate, cc: &mut ClassCounters, elapsed: &mut ClassElapsed) {
    for case in heavy_cases() {
        let parse_fn = cand.parse;
        let doc = case.doc.clone();
        let t0 = Instant::now();
        let handle = match std::thread::Builder::new()
            .stack_size(512 * 1024 * 1024)
            .spawn(move || {
                let r = std::panic::catch_unwind(move || parse_fn(&doc));
                match r {
                    Ok(Ok(cs)) => Ok(cs),
                    Ok(Err(_)) => Err("parse-error".to_string()),
                    Err(_) => Err("panic".to_string()),
                }
            }) {
            Ok(h) => h,
            Err(_) => {
                cc.panic += 1;
                continue;
            }
        };
        match handle.join_timeout(case.budget_ms) {
            HeavyOutcome::Done(Ok(constructs)) => {
                elapsed.insert(case.name.to_string(), t0.elapsed().as_secs_f64() * 1000.0);
                let map = CoordMap::build(&case.doc);
                for c in &constructs {
                    let problems = range_problems(&c.kind, &map, &case.doc, c);
                    if !problems.is_empty() {
                        cc.invalid += 1;
                        eprintln!(
                            "[property] P6 INVALID {} {}: {}",
                            cand.id,
                            case.name,
                            problems.join("; ")
                        );
                    }
                }
            }
            HeavyOutcome::Done(Err(kind)) => {
                if kind == "panic" {
                    cc.panic += 1;
                    eprintln!("[property] P6 PANIC {} {}", cand.id, case.name);
                } else {
                    cc.parseError += 1;
                    eprintln!("[property] P6 PARSE-ERROR {} {}", cand.id, case.name);
                }
            }
            HeavyOutcome::Timeout => {
                cc.timeout += 1;
                eprintln!(
                    "[property] P6 TIMEOUT {} {} (budget {}ms)",
                    cand.id, case.name, case.budget_ms
                );
            }
        }
    }
}

// ── P7: EOL / bare CR (defensive; Core LineEndingMap owns EOL restoration) ──

fn run_eol_class(cand: &Candidate, cc: &mut ClassCounters) {
    for (di, doc) in EOL_DOCS.iter().enumerate() {
        let (constructs, panicked) = parse_candidate(cand, doc);
        if panicked {
            cc.panic += 1;
            eprintln!("[property] P7 PANIC {} doc={di}", cand.id);
            continue;
        }
        let Some(constructs) = constructs else {
            cc.parseError += 1;
            continue;
        };
        let map = CoordMap::build(doc);
        for c in &constructs {
            let problems = range_problems(&c.kind, &map, doc, c);
            if !problems.is_empty() {
                cc.invalid += 1;
                eprintln!("[property] P7 INVALID {} doc={di}: {}", cand.id, problems.join("; "));
            }
        }
    }
}

// ── PF: frontmatter (known SPURIOUS exemption, frozen list) ─────────────────

pub const FRONTMATTER_DOC_TAIL: &str = "\n# Body after frontmatter\n\n正文段落 with 中文。\n";
pub const FRONTMATTER_SOURCE: &str =
    "---\n# comment line\ntitle: \"A title\"\ntags: [a, b, c]\norder: 3\n---";

/// Run the frontmatter property for one candidate.
pub fn run_frontmatter_class(cand: &Candidate, cc: &mut ClassCounters) {
    let doc = format!("{FRONTMATTER_SOURCE}{FRONTMATTER_DOC_TAIL}");
    let fm_u16_len: usize = FRONTMATTER_SOURCE.chars().map(|c| c.len_utf16() as usize).sum();
    let (constructs, panicked) = parse_candidate(cand, &doc);
    if panicked {
        cc.panic += 1;
        eprintln!("[property] PF PANIC {}", cand.id);
        return;
    }
    let Some(constructs) = constructs else {
        cc.parseError += 1;
        return;
    };
    let map = CoordMap::build(&doc);
    let mut saw_frontmatter = false;
    for c in &constructs {
        let problems = range_problems(&c.kind, &map, &doc, c);
        if !problems.is_empty() {
            cc.invalid += 1;
            eprintln!("[property] PF INVALID {}: {}", cand.id, problems.join("; "));
            continue;
        }
        let (from, to) = c.sourceRange;
        let inside_frontmatter = from < fm_u16_len && to <= fm_u16_len + 1;
        // FROZEN exemption list — 6.1 REPORT §3.1: candidates without a
        // frontmatter node (Lezer, pulldown-cmark) misparse the frontmatter
        // body as setext heading (kind heading), the opening `---` as HR, and
        // `[a, b, c]` as Link. NOTHING else is exempt; a new kind or a range
        // outside the frontmatter span is a new finding.
        let in_exempt_list = matches!(c.kind.as_str(), "heading" | "hr" | "link");
        if inside_frontmatter && in_exempt_list {
            cc.spuriousExempted += 1;
            continue;
        }
        if c.kind == "frontmatter" {
            saw_frontmatter = true;
            let slice = u16_slice(&map, &doc, c.sourceRange);
            if strip_trailing(&slice) == strip_trailing(FRONTMATTER_SOURCE) {
                cc.matched += 1;
            } else {
                cc.misplaced += 1;
                eprintln!("[property] PF SLICE-MISMATCH {} frontmatter slice={slice:?}", cand.id);
            }
        } else if from >= fm_u16_len {
            if c.kind == "heading" {
                let slice = u16_slice(&map, &doc, c.sourceRange);
                if strip_trailing(&slice) == "# Body after frontmatter" {
                    cc.matched += 1;
                } else {
                    cc.misplaced += 1;
                    eprintln!("[property] PF MISPLACED {} heading slice={slice:?}", cand.id);
                }
            }
            // ordinary body constructs (paragraph, ...) are expected — ignored
        } else {
            // SPURIOUS construct inside the frontmatter not in the frozen
            // exemption list → new finding
            cc.misplaced += 1;
            eprintln!(
                "[property] PF NEW-SPURIOUS {} kind={} range=[{from},{to}) inside frontmatter [0,{fm_u16_len})",
                cand.id, c.kind
            );
        }
    }
    if !saw_frontmatter {
        // no native frontmatter node (Lezer, pulldown-cmark) — 6.1 MISS
        cc.miss += 1;
    }
}

// ── suite driver ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct CandidatePropertyReport {
    id: String,
    classes: BTreeClasses,
    elapsedMs: ClassElapsed,
    failures: usize,
}

fn write_report(
    out_dir: &str,
    reports: &[CandidatePropertyReport],
    total_started: Instant,
    partial: bool,
) -> Result<(), String> {
    let report = serde_json::json!({
        "spike": "parser-candidate-property-tests",
        "change": "refactor-lossless-live-preview",
        "task": "P4A 6.2 (Rust candidates range→source property tests)",
        "generatedAt": chrono_now(),
        "partial": partial,
        "totalElapsedMs": total_started.elapsed().as_secs_f64() * 1000.0,
        "spec": {
            "seeds": SEEDS,
            "knownConstructs": KNOWN_CONSTRUCTS.len(),
            "specFingerprint": spec_fingerprint(),
            "note": "same SPEC as spike/parser-spike/lib/property-spec.mjs (TS side); fingerprints must match",
        },
        "candidates": reports,
    });
    std::fs::create_dir_all(out_dir).map_err(|e| e.to_string())?;
    let file = format!("{out_dir}/property-rust.json");
    std::fs::write(
        &file,
        serde_json::to_string_pretty(&report).map_err(|e| e.to_string())? + "\n",
    )
    .map_err(|e| e.to_string())?;
    println!("[spike] wrote {file}");
    Ok(())
}

pub fn run_property_suite(out_dir: &str, skip_heavy: bool) -> Result<(), String> {
    let total_started = Instant::now();
    let mut reports: Vec<CandidatePropertyReport> = Vec::new();

    // Light classes first (catch_unwind-safe, cheap); the report is flushed
    // BEFORE the heavy class — deep-nesting worst cases can only be bounded
    // by the OS (stack overflow aborts the process), so pre-flushing keeps
    // the rest of the evidence intact.
    for cand in CANDIDATES {
        let mut classes: BTreeClasses = BTreeMap::new();
        let mut elapsed: ClassElapsed = BTreeMap::new();
        let mut run = |key: &str, f: &mut dyn FnMut(&mut ClassCounters)| {
            let mut cc = ClassCounters::default();
            let t = Instant::now();
            f(&mut cc);
            elapsed.insert(key.to_string(), t.elapsed().as_secs_f64() * 1000.0);
            classes.insert(key.to_string(), cc);
        };
        run("P1-context", &mut |cc| run_context_class(cand, cc));
        run("P2-nested", &mut |cc| run_nested_class(cand, cc));
        run("P3-malformed", &mut |cc| run_malformed_class(cand, cc));
        run("P4-boundary", &mut |cc| run_boundary_class(cand, cc, 2));
        run("P5-validator", &mut |cc| run_validator_class(cand, cc));
        run("P7-eol", &mut |cc| run_eol_class(cand, cc));
        run("PF-frontmatter", &mut |cc| run_frontmatter_class(cand, cc));
        let failures: usize = classes.values().map(|c| c.range_failures()).sum();
        reports.push(CandidatePropertyReport { id: cand.id.to_string(), classes, elapsedMs: elapsed, failures });
    }
    write_report(out_dir, &reports, total_started, true)?;

    if !skip_heavy {
        for i in 0..reports.len() {
            let id = reports[i].id.clone();
            let cand = CANDIDATES.iter().find(|c| c.id == id).unwrap();
            let mut cc = ClassCounters::default();
            let mut elapsed: ClassElapsed = BTreeMap::new();
            run_heavy_class(cand, &mut cc, &mut elapsed);
            let heavy_failures = cc.range_failures();
            reports[i].classes.insert("P6-heavy".to_string(), cc);
            for (k, v) in elapsed {
                reports[i].elapsedMs.insert(k, v);
            }
            reports[i].failures += heavy_failures;
            write_report(out_dir, &reports, total_started, false)?;
        }
    }

    let total_failures: usize = reports.iter().map(|r| r.failures).sum();
    // Exit semantics (task 6.2): the property suite PRODUCES classified
    // evidence; the elimination decision belongs to PROPERTY-REPORT.md and the
    // 6.3 ADR, not to this exit code. 0 = the suite ran to completion and all
    // findings are recorded in property-rust.json + stderr (a finding is e.g.
    // the recorded markdown-rs timeout on the 10k-deep mixed container chain).
    // Only driver-level errors (below) are fatal.
    let summary: Vec<String> = reports
        .iter()
        .filter(|r| r.failures > 0)
        .map(|r| format!("{}: {} finding(s)", r.id, r.failures))
        .collect();
    if summary.is_empty() {
        println!("[spike] OK: 0 property range failures across all Rust candidates");
    } else {
        println!(
            "[spike] DONE: {} property range finding(s) recorded (evidence in property-rust.json): {}",
            total_failures,
            summary.join("; ")
        );
    }
    Ok(())
}

fn chrono_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("unix-secs:{}", now.as_secs())
}
