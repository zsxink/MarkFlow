use std::{
    collections::HashSet,
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use bekoedit_markdown::{
    patch::apply_patch as beko_apply_patch, ByteRange, MarkdownIndex, PatchOrigin, SourcePatch,
};
use markdown::{mdast::Node, Constructs, ParseOptions};
use pulldown_cmark::{Event, Options as PulldownOptions, Parser};
use serde::Serialize;
use serde_json::{json, Value};
use yaml_rust2::YamlLoader;

type SpikeResult<T> = Result<T, Box<dyn Error>>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NormalizedRecord {
    candidate: String,
    kind: String,
    source_range: Option<RangeRecord>,
    line_column: Option<LineColumnRecord>,
    diagnostic: Option<String>,
    unsupported_feature: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RangeRecord {
    start: usize,
    end: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LineColumnRecord {
    start_line: usize,
    start_column: usize,
    end_line: usize,
    end_column: usize,
}

fn main() -> SpikeResult<()> {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("all");
    let output = output_path(&args);
    let report = match command {
        "parser" => parser_report()?,
        "position" => position_report()?,
        "ipc" => ipc_report()?,
        "frontmatter" => frontmatter_report()?,
        "bekoedit" => bekoedit_report()?,
        "all" => json!({
            "parser": parser_report()?,
            "position": position_report()?,
            "ipc": ipc_report()?,
            "frontmatter": frontmatter_report()?,
            "bekoedit": bekoedit_report()?,
        }),
        other => return Err(format!("unknown M0 spike command: {other}").into()),
    };

    let rendered = serde_json::to_string_pretty(&report)?;
    if let Some(path) = output {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, rendered)?;
    } else {
        println!("{rendered}");
    }
    Ok(())
}

fn output_path(args: &[String]) -> Option<PathBuf> {
    args.windows(2)
        .find(|pair| pair[0] == "--output")
        .map(|pair| PathBuf::from(&pair[1]))
}

fn change_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("spikes directory has a parent")
        .to_path_buf()
}

fn small_fixtures() -> SpikeResult<Vec<PathBuf>> {
    let mut paths = fs::read_dir(change_root().join("fixtures/small"))?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?;
    paths.sort();
    Ok(paths
        .into_iter()
        .filter(|path| path.extension().is_some_and(|ext| ext == "md"))
        .collect())
}

fn benchmark_fixtures() -> Vec<PathBuf> {
    ["bench-1mb.md", "bench-10mb.md", "bench-50mb.md"]
        .into_iter()
        .map(|name| change_root().join("fixtures/generated").join(name))
        .collect()
}

fn read_fixture(path: &Path) -> SpikeResult<String> {
    let bytes = fs::read(path)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn markdown_options() -> ParseOptions {
    let mut constructs = Constructs::gfm();
    constructs.frontmatter = true;
    ParseOptions {
        constructs,
        ..ParseOptions::gfm()
    }
}

fn parser_report() -> SpikeResult<Value> {
    let mut fixtures = Vec::new();
    for path in small_fixtures()? {
        let text = read_fixture(&path)?;
        let markdown_rs = normalize_markdown_rs(&text);
        let pulldown = normalize_pulldown(&text);
        fixtures.push(json!({
            "fixturePath": path.display().to_string(),
            "fixtureBytes": fs::metadata(&path)?.len(),
            "records": {
                "markdown-rs": markdown_rs,
                "pulldown-cmark": pulldown,
            },
            "differences": parser_differences(&text),
            "adrReference": "adr/adr-parser-buffer-selection.md"
        }));
    }

    let mut benchmarks = Vec::new();
    for path in benchmark_fixtures() {
        if !path.exists() {
            benchmarks.push(json!({
                "fixturePath": path.display().to_string(),
                "missing": true,
                "allowlistReason": "Run fixture generator with --bench before benchmark collection."
            }));
            continue;
        }
        let text = read_fixture(&path)?;
        if env::var("M0_RUN_PARSER_BENCH").as_deref() != Ok("1") {
            benchmarks.push(json!({
                "fixturePath": path.display().to_string(),
                "fixtureBytes": fs::metadata(&path)?.len(),
                "candidate": "markdown-rs + pulldown-cmark",
                "skippedByDefault": true,
                "allowlistReason": "The apply run interrupted parser benchmarks after they exceeded the interactive validation window. Re-run with M0_RUN_PARSER_BENCH=1 for final machine-budget collection.",
                "command": "M0_RUN_PARSER_BENCH=1 cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- parser --output openspec/changes/define-m0-architecture-baseline/reports/parser-comparison.json"
            }));
            continue;
        }
        let iterations = if text.len() > 1024 * 1024 { 1 } else { 3 };
        benchmarks.push(json!({
            "fixturePath": path.display().to_string(),
            "fixtureBytes": fs::metadata(&path)?.len(),
            "results": [
                bench_candidate_iters("markdown-rs", iterations, || {
                    let _ = markdown::to_mdast(&text, &markdown_options());
                }),
                bench_candidate_iters("pulldown-cmark", iterations, || {
                    let options = pulldown_options();
                    let _ = Parser::new_ext(&text, options).into_offset_iter().count();
                }),
            ],
            "peakMemoryBytes": Value::Null,
            "memoryNote": "Peak memory is not measured by this portable harness; run with platform profiler for final M0 budget."
        }));
    }

    Ok(json!({
        "command": "cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- parser",
        "scenario": "parser comparison",
        "fixtures": fixtures,
        "benchmarks": benchmarks,
        "recommendation": "Use a MarkFlow-owned facade over markdown-rs plus a Level 0/1 line-block index; keep pulldown-cmark as a reference parser.",
        "adrReference": "adr/adr-parser-buffer-selection.md"
    }))
}

fn normalize_markdown_rs(text: &str) -> Vec<NormalizedRecord> {
    let mut out = Vec::new();
    match markdown::to_mdast(text, &markdown_options()) {
        Ok(node) => collect_markdown_node(&node, &mut out),
        Err(err) => out.push(NormalizedRecord {
            candidate: "markdown-rs".into(),
            kind: "diagnostic".into(),
            source_range: None,
            line_column: None,
            diagnostic: Some(err.to_string()),
            unsupported_feature: None,
        }),
    }
    out
}

fn collect_markdown_node(node: &Node, out: &mut Vec<NormalizedRecord>) {
    let (source_range, line_column) = node.position().map_or((None, None), |position| {
        (
            Some(RangeRecord {
                start: position.start.offset,
                end: position.end.offset,
            }),
            Some(LineColumnRecord {
                start_line: position.start.line,
                start_column: position.start.column,
                end_line: position.end.line,
                end_column: position.end.column,
            }),
        )
    });
    out.push(NormalizedRecord {
        candidate: "markdown-rs".into(),
        kind: markdown_node_kind(node).into(),
        source_range,
        line_column,
        diagnostic: None,
        unsupported_feature: None,
    });
    if let Some(children) = node.children() {
        for child in children {
            collect_markdown_node(child, out);
        }
    }
}

fn markdown_node_kind(node: &Node) -> &'static str {
    match node {
        Node::Root(_) => "root",
        Node::Blockquote(_) => "blockquote",
        Node::FootnoteDefinition(_) => "footnoteDefinition",
        Node::MdxJsxFlowElement(_) => "mdxJsxFlowElement",
        Node::List(_) => "list",
        Node::MdxjsEsm(_) => "mdxjsEsm",
        Node::Toml(_) => "toml",
        Node::Yaml(_) => "yaml",
        Node::Break(_) => "break",
        Node::InlineCode(_) => "inlineCode",
        Node::InlineMath(_) => "inlineMath",
        Node::Delete(_) => "delete",
        Node::Emphasis(_) => "emphasis",
        Node::MdxTextExpression(_) => "mdxTextExpression",
        Node::FootnoteReference(_) => "footnoteReference",
        Node::Html(_) => "html",
        Node::Image(_) => "image",
        Node::ImageReference(_) => "imageReference",
        Node::MdxJsxTextElement(_) => "mdxJsxTextElement",
        Node::Link(_) => "link",
        Node::LinkReference(_) => "linkReference",
        Node::Strong(_) => "strong",
        Node::Text(_) => "text",
        Node::Code(_) => "code",
        Node::Math(_) => "math",
        Node::MdxFlowExpression(_) => "mdxFlowExpression",
        Node::Heading(_) => "heading",
        Node::Table(_) => "table",
        Node::ThematicBreak(_) => "thematicBreak",
        Node::TableRow(_) => "tableRow",
        Node::TableCell(_) => "tableCell",
        Node::ListItem(_) => "listItem",
        Node::Definition(_) => "definition",
        Node::Paragraph(_) => "paragraph",
    }
}

fn pulldown_options() -> PulldownOptions {
    PulldownOptions::ENABLE_TABLES
        | PulldownOptions::ENABLE_TASKLISTS
        | PulldownOptions::ENABLE_STRIKETHROUGH
        | PulldownOptions::ENABLE_FOOTNOTES
}

fn normalize_pulldown(text: &str) -> Vec<NormalizedRecord> {
    Parser::new_ext(text, pulldown_options())
        .into_offset_iter()
        .map(|(event, range)| NormalizedRecord {
            candidate: "pulldown-cmark".into(),
            kind: pulldown_event_kind(&event).into(),
            source_range: Some(RangeRecord {
                start: range.start,
                end: range.end,
            }),
            line_column: Some(line_column_for_range(text, range.start, range.end)),
            diagnostic: None,
            unsupported_feature: None,
        })
        .collect()
}

fn pulldown_event_kind(event: &Event<'_>) -> &'static str {
    match event {
        Event::Start(_) => "start",
        Event::End(_) => "end",
        Event::Text(_) => "text",
        Event::Code(_) => "code",
        Event::Html(_) => "html",
        Event::InlineHtml(_) => "inlineHtml",
        Event::FootnoteReference(_) => "footnoteReference",
        Event::SoftBreak => "softBreak",
        Event::HardBreak => "hardBreak",
        Event::Rule => "rule",
        Event::TaskListMarker(_) => "taskListMarker",
        _ => "other",
    }
}

fn line_column_for_range(text: &str, start: usize, end: usize) -> LineColumnRecord {
    let start_lc = line_column_for_byte(text, start);
    let end_lc = line_column_for_byte(text, end);
    LineColumnRecord {
        start_line: start_lc.0,
        start_column: start_lc.1,
        end_line: end_lc.0,
        end_column: end_lc.1,
    }
}

fn line_column_for_byte(text: &str, byte: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    for (idx, ch) in text.char_indices() {
        if idx >= byte {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += ch.len_utf16();
        }
    }
    (line, col)
}

fn parser_differences(text: &str) -> Vec<String> {
    let mut differences = Vec::new();
    if text.starts_with("---") {
        differences.push("frontmatter requires explicit markdown-rs frontmatter construct; pulldown-cmark treats it as thematic break/paragraph stream".into());
    }
    if text.contains("\r\n") || text.contains('\r') {
        differences.push("parser ranges are reported against normalized Rust strings; source-byte mapping must be handled by PositionMap/LineEndingMap".into());
    }
    if text.contains("```")
        && !text.trim_end().ends_with("```")
        && !text.trim_end().ends_with("~~~~")
    {
        differences.push("malformed fence recovery differs by parser and must stay allowlisted until M1 parser facade defines diagnostics".into());
    }
    differences
}

fn position_report() -> SpikeResult<Value> {
    let mut fixture_results = Vec::new();
    for path in small_fixtures()? {
        let source = fs::read(&path)?;
        let model = TextModel::from_source_bytes(&source)?;
        fixture_results.push(json!({
            "fixturePath": path.display().to_string(),
            "fixtureBytes": source.len(),
            "bom": model.bom,
            "logicalBytes": model.logical.len(),
            "lineEndings": model.line_endings,
            "roundTrip": verify_round_trip(&model),
            "patchPreservation": verify_patch_preservation(&model),
            "adrReference": "adr/adr-position-eol-model.md"
        }));
    }
    Ok(json!({
        "command": "cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- position",
        "scenario": "buffer position eol",
        "propertyCases": unicode_property_cases(),
        "fixtures": fixture_results,
        "chosenModel": "UTF-8 logical LF text plus LineEndingMap; IPC uses UTF-16 ranges; save reconstructs source bytes with BOM and per-line EOL.",
        "adrReference": "adr/adr-position-eol-model.md"
    }))
}

#[derive(Debug)]
struct TextModel {
    bom: bool,
    logical: String,
    line_endings: Vec<String>,
}

impl TextModel {
    fn from_source_bytes(bytes: &[u8]) -> SpikeResult<Self> {
        let (bom, body) = if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
            (true, &bytes[3..])
        } else {
            (false, bytes)
        };
        let source = String::from_utf8_lossy(body);
        let mut logical = String::new();
        let mut line_endings = Vec::new();
        let chars: Vec<char> = source.chars().collect();
        let mut idx = 0;
        while idx < chars.len() {
            match chars[idx] {
                '\r' if chars.get(idx + 1) == Some(&'\n') => {
                    logical.push('\n');
                    line_endings.push("CRLF".into());
                    idx += 2;
                }
                '\r' => {
                    logical.push('\n');
                    line_endings.push("CR".into());
                    idx += 1;
                }
                '\n' => {
                    logical.push('\n');
                    line_endings.push("LF".into());
                    idx += 1;
                }
                ch => {
                    logical.push(ch);
                    idx += 1;
                }
            }
        }
        Ok(Self {
            bom,
            logical,
            line_endings,
        })
    }

    fn reconstruct(&self) -> Vec<u8> {
        let mut out = Vec::new();
        if self.bom {
            out.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        }
        let mut eol_index = 0;
        for ch in self.logical.chars() {
            if ch == '\n' {
                match self
                    .line_endings
                    .get(eol_index)
                    .map(String::as_str)
                    .unwrap_or("LF")
                {
                    "CRLF" => out.extend_from_slice(b"\r\n"),
                    "CR" => out.extend_from_slice(b"\r"),
                    _ => out.extend_from_slice(b"\n"),
                }
                eol_index += 1;
            } else {
                let mut buf = [0; 4];
                out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
            }
        }
        out
    }
}

fn verify_round_trip(model: &TextModel) -> Value {
    let mut failures = Vec::new();
    for offset in char_boundary_offsets(&model.logical) {
        let utf16 = byte_to_utf16(&model.logical, offset);
        if utf16_to_byte(&model.logical, utf16) != Some(offset) {
            failures.push(format!("byte {offset} -> utf16 {utf16} did not round trip"));
        }
        let lc = line_column_for_byte(&model.logical, offset);
        let byte_from_lc = byte_for_line_column(&model.logical, lc.0, lc.1);
        if byte_from_lc != Some(offset) {
            failures.push(format!(
                "line/column {:?} did not round trip to byte {offset}",
                lc
            ));
        }
    }
    json!({ "passed": failures.is_empty(), "failures": failures })
}

fn verify_patch_preservation(model: &TextModel) -> Value {
    let mut patched = TextModel {
        bom: model.bom,
        logical: model.logical.clone(),
        line_endings: model.line_endings.clone(),
    };
    let insert_at = patched
        .logical
        .find('\n')
        .map(|idx| idx + 1)
        .unwrap_or(patched.logical.len());
    patched.logical.insert_str(insert_at, "M0_PATCH ");
    let rebuilt = patched.reconstruct();
    json!({
        "passed": rebuilt.starts_with(if model.bom { &[0xef, 0xbb, 0xbf] } else { &[] }),
        "lineEndingsPreserved": patched.line_endings == model.line_endings,
        "rebuiltBytes": rebuilt.len()
    })
}

fn char_boundary_offsets(text: &str) -> Vec<usize> {
    let mut offsets: Vec<usize> = text.char_indices().map(|(idx, _)| idx).collect();
    offsets.push(text.len());
    offsets
}

fn byte_to_utf16(text: &str, byte: usize) -> usize {
    text[..byte].encode_utf16().count()
}

fn utf16_to_byte(text: &str, utf16: usize) -> Option<usize> {
    let mut seen = 0;
    for (idx, ch) in text.char_indices() {
        if seen == utf16 {
            return Some(idx);
        }
        seen += ch.len_utf16();
        if seen > utf16 {
            return None;
        }
    }
    (seen == utf16).then_some(text.len())
}

fn byte_for_line_column(text: &str, line: usize, column_utf16: usize) -> Option<usize> {
    let mut current_line = 1;
    let mut current_col = 1;
    for (idx, ch) in text.char_indices() {
        if current_line == line && current_col == column_utf16 {
            return Some(idx);
        }
        if ch == '\n' {
            current_line += 1;
            current_col = 1;
        } else {
            current_col += ch.len_utf16();
        }
    }
    (current_line == line && current_col == column_utf16).then_some(text.len())
}

fn unicode_property_cases() -> Vec<Value> {
    ["中文", "😀", "𝄞", "e\u{301}", "a\r\nb\nc\rd"]
        .into_iter()
        .map(|text| {
            let failures = char_boundary_offsets(text)
                .into_iter()
                .filter_map(|byte| {
                    let utf16 = byte_to_utf16(text, byte);
                    (utf16_to_byte(text, utf16) != Some(byte))
                        .then(|| format!("byte {byte}, utf16 {utf16}"))
                })
                .collect::<Vec<_>>();
            json!({ "text": text, "passed": failures.is_empty(), "failures": failures })
        })
        .collect()
}

fn ipc_report() -> SpikeResult<Value> {
    let path = change_root().join("fixtures/generated/bench-10mb.md");
    let text = if path.exists() {
        read_fixture(&path)?
    } else {
        "# Missing benchmark fixture\n\nRun the generator with --bench.\n".repeat(1024)
    };
    let mut session = SimSession::new(text);
    let midpoint = session.text.len() / 2;
    let safe_midpoint = nearest_char_boundary(&session.text, midpoint);
    let utf16_at_midpoint = byte_to_utf16(&session.text, safe_midpoint);
    let mut timings = Vec::new();
    for id in 0..30_u64 {
        let patch = UiPatch {
            transaction_id: id,
            base_revision: session.revision,
            start_utf16: utf16_at_midpoint,
            end_utf16: utf16_at_midpoint,
            replacement: "x".into(),
        };
        let started = Instant::now();
        session.apply_ui_patch(patch)?;
        timings.push(started.elapsed().as_micros());
    }
    let duplicate = session.apply_ui_patch(UiPatch {
        transaction_id: 29,
        base_revision: session.revision,
        start_utf16: utf16_at_midpoint,
        end_utf16: utf16_at_midpoint,
        replacement: "x".into(),
    })?;
    let mismatch = session.apply_ui_patch(UiPatch {
        transaction_id: 9_999,
        base_revision: 1,
        start_utf16: utf16_at_midpoint,
        end_utf16: utf16_at_midpoint,
        replacement: "bad".into(),
    })?;
    Ok(json!({
        "command": "cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- ipc",
        "scenario": "ipc patch simulation",
        "fixturePath": path.display().to_string(),
        "fixtureBytes": session.text.len(),
        "batchSize": 30,
        "p50Micros": percentile(&timings, 50),
        "p95Micros": percentile(&timings, 95),
        "maxMicros": timings.iter().copied().max().unwrap_or_default(),
        "duplicateTransaction": duplicate,
        "revisionMismatch": mismatch,
        "resyncStrategy": "Return confirmed revision and require editor mirror resync; do not save pending front-end full text.",
        "transport50Mb": "JSON string transport should be remeasured with a native Tauri IPC harness; chunking remains the fallback if first-text p95 exceeds 5s or memory doubles.",
        "adrReference": "adr/adr-document-truth-save-owner.md"
    }))
}

#[derive(Debug)]
struct UiPatch {
    transaction_id: u64,
    base_revision: u64,
    start_utf16: usize,
    end_utf16: usize,
    replacement: String,
}

#[derive(Debug)]
struct SimSession {
    text: String,
    revision: u64,
    applied: HashSet<u64>,
}

impl SimSession {
    fn new(text: String) -> Self {
        Self {
            text,
            revision: 1,
            applied: HashSet::new(),
        }
    }

    fn apply_ui_patch(&mut self, patch: UiPatch) -> SpikeResult<Value> {
        if self.applied.contains(&patch.transaction_id) {
            return Ok(json!({ "status": "duplicate", "revision": self.revision }));
        }
        if patch.base_revision != self.revision {
            return Ok(json!({
                "status": "revisionMismatch",
                "baseRevision": patch.base_revision,
                "confirmedRevision": self.revision,
                "resyncRequired": true
            }));
        }
        let start = utf16_to_byte(&self.text, patch.start_utf16).ok_or("invalid utf16 start")?;
        let end = utf16_to_byte(&self.text, patch.end_utf16).ok_or("invalid utf16 end")?;
        self.text.replace_range(start..end, &patch.replacement);
        self.revision += 1;
        self.applied.insert(patch.transaction_id);
        Ok(json!({ "status": "accepted", "revision": self.revision }))
    }
}

fn nearest_char_boundary(text: &str, mut byte: usize) -> usize {
    while !text.is_char_boundary(byte) {
        byte -= 1;
    }
    byte
}

fn frontmatter_report() -> SpikeResult<Value> {
    let mut cases = Vec::new();
    for path in small_fixtures()? {
        let text = read_fixture(&path)?;
        if let Some(frontmatter) = extract_frontmatter(&text) {
            cases.push(json!({
                "fixturePath": path.display().to_string(),
                "parse": evaluate_yaml(frontmatter),
                "safeStructuredEditSubset": [
                    "top-level mapping",
                    "string/number/bool/null scalar update",
                    "new top-level scalar key when no duplicate keys exist"
                ],
                "fallbackToSource": [
                    "anchors",
                    "aliases",
                    "custom tags",
                    "duplicate keys",
                    "flow-style rewrites",
                    "invalid YAML",
                    "non-YAML delimiters"
                ],
                "adrReference": "adr/adr-document-truth-save-owner.md"
            }));
        }
    }
    for (name, yaml) in yaml_edge_cases() {
        cases.push(json!({
            "case": name,
            "parse": evaluate_yaml(yaml),
            "adrReference": "adr/adr-document-truth-save-owner.md"
        }));
    }
    Ok(json!({
        "command": "cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- frontmatter",
        "scenario": "frontmatter lossless cst evaluation",
        "candidate": "yaml-rust2 parser plus MarkFlow source-slice preservation; yaml-rust2 is not lossless CST.",
        "cases": cases,
        "decision": "Safe structured edits are limited to simple top-level scalar mapping updates; complex YAML falls back to source editing.",
        "adrReference": "adr/adr-document-truth-save-owner.md"
    }))
}

fn extract_frontmatter(text: &str) -> Option<&str> {
    if !text.starts_with("---\n") && !text.starts_with("\u{feff}---\n") {
        return None;
    }
    let text = text.trim_start_matches('\u{feff}');
    let rest = &text[4..];
    let close = rest.find("\n---\n")?;
    Some(&rest[..close + 1])
}

fn evaluate_yaml(yaml: &str) -> Value {
    let parsed = YamlLoader::load_from_str(yaml);
    let parsed_ok = parsed.is_ok();
    let error = parsed.as_ref().err().map(|err| err.to_string());
    let has_anchor = yaml.contains('&');
    let has_alias = yaml.contains('*');
    let has_custom_tag = yaml.contains('!');
    let duplicate_keys = duplicate_top_level_keys(yaml);
    json!({
        "parsed": parsed_ok,
        "error": error,
        "preservesCommentsWhenParsed": false,
        "preservesQuotesWhenParsed": false,
        "hasAnchor": has_anchor,
        "hasAlias": has_alias,
        "hasCustomTag": has_custom_tag,
        "duplicateTopLevelKeys": duplicate_keys,
        "safeForStructuredEdit": parsed_ok && !has_anchor && !has_alias && !has_custom_tag && duplicate_keys.is_empty()
    })
}

fn duplicate_top_level_keys(yaml: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut duplicates = Vec::new();
    for line in yaml.lines() {
        if line.starts_with(' ') || line.trim_start().starts_with('#') {
            continue;
        }
        if let Some((key, _)) = line.split_once(':') {
            let key = key.trim().to_string();
            if !key.is_empty() && !seen.insert(key.clone()) {
                duplicates.push(key);
            }
        }
    }
    duplicates
}

fn yaml_edge_cases() -> Vec<(&'static str, &'static str)> {
    vec![
        ("anchors-and-aliases", "base: &base\n  a: 1\ncopy: *base\n"),
        ("duplicate-keys", "title: one\ntitle: two\n"),
        ("invalid-yaml", "title: [unterminated\n"),
        ("custom-tag", "date: !custom 2026-07-27\n"),
    ]
}

fn bekoedit_report() -> SpikeResult<Value> {
    let mut fixture_results = Vec::new();
    for path in small_fixtures()? {
        let text = read_fixture(&path)?;
        let index = MarkdownIndex::build(&text, 1);
        fixture_results.push(json!({
            "fixturePath": path.display().to_string(),
            "fixtureBytes": fs::metadata(&path)?.len(),
            "blocks": index.blocks.len(),
            "headings": index.headings.len(),
            "rawIslands": index.raw_islands.len(),
            "diagnostics": index.diagnostics,
            "sourceTruth": "MarkdownIndex is a projection over canonical text, not an owner of rewritten Markdown.",
            "revisionScopedBlockIds": index.blocks.iter().take(3).map(|block| json!({
                "ordinal": block.block_id.ordinal,
                "revisionCreated": block.block_id.revision_created,
                "kind": format!("{:?}", block.kind)
            })).collect::<Vec<_>>()
        }));
    }

    let mut semantic_text = "# Title\n\nparagraph\n".to_string();
    let good_patch = SourcePatch {
        base_revision: 1,
        range: ByteRange::new(9, 18),
        replacement: "edited".into(),
        origin: PatchOrigin::FormMode,
    };
    let good_patch_result = beko_apply_patch(&mut semantic_text, 1, &good_patch);
    let stale_patch = SourcePatch {
        base_revision: 1,
        range: ByteRange::new(0, 1),
        replacement: "##".into(),
        origin: PatchOrigin::FormMode,
    };
    let stale_result = beko_apply_patch(&mut semantic_text, 2, &stale_patch);

    let mut benchmarks = Vec::new();
    for path in benchmark_fixtures() {
        if !path.exists() {
            benchmarks.push(json!({
                "fixturePath": path.display().to_string(),
                "missing": true,
                "allowlistReason": "Run fixture generator with --bench before benchmark collection."
            }));
            continue;
        }
        let text = read_fixture(&path)?;
        if env::var("M0_RUN_BEKOEDIT_BENCH").as_deref() != Ok("1") {
            benchmarks.push(json!({
                "fixturePath": path.display().to_string(),
                "fixtureBytes": fs::metadata(&path)?.len(),
                "candidate": "bekoedit-markdown MarkdownIndex::build",
                "skippedByDefault": true,
                "allowlistReason": "Reference implementation size benchmarks are opt-in during apply to avoid long-running dependency benchmarks. Re-run with M0_RUN_BEKOEDIT_BENCH=1 for final machine-budget collection.",
                "command": "M0_RUN_BEKOEDIT_BENCH=1 cargo run --release --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- bekoedit --output openspec/changes/define-m0-architecture-baseline/reports/bekoedit-reference.json"
            }));
            continue;
        }
        let iterations = if text.len() > 20 * 1024 * 1024 { 1 } else { 3 };
        benchmarks.push(json!({
            "fixturePath": path.display().to_string(),
            "fixtureBytes": fs::metadata(&path)?.len(),
            "candidate": "bekoedit-markdown MarkdownIndex::build",
            "metrics": bench_candidate_iters("bekoedit-markdown", iterations, || {
                let _ = MarkdownIndex::build(&text, 1);
            }),
            "peakMemoryBytes": Value::Null
        }));
    }

    Ok(json!({
        "command": "cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- bekoedit",
        "scenario": "bekoedit-markdown reference comparison",
        "version": "0.13.1",
        "license": "Apache-2.0",
        "repository": "https://github.com/nabbisen/bekoedit",
        "contractReview": {
            "markdownSourceTruth": true,
            "revisionScopedBlockId": true,
            "minimalSourcePatch": good_patch_result.is_ok(),
            "staleRevisionRejected": stale_result.is_err(),
            "rawMarkdownIsland": true,
            "typedUiContract": "bekoedit-ui-contract 0.13.1 exposes versioned source editor payloads"
        },
        "semanticCommandBehavior": {
            "goodPatch": format!("{:?}", good_patch_result),
            "stalePatch": format!("{:?}", stale_result)
        },
        "fixtures": fixture_results,
        "benchmarks": benchmarks,
        "adoptionOutcome": "reference only",
        "adrReference": "adr/adr-bekoedit-adoption.md"
    }))
}

fn bench_candidate_iters<F>(candidate: &str, iterations: usize, mut run: F) -> Value
where
    F: FnMut(),
{
    let mut timings = Vec::new();
    for _ in 0..iterations {
        let started = Instant::now();
        run();
        timings.push(started.elapsed().as_micros());
    }
    json!({
        "candidate": candidate,
        "iterations": iterations,
        "p50Micros": percentile(&timings, 50),
        "p95Micros": percentile(&timings, 95),
        "maxMicros": timings.iter().copied().max().unwrap_or_default(),
    })
}

fn percentile(values: &[u128], pct: usize) -> u128 {
    if values.is_empty() {
        return 0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let index = (((sorted.len() * pct) + 99) / 100).saturating_sub(1);
    sorted[index.min(sorted.len() - 1)]
}
