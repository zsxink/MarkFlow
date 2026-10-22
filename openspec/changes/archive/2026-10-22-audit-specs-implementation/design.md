# Design

## Context

See `proposal.md` for motivation and scope. The repository has a broad `openspec/specs/` inventory; the audit must distinguish behavioral requirements from explanatory metadata and commands. The issue's initial findings are hypotheses, not conclusions. Existing implementation, tests, and CI are the evidence sources. No product code or CI behavior is to be changed.

## Goals / Non-Goals

**Goals:**
- Make audit dispositions traceable from each reviewed spec claim to implementation, test, or CI evidence.
- Correct only statements whose inaccuracy is demonstrated by that evidence.
- Keep unresolved intent visible rather than treating absence of implementation evidence as proof of deprecation.

**Non-Goals:**
- Changing application behavior, test behavior, or CI configuration.
- Removing requirements solely because they are not currently covered by a test.
- Rewriting the specifications wholesale for style.

## Decisions

- Record the audit in a concise Markdown report within this change, with one disposition per reviewed requirement/claim and evidence paths or commands. This keeps rationale and uncertain follow-ups attached to the archived change without introducing a product capability.
- Use source and tests to assess runtime claims, and workflow/package scripts to assess validation commands. A mismatch is corrected only where the actual intended contract is clear; otherwise preserve the current requirement and flag it for maintainer confirmation.
- For issue-reported edge cases, inspect relevant code and tests before editing. In particular, distinguish Source-mode normalization from WYSIWYG serialization and distinguish dirty-comparison policy from exact Source-mode text persistence.
- Keep this change `skip_specs: true`: its output is documentation calibration, not a change to product behavior. Direct edits to canonical specs are allowed as docs, but no delta requirement should be invented to represent the audit process.

## Risks / Trade-offs

- [Audit scope is broad] → Review the full spec inventory in bounded sections and report coverage explicitly; do not claim unreviewed requirements were verified.
- [Current behavior may not reveal design intent] → Retain the requirement and list a concrete maintainer question rather than deleting or weakening it.
- [Evidence can become stale] → Cite repository-relative files and relevant test/CI commands so later audits can re-check claims.
