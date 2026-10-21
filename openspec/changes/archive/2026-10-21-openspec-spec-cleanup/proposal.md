# Proposal

## Why

The OpenSpec inventory and supporting documentation have drifted from the repository: the capability index omits many current specs, several archived or active documents are empty, duplicated, stale, or internally inconsistent, and some stated acceptance gates do not match CI. This makes it harder for agents and maintainers to find authoritative requirements and can misrepresent what is actually enforced.

## What Changes

- Complete the OpenSpec index for the current capability set, remove duplicate `font-stack` entries, and make its documented self-check pass.
- Remove only verified empty or duplicate archive material; resolve redundant specs and conflicting statements conservatively, preserving protected capabilities and historical records where deletion is not clearly safe.
- Replace archive-generated placeholder purposes and align CI/coverage/e2e statements with verified repository behavior without introducing new CI jobs or product behavior.
- Update obsolete Markdown serialization technology references and refresh `product-spec.md` to reflect implemented capabilities and distinguish automated from manual acceptance.
- Clarify historical-reference status for stale UI design material and clean up superseded planning documents only where links and references can be maintained.
- Keep archive-sync validation, OpenSpec validation, existing product behavior, and protected historical records intact.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a documentation and inventory consistency cleanup; it does not change product behavior or introduce new requirements. Existing requirement wording may be corrected or consolidated only to accurately represent already implemented behavior and enforcement.

## Impact

- OpenSpec documentation under `openspec/specs/`, `openspec/changes/archive/`, and `openspec/ui-design/`.
- Product and historical documentation under `docs/` and repository README files where cross-references require updates.
- Validation tools and checks: `npm run validate:openspec`, `scripts/check-archive-synced.sh`, existing build/tests, index completeness, and cross-reference searches.
- No application source code, dependencies, or CI workflows are intended to change.
