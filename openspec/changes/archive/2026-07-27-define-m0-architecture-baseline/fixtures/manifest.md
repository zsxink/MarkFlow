# M0 Fixture Manifest

All M0 spikes use this fixture corpus. Small fixtures are committed; large benchmark fixtures are generated on demand into `fixtures/generated/`.

## Small Lossless Fixtures

| Fixture | Purpose |
| --- | --- |
| `small/lf-basic.md` | LF line endings, headings, paragraphs, links, and trailing newline. |
| `small/crlf-basic.md` | CRLF line endings for source-byte reconstruction. |
| `small/mixed-eol.md` | Mixed LF/CRLF/CR line endings that must be preserved per line. |
| `small/utf8-bom.md` | UTF-8 BOM preservation. |
| `small/unicode-offsets.md` | Chinese, emoji, combining mark, and UTF-16 surrogate-pair offset checks. |
| `small/trailing-newlines.md` | Final newline and multiple trailing newline preservation. |
| `small/frontmatter-lossless.md` | YAML FrontMatter with comments, quotes, blank lines, arrays, and nesting. |
| `small/html-comments.md` | HTML comment and raw HTML block preservation. |
| `small/list-markers.md` | Mixed unordered markers and ordered `.` / `)` marker styles. |
| `small/fence-styles.md` | Backtick and tilde code fences with different fence lengths. |
| `small/gfm-table.md` | GFM table alignment, padding, and task list behavior. |
| `small/malformed-recovery.md` | Unclosed fence and malformed Markdown recovery observations. |

## Benchmark Fixtures

Benchmark fixtures are intentionally not committed when generated at 1MB, 10MB, or 50MB. Recreate them with:

```bash
python3 openspec/changes/define-m0-architecture-baseline/fixtures/generate_benchmark_fixtures.py --bench
```

The generator targets approximately:

- `generated/bench-1mb.md`
- `generated/bench-10mb.md`
- `generated/bench-50mb.md`

