# Design

## Context

See `proposal.md` for motivation and scope. This change is a repository documentation cleanup. `openspec/specs/INDEX.md` is the capability routing inventory, while `scripts/check-archive-synced.sh` enforces that archived deltas have corresponding main specs after its cutoff. Consequently, a spec that appears historical may still be required by validation. The requested edits must be grounded in current source, CI configuration, tests, and complete spec text rather than issue descriptions alone.

## Goals / Non-Goals

**Goals:**
- Make documentation changes auditable, evidence-based, and compatible with OpenSpec and archive-sync validators.
- Preserve the distinction between product requirements, enforcement actually performed by CI, and manual or historical references.
- Keep the cleanup scoped to documentation and archive content; retain historical records when deletion has unclear value or validator impact.

**Non-Goals:**
- Changing application behavior, adding dependencies, or modifying CI to add coverage/e2e jobs.
- Rewriting product requirements to claim enforcement that does not exist.
- Bulk-moving pre-cutoff archive history or deleting intentionally retained deprecated records.

## Decisions

1. **Treat current repository evidence as authoritative.** Verify each claim against the relevant source/spec, `package.json`, workflow files, test configuration, and archive gate before editing. Update wording to describe the actual state; do not introduce new enforcement as part of this documentation-only issue.

2. **Use a complete, deduplicated capability index.** Inventory `openspec/specs/` and ensure each capability is discoverable once in the index's routing section. Preserve the document's existing organization and self-check convention. Do not count occurrences in explanatory text as duplicate routing entries.

3. **Do not remove protected main specs without satisfying archive-sync.** Run `scripts/check-archive-synced.sh` after changes. Keep `m0-architecture-baseline` as a labeled deprecated historical record unless the gate and references can be safely updated without losing useful history. Do not add an exception to the gate merely to make a deletion pass.

4. **Resolve duplicate records by exact evidence and minimal deletion.** Remove the known empty archive shell and the older byte-identical `types-system` duplicate. For the two file-tree split archives, compare full contents and references; retain the more authoritative complete record and remove the duplicate only if history and archive-sync checks remain valid. Do not bulk-migrate legacy archive directories.

5. **Consolidate duplicated statements without collapsing distinct scopes.** Keep PDF file generation and rendered print flow as separate capabilities, but define their logging event set consistently in one authoritative location and reference it elsewhere. For repeated continuation behavior and ARIA/layout statements, retain the most complete requirement and cross-reference it from the narrower capability where useful. Correct placeholder purposes rather than deleting protected capabilities solely to eliminate template text.

6. **Describe enforcement precisely.** For coverage thresholds and e2e smoke tests, inspect installed providers, scripts, CI workflows, and tests. Since CI changes are out of scope, revise claims that they block PRs to distinguish configured thresholds or locally runnable tests from checks actually enforced in CI. Rewrite dependency audit wording as an audit outcome rather than naming packages that may legitimately remain dependencies.

7. **Update technology and product documentation from implementation.** Replace obsolete `tiptap-markdown` positive technology claims with `@tiptap/markdown` v3, while preserving the specific prohibition against legacy imports. Refresh the feature matrix from implemented capabilities. Keep performance targets as product constraints and label their verification as manual/not yet automated when no automation exists; convert only confirmed automated acceptance rows to references to the corresponding smoke tests.

8. **Preserve linked historical UI and planning documents.** Mark `openspec/ui-design/` as a historical visual reference rather than deleting it, and keep its still-accurate design tokens intact. Before removing or archiving superseded documents, update inbound links and preserve useful evidence; leave items whose safe disposition cannot be established unchanged and document them as deferred rather than broadening the change.

## Risks / Trade-offs

- **[Risk]** The issue's initial audit may contain stale conclusions → **Mitigation:** verify every deletion and status claim against the current checkout before acting.
- **[Risk]** Removing a capability spec can fail the post-cutoff archive-sync gate → **Mitigation:** preserve protected specs and run the gate after each relevant consolidation.
- **[Risk]** Consolidation can erase a distinct scope or useful historical context → **Mitigation:** retain capability boundaries and use references; prefer annotation over deletion where intent is ambiguous.
- **[Risk]** Index checks may distinguish inventory from references in ways not obvious from prose → **Mitigation:** run the documented self-check and inspect its exact output, ensuring all capability entries are present once.

## Migration Plan

1. Inventory current specs, links, archive contents, CI workflows, scripts, and source-backed feature claims.
2. Apply index and documentation corrections in small groups; remove only verified empty/duplicate archive files.
3. Run OpenSpec validation, archive-sync validation, the index self-check, placeholder/technology/cross-reference searches, build, and tests.
4. Review the final diff to confirm no product source, dependency, or CI workflow was changed. If a protected history or ambiguous document cannot be safely handled, retain it and record the reason in the change summary.
5. Rollback is a Git revert of the documentation-only change; no data migration is required.
