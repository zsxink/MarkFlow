# Proposal

## Why

Multiple iterations have left open questions about whether `openspec/specs/` describes current behavior and validation. A focused read-only spot check found conflicting or overbroad statements; a systematic, evidence-backed audit is needed before changing any requirement whose design intent is uncertain.

## What Changes

- Audit specifications against current implementation, tests, and CI; record each disposition with the relevant spec entry and evidence.
- Correct confirmed documentation inconsistencies, including image-adjacent blank-line wording, the no-image normalization claim, trailing-newline dirty-check mode boundaries, and the OpenSpec validation command/scope in `INDEX.md`.
- Preserve uncertain requirements and explicitly mark them for maintainer confirmation; do not change product implementation.
- Run OpenSpec validation and tests relevant to confirmed spec corrections.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a documentation audit and correction; it does not intentionally change the system's behavioral contract.

## Impact

Potentially affected files are under `openspec/specs/`, `openspec/specs/INDEX.md`, and a concise audit record under the change documentation. Implementation, tests, and CI configuration are evidence sources and are not in scope for modification. No dependencies or APIs change.
