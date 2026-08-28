// Rust port of the shared round-trip validator (spike/parser-spike/lib/validate.ts).
// Same semantics: MATCH / CONVENTION / SPURIOUS / INVALID + MISS accounting,
// content exact-vs-trim comparison, marker multiset comparison, and the
// marker-disjoint-content invariant scoped to wrapping-marker kinds.
use crate::common::{CoordMap, RangeU, SpikeConstruct};
use serde::Deserialize;

#[derive(Deserialize, Clone)]
pub struct ExpectEntry {
    pub kind: String,
    pub source: String,
    pub content: Option<String>,
    pub markers: Option<Vec<String>>,
    #[serde(rename = "alsoMatch", default)]
    pub also_match: Option<Vec<String>>,
}

#[derive(Deserialize, Clone)]
pub struct FixtureExpect {
    #[serde(rename = "requireAll", default = "default_true")]
    pub require_all: bool,
    #[serde(default)]
    pub expect: Vec<ExpectEntry>,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize)]
pub struct ExpectationsFile {
    #[serde(default)]
    pub fixtures: std::collections::BTreeMap<String, FixtureExpect>,
}

#[derive(serde::Serialize, Clone)]
pub struct ValidatedConstruct {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    pub sourceRange: RangeU,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contentRange: Option<RangeU>,
    pub markerRanges: Vec<RangeU>,
    pub sourceSlice: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contentSlice: Option<String>,
    pub markerSlices: Vec<String>,
    pub roundTrip: String,
    pub contentMatch: String,
    pub markerMatch: String,
    pub problems: Vec<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct MissedExpectation {
    pub kind: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alsoMatch: Option<Vec<String>>,
}

#[derive(serde::Serialize, Default, Clone)]
pub struct Summary {
    pub r#match: usize,
    pub convention: usize,
    pub spurious: usize,
    pub invalid: usize,
    pub miss: usize,
    pub contentMismatches: usize,
    pub markerGaps: usize,
    pub markerMismatches: usize,
}

#[derive(serde::Serialize, Default, Clone)]
pub struct FixtureValidation {
    pub constructs: Vec<ValidatedConstruct>,
    pub missed: Vec<MissedExpectation>,
    pub summary: Summary,
}

const INLINE_EXACT_CONTENT: [&str; 7] = [
    "strong", "emphasis", "strikethrough", "inlineCode", "link", "image", "footnoteReference",
];

const MARKER_DISJOINT_KINDS: [&str; 11] = [
    "strong", "emphasis", "strikethrough", "inlineCode", "link", "image", "heading", "listItem",
    "taskCheckbox", "fence", "footnoteReference",
];

fn inline_exact(kind: &str) -> bool {
    INLINE_EXACT_CONTENT.contains(&kind)
}

fn marker_disjoint(kind: &str) -> bool {
    MARKER_DISJOINT_KINDS.contains(&kind)
}

/// Slice the logical text by UTF-16 offsets (the shared coordinate system).
fn u16_slice(map: &CoordMap, text: &str, r: RangeU) -> String {
    let (b0, b1) = map.u16_slice(text, r);
    let b1 = b1.max(b0).min(text.len());
    let b0 = b0.min(b1);
    text.get(b0..b1).unwrap_or("").to_string()
}

pub fn validate_fixture(
    map: &CoordMap,
    text: &str,
    constructs: &[SpikeConstruct],
    expects: &[ExpectEntry],
    require_all: bool,
) -> FixtureValidation {
    let mut consumed = vec![false; expects.len()];
    let mut out: Vec<ValidatedConstruct> = Vec::new();

    for c in constructs {
        let (from, to) = c.sourceRange;
        let source_slice = u16_slice(map, text, c.sourceRange);
        let content_slice = c.contentRange.map(|r| u16_slice(map, text, r));
        let marker_slices: Vec<String> = c.markerRanges.iter().map(|r| u16_slice(map, text, *r)).collect();

        // bounds invariants (UTF-16 space; text u16 length = map total)
        let mut problems: Vec<String> = Vec::new();
        let u16_len = map.b2u(usize::MAX);
        if from > to || to > u16_len {
            problems.push(format!(
                "sourceRange [{from},{to}) out of bounds (len {u16_len})"
            ));
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
        if let (Some((cf, ct)), true) = (c.contentRange, marker_disjoint(&c.kind)) {
            for (mf, mt) in &c.markerRanges {
                if *mf < ct && cf < *mt {
                    problems.push(format!(
                        "marker [{mf},{mt}) overlaps content [{cf},{ct})"
                    ));
                    break;
                }
            }
        }

        // match against the expectation table
        let kind_ok = |e: &ExpectEntry| {
            e.kind == c.kind || e.also_match.as_ref().map_or(false, |alts| alts.iter().any(|k| k == &c.kind))
        };
        let mut round_trip = "SPURIOUS".to_string();
        let mut entry_idx: i64 = -1;
        if problems.is_empty() {
            if let Some(i) = expects
                .iter()
                .enumerate()
                .find(|(i, e)| !consumed[*i] && kind_ok(e) && e.source == source_slice)
                .map(|(i, _)| i)
            {
                consumed[i] = true;
                entry_idx = i as i64;
                round_trip = "MATCH".into();
            } else if let Some(i) = expects
                .iter()
                .enumerate()
                .find(|(i, e)| {
                    !consumed[*i]
                        && kind_ok(e)
                        && e.source == source_slice.trim_end_matches(['\n', ' ', '\t'])
                })
                .map(|(i, _)| i)
            {
                consumed[i] = true;
                entry_idx = i as i64;
                round_trip = "CONVENTION".into();
            }
        }

        let mut content_match = "n/a".to_string();
        let mut marker_match = "n/a".to_string();
        if entry_idx >= 0 {
            let e = &expects[entry_idx as usize];
            if let Some(want) = &e.content {
                match &content_slice {
                    None => content_match = "none-provided".into(),
                    Some(got) => {
                        let ok = if inline_exact(&e.kind) {
                            got == want
                        } else {
                            got.trim() == want.trim()
                        };
                        content_match = if ok { "match" } else { "mismatch" }.into();
                    }
                }
            }
            if let Some(want) = &e.markers {
                if marker_slices.is_empty() {
                    marker_match = "none-provided".into();
                } else {
                    let mut w: Vec<&str> = want.iter().map(|s| s.as_str()).collect();
                    let mut g: Vec<&str> = marker_slices.iter().map(|s| s.as_str()).collect();
                    w.sort_unstable();
                    g.sort_unstable();
                    marker_match = if w == g { "match" } else { "mismatch" }.into();
                }
            }
        }

        out.push(ValidatedConstruct {
            kind: c.kind.clone(),
            level: c.level,
            meta: c.meta.clone(),
            sourceRange: c.sourceRange,
            contentRange: c.contentRange,
            markerRanges: c.markerRanges.clone(),
            sourceSlice: source_slice,
            contentSlice: content_slice,
            markerSlices: marker_slices,
            roundTrip: round_trip,
            contentMatch: content_match,
            markerMatch: marker_match,
            problems,
        });
    }

    let mut missed = Vec::new();
    for (i, e) in expects.iter().enumerate() {
        if !consumed[i] {
            missed.push(MissedExpectation {
                kind: e.kind.clone(),
                source: e.source.clone(),
                alsoMatch: e.also_match.clone(),
            });
        }
    }

    let mut summary = Summary::default();
    for c in &out {
        match c.roundTrip.as_str() {
            "MATCH" => summary.r#match += 1,
            "CONVENTION" => summary.convention += 1,
            "SPURIOUS" => {
                if require_all {
                    summary.spurious += 1
                }
            }
            _ => {}
        }
        if !c.problems.is_empty() || c.roundTrip == "INVALID" {
            summary.invalid += 1;
        }
        if c.contentMatch == "mismatch" {
            summary.contentMismatches += 1;
        }
        if c.markerMatch == "none-provided" {
            summary.markerGaps += 1;
        }
        if c.markerMatch == "mismatch" {
            summary.markerMismatches += 1;
        }
    }
    if require_all {
        summary.miss = missed.len();
    } else {
        missed.clear();
    }

    FixtureValidation { constructs: out, missed, summary }
}
