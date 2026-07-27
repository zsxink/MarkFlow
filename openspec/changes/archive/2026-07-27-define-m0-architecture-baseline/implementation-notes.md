# M0 Architecture Baseline Implementation Notes

## Flow Record

- Issue: https://github.com/zsxink/MarkFlow/issues/193
- Branch: `docs/issue-193-m0-architecture-baseline-openspec`
- Change: `define-m0-architecture-baseline`
- Scope: OpenSpec apply artifacts plus a scoped Rust test-fixture offline fix. This change does not archive specs.

## Reviewed Inputs

- `docs/markflow-core-stages/m0-architecture-baseline.md`
- `docs/markflow-core-stages/product-plan.md`
- `docs/markflow-core-stages/technical-plan.md`
- `docs/markflow-core-stages/feature-migration-matrix.md`
- `openspec/changes/define-m0-architecture-baseline/proposal.md`
- `openspec/changes/define-m0-architecture-baseline/design.md`
- `openspec/changes/define-m0-architecture-baseline/specs/**/spec.md`
- `openspec/changes/define-m0-architecture-baseline/tasks.md`

## M0 Scope Note

M0 is an evidence gate. It may add ADRs, fixtures, isolated spike code, benchmark outputs, validation logs, scoped stage-document references, and test-only changes required to remove public network dependencies from validation.

The following remain out of scope for this apply step:

- Production `markflow-core` crate API.
- Core-backed Source Mode product path.
- Save-chain replacement.
- SolidJS migration.
- Core-backed WYSIWYG / Live Preview product path.
- Third-party plugin ABI or SDK.
- Export migration.

The only source-tree code change in this apply is in `src-tauri/src/http.rs` test cases: redirect acceptance tests now use a public IP fixture instead of resolving `other.com`. This does not change runtime HTTP validation behavior.

## Artifact Locations

| Artifact | Location |
| --- | --- |
| ADRs | `openspec/changes/define-m0-architecture-baseline/adr/*.md` |
| Small fixtures | `openspec/changes/define-m0-architecture-baseline/fixtures/small/*` |
| Generated benchmark fixture script | `openspec/changes/define-m0-architecture-baseline/fixtures/generate_benchmark_fixtures.py` |
| Generated benchmark fixture directory | `openspec/changes/define-m0-architecture-baseline/fixtures/generated/` |
| Spike harness | `openspec/changes/define-m0-architecture-baseline/spikes/` |
| Reports | `openspec/changes/define-m0-architecture-baseline/reports/*` |

## Current Baseline Notes

CodeGraph review confirms the current product path still has `src/lib/editor.ts` owning `getMarkdown()`, source/wysiwyg switching, serializer fallback, trailing-newline metadata, and dirty-state clearing. Tauri command modules still own platform file, image, download, and export effects. These observations are captured in the feature migration matrix baseline and are intentionally not changed by M0.
