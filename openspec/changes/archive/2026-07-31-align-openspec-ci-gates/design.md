## Context

The repository already has multiple process sources:

- `AGENTS.md` defines the agent-facing mandatory workflow.
- `openspec/specs/development-flow.md` defines the detailed GitHub + SDD workflow.
- `.github/workflows/ci.yml` defines the actual PR gate.
- `scripts/check-archive-synced.sh` enforces archived delta specs being reflected in main specs.

The current failure mode is not missing CI coverage. The failure mode is process drift: local verification can be narrower than CI, and the archive order is documented differently across process files.

## Goals / Non-Goals

**Goals:**

- Make the documented workflow match the actual CI gate.
- Make Rust workspace formatting, Rust workspace clippy, and Core clippy explicit pre-PR gates.
- Make archive ordering unambiguous: sync specs and archive on the feature branch before PR when a change directory exists.
- Keep `AGENTS.md` and `development-flow.md` aligned.

**Non-Goals:**

- Do not change GitHub Actions behavior.
- Do not add new build scripts.
- Do not change runtime application code.

## Decisions

1. Treat CI as the source of truth for local pre-PR verification.

   Rationale: using local “close enough” commands is the reason workspace fmt/clippy failures reach CI. The docs must list the exact commands and working directories used by CI for the high-risk gates.

2. Archive before PR for OpenSpec-managed changes.

   Rationale: CI runs `bash scripts/check-archive-synced.sh` on PRs. If archive happens only after merge, the PR cannot review the final audit trail. For changes with OpenSpec deltas, the branch should contain both synced main specs and archived change records.

3. Keep post-merge work limited to branch cleanup and main refresh.

   Rationale: merge should not require an additional unreviewed archive commit on `main`.

4. Document independent agent review as a gate, not a recommendation.

   Rationale: the project already requires independent review before archive/merge. The detailed flow should expose that as a checkpoint before archive and before merge.

## Risks / Trade-offs

- More local commands before PR → Slower docs/code changes, but fewer CI-only failures.
- Archive before PR differs from older wording → Mitigated by updating both `AGENTS.md` and `development-flow.md` consistently.
- Docs-only changes may not need all Rust gates → The flow can allow risk-scoped execution, but Rust-affecting changes and OpenSpec-managed implementation changes must not skip Rust fmt/clippy gates.
