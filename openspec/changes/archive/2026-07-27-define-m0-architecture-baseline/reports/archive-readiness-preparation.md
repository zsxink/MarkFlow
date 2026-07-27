# Archive Readiness Preparation

This is a preparation record only. This apply step does not sync specs into main specs and does not archive the change.

## Artifact Checklist

- Proposal: `proposal.md`
- Design: `design.md`
- Tasks: `tasks.md`
- Delta specs: `specs/**/spec.md`
- ADRs: `adr/*.md`
- Fixtures: `fixtures/manifest.md`, `fixtures/small/*.md`, `fixtures/generate_benchmark_fixtures.py`
- Spike harness: `spikes/README.md`, `spikes/Cargo.toml`, `spikes/src/main.rs`
- Reports: `reports/*.md`, `reports/*.json`

## Archive-time Commands

Run these only after final independent review and spec sync:

```bash
npx openspec validate --all
bash scripts/check-archive-synced.sh
openspec archive define-m0-architecture-baseline
```

## Pending Before Archive

- Main agent must dispatch a final independent sub-agent archive review.
- Delta specs must be synced into `openspec/specs/` before moving the change to archive.
- Parser p95 remains unfrozen unless the opt-in benchmark is split or completed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed after the DNS-dependent redirect acceptance tests were converted to public IP fixtures. Archive should keep this as the validation baseline unless later HTTP tests reintroduce public DNS.
