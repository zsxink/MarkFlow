## ADDED Requirements

### Requirement: Benchmark manifest is frozen before budgets become gates
The project SHALL maintain `openspec/capabilities/manifests/benchmark.manifest.json` defining reference hardware and software, build profile, fixtures, measurement start and end points, warm-up, sample count, repetition count, and noise policy before the performance budgets SHALL become release gates.

#### Scenario: Benchmark manifest is valid and referenced
- **WHEN** running `scripts/check-capability-matrix.sh`
- **THEN** SHALL validate the benchmark manifest against its schema
- **THEN** SHALL fail if a performance budget capability is `true` without a benchmark manifest reference

### Requirement: Visual manifest is frozen
The project SHALL maintain `openspec/capabilities/manifests/visual.manifest.json` pinning OS image, WebView, fonts, theme, scale, viewport, fixture, animation state, pixel threshold, changed-pixel ratio, and reviewed masks before visual baselines become gates.

#### Scenario: Visual manifest is valid
- **WHEN** running `scripts/check-capability-matrix.sh`
- **THEN** SHALL validate the visual manifest against its schema and fail on missing fields

### Requirement: IME evidence boundary is frozen
The project SHALL maintain `openspec/capabilities/manifests/ime.manifest.json` defining which IME scenarios are automated and which require signed manual evidence, before IME acceptance is claimed.

#### Scenario: IME manifest is valid
- **WHEN** running `scripts/check-capability-matrix.sh`
- **THEN** SHALL validate the IME manifest and fail if an IME claim lacks a manifest entry

### Requirement: Widget release scope is frozen
The project SHALL maintain `openspec/capabilities/manifests/widget-scope.json` defining which structured widgets are P0 (must ship before WYSIWYG becomes default) and which are P1, before R3 widget acceptance is claimed.

#### Scenario: Widget scope is valid
- **WHEN** running `scripts/check-capability-matrix.sh`
- **THEN** SHALL validate the widget scope manifest and fail if a widget evidence claim references a widget outside the P0/P1 scope

### Requirement: Observation protocol is frozen
The project SHALL maintain `openspec/capabilities/manifests/observation.manifest.json` defining the release revision, seven-day/twenty-hour window, per-platform scenario count (at least three per canonical workflow), and log completeness rules before the observation gate becomes an archive gate.

#### Scenario: Observation manifest is valid
- **WHEN** running `scripts/check-capability-matrix.sh`
- **THEN** SHALL validate the observation manifest and fail if the observation state is `true` without a matching manifest
