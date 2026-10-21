# Design

## Context

See `proposal.md` for motivation. CI installs dependencies using Node 20. `mermaid@12` now requires Node >=22.12, so this change must remain on Mermaid 11. The project already directly depends on KaTeX 0.18.x; Mermaid 11's declared KaTeX range otherwise permits a vulnerable nested 0.16.x release.

## Goals / Non-Goals

**Goals:**
- Resolve the audited production dependency advisories without raising the minimum runtime above Node 20.
- Ensure Mermaid resolves KaTeX from the already-patched direct dependency line.
- Preserve current Markdown and diagram behavior, verified with existing tests.

**Non-Goals:**
- Upgrade Mermaid to major version 12 or change CI's Node runtime.
- Change the npm audit policy, add runtime security logic, or perform unrelated dependency upgrades.

## Decisions

- Upgrade DOMPurify and markdown-it within their current major lines to the available patched versions. This limits compatibility risk while clearing their advisory ranges.
- Upgrade Mermaid within major version 11. Mermaid 12 is not selected because its Node engine requirement conflicts with the repository's Node 20 CI runtime.
- Add the npm override `katex: "$katex"` so Mermaid uses the same KaTeX spec already declared by the project, rather than retaining a vulnerable nested KaTeX 0.16.x. The resolved tree and full editor test suite must verify this is compatible.
- Keep the update in `package.json` and `package-lock.json`; avoid hand-editing lockfile entries.

## Risks / Trade-offs

- [Mermaid 11 may rely on behavior from KaTeX 0.16] → Run all tests, especially Mermaid rendering and KaTeX tests, and build the production bundle.
- [A future direct KaTeX range change could alter Mermaid's resolved version through the override] → Keep the override linked to the direct dependency spec and verify `npm ls katex` plus `npm audit` during dependency updates.
- [Registry availability can affect audit verification] → Run audit against the npm registry endpoint and report its result separately from tests.

## Migration Plan

Install the patched compatible dependency ranges and regenerate the lockfile; verify dependency resolution, production audit, build, tests, type check, capabilities, OpenSpec, and bundle-size gate. Roll back by reverting the package manifest, lockfile, and this change's OpenSpec artifacts together.
