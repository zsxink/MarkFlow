## ADDED Requirements

### Requirement: Canonical fixture manifest is machine-readable and hashed
The repository SHALL maintain `markflow-core/fixtures/manifest.json` listing canonical Markdown fixtures covering CommonMark, GFM, CJK, malformed syntax, nested structures, tables, FrontMatter, images, diagrams, HTML, EOL variants (LF, CRLF, mixed), BOM, and 1/10/50 MiB sizes. Each entry SHALL record category, source (`canonical` or `core`), and a sha256 hash. The manifest SHALL conform to `scripts/schemas/fixture-manifest.schema.json` and be validated by `scripts/check-fixtures.sh`.

#### Scenario: Manifest validates and hashes match
- **WHEN** running `scripts/check-fixtures.sh`
- **THEN** SHALL validate `markflow-core/fixtures/manifest.json` against its schema
- **THEN** SHALL recompute sha256 for each fixture and fail on mismatch

#### Scenario: Every category is covered
- **WHEN** checking the manifest category set
- **THEN** SHALL include each of commonmark, gfm, cjk, malformed, nested, table, frontmatter, image, diagram, html, eol, and size

### Requirement: Large fixtures are committed and hashed
1/10/50 MiB fixtures SHALL live under `markflow-core/fixtures/size/` and be committed to git; the manifest SHALL record their sha256 and byte size.

#### Scenario: Size fixture hash matches manifest
- **WHEN** recomputing sha256 of each size fixture on disk
- **THEN** it SHALL equal the hash recorded in `markflow-core/fixtures/manifest.json`
