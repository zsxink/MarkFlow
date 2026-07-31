# canonical-fixtures Specification

## Purpose

定义 phase-2 规范化的 Markdown 测试夹具集合：机器可读的 manifest（含分类与 sha256 哈希）、覆盖 CommonMark/GFM/CJK 等类别的固定夹具、以及提交入库的大尺寸夹具。确保编辑器测试与基准在不同环境可复现、可校验。

## Agent Context

- **源码入口：** `markflow-core/fixtures/manifest.json`、`scripts/check-fixtures.sh`、`scripts/schemas/fixture-manifest.schema.json`、`scripts/gen-size-fixtures.sh`。
- **关联规范：** `ci-openspec-validation`（fixture 检查纳入 `validate:openspec`）、`visual-release-gate`（benchmark 清单引用 fixtures）。
- **不变量：** 所有 fixture（含 size 填充文件）提交到 git；manifest 记录的 sha256 必须与磁盘内容一致；manifest 必须通过 schema 校验。
- **验证：** `scripts/check-fixtures.sh`；`npm run validate:openspec`。

## Requirements

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
