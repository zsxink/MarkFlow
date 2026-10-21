# Design

## Context

See `proposal.md` for motivation and scope. The current tree contains a mixture of behavior tests, snapshot/artifact checks, and some weak or duplicate assertions. The installed OpenSpec contracts already describe coverage and e2e enforcement in line with current CI; this change must not imply that currently disabled coverage or e2e checks run in CI. The release workflow already uses isolated DMG collection, while the local DMG build script still invokes the older in-process verifier.

## Goals / Non-Goals

**Goals:**
- Make retained tests assert observable behavior and derive expectations from the actual corpus where possible.
- Preserve the explicit critical-coverage files and keep all verification deterministic and offline.
- Ensure local DMG builds use isolated collection and still fail hard on appearance-contract violations.
- Keep OpenSpec claims faithful to executed checks.

**Non-Goals:**
- No production behavior changes, new dependencies, or new CI jobs.
- Do not enable coverage collection or add e2e to required CI without a separate decision.
- Do not remove manual product acceptance/performance constraints solely because they lack automation.
- Do not delete benchmark or Orca allowlist tests identified as critical in the issue.

## Decisions

1. **Use behavior-based tests, not test-count reduction as the objective.** Remove only confirmed tautologies and duplicate coverage. For retained coverage, assert outputs, state transitions, or actual UI/DOM effects. Keep the benchmark gates and allowlisted markdown-it imports intact. Where a test currently checks a committed evidence artifact, separate artifact consistency validation from a gate that is recomputed from this run's corpus results; derive expected counts from the fixture definitions rather than fixed magic numbers.

2. **Treat evidence files as generated evidence, not runtime gate inputs.** A test must not pass solely because a committed JSON summary says `PASS`. Recompute the relevant result from the test corpus and verify failure behavior without mutating tracked evidence. For field-scan, keep generated evidence out of ordinary test side effects unless the existing workflow explicitly requires it; assert corpus coverage from its source definition.

3. **Preserve current CI boundaries.** The existing coverage and e2e specs already state that `npm test` does not collect coverage and e2e is not a required CI gate. Do not install a coverage provider or add a macOS e2e job in this issue. Remove only acceptance language that is genuinely vacuous; retain meaningful CI command requirements and product constraints.

4. **Use the isolated DMG collector as the single appearance assertion path.** Keep styling before collection in `build-dmg`; invoke the collector for local builds as well as CI. Remove the superseded verifier and its package command only after checking there are no other callers. Keep the regression script's screenshot warning behavior, while ensuring collector assertion failures remain fatal.

5. **Resolve optional poppler conservatively.** Keep poppler-dependent PDF text checks optional for local environments, but emit a clear warning when unavailable so a green run cannot be mistaken for that assertion having executed. Do not make unrelated CI platform/dependency changes here.

## Risks / Trade-offs

- [Over-removal reduces meaningful coverage] → Compare changed cases against the issue's critical-path keep-list and preserve equivalent behavioral assertions.
- [Corpus-derived expectations may still encode implementation assumptions] → Derive cardinality from fixture metadata and assert meaningful status/output invariants, not a hard-coded count alone.
- [Removing the old DMG verifier could break an undocumented caller] → Search package scripts, workflows, and repository references before deletion; retain the shared assertion logic in the collector.
- [Optional PDF assertions can still be skipped] → Print an explicit warning that names the skipped tool/check; keep platform skip behavior explicit.
- [Tests that write evidence can dirty the worktree or race] → Move generated output to a temporary location or a dedicated explicit tool path, and verify ordinary tests leave tracked evidence unchanged.

## Migration Plan

1. Update/merge tests and scripts while preserving the critical keep-list.
2. Run focused tests, then the full Vitest suite, TypeScript check, build, OpenSpec validation, and archive sync checks.
3. Validate DMG script routing statically and run available macOS DMG checks; when no DMG artifact is available, report that limitation rather than claiming runtime verification.
4. Do not archive until verification is green and the delta specs have been synced.

Rollback is a normal revert of the test/script/spec changes; no data migration or runtime compatibility step is required.
