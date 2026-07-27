# M0 Spike Harness

This harness is isolated from product paths. It is not a production `markflow-core` crate and is not part of the app build.

## Prepare Fixtures

```bash
python3 openspec/changes/define-m0-architecture-baseline/fixtures/generate_benchmark_fixtures.py --small
python3 openspec/changes/define-m0-architecture-baseline/fixtures/generate_benchmark_fixtures.py --bench
```

## Commands

```bash
cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- parser --output openspec/changes/define-m0-architecture-baseline/reports/parser-comparison.json
cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- position --output openspec/changes/define-m0-architecture-baseline/reports/position-eol.json
cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- ipc --output openspec/changes/define-m0-architecture-baseline/reports/ipc-patch.json
cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- frontmatter --output openspec/changes/define-m0-architecture-baseline/reports/frontmatter-lossless.json
cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- bekoedit --output openspec/changes/define-m0-architecture-baseline/reports/bekoedit-reference.json
cargo run --manifest-path openspec/changes/define-m0-architecture-baseline/spikes/Cargo.toml -- all --output openspec/changes/define-m0-architecture-baseline/reports/all-spikes.json
```

The harness writes JSON reports. Markdown summaries in `reports/*.md` cite those JSON files and ADRs.

