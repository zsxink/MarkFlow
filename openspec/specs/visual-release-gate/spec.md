# visual-release-gate Specification

## Purpose
定义 WYSIWYG 视觉与发布门禁：语义 GUI E2E、确定性视觉回归基线、IME 无障碍与平台冒烟、编辑器性能预算，以及作为 archive 门禁的稳定观察期。确保 Typora 级 WYSIWYG 以可验证方式发布。

## Requirements
### Requirement: WYSIWYG release requires semantic GUI E2E
The required CI pipeline SHALL run a real Tauri desktop smoke suite that verifies successful Render IR, visible projection semantics, editing commands, mode switching, saving, and error-free logs. Text presence alone SHALL NOT satisfy WYSIWYG acceptance.

#### Scenario: Supported fixture renders semantically
- **WHEN** the desktop E2E opens the canonical WYSIWYG fixture
- **THEN** headings, inline formatting, links, quotes, lists, tasks, code, tables, images, FrontMatter, and diagrams satisfy semantic DOM or widget assertions
- **THEN** supported inactive markers are not visibly rendered

#### Scenario: Bridge error fails the suite
- **WHEN** logs contain missing command arguments, render failure, session leak, stale result application, save failure, or panic during the scenario
- **THEN** the E2E suite fails and preserves logs and screenshots

### Requirement: Visual regression baselines are deterministic
The project SHALL maintain reviewed light and dark theme screenshot baselines for representative desktop viewports and editor states. Baselines SHALL cover inactive rendering, active marker reveal, selections, widgets, degraded state, and Source Mode. A versioned visual-gate manifest SHALL pin OS image, WebView, fonts, theme, scale, viewport, fixture, animation state, pixel threshold, allowed changed-pixel ratio, and reviewed masks.

#### Scenario: Unexpected visual change blocks merge
- **WHEN** a pull request changes pixels outside approved tolerance in a required baseline
- **THEN** CI fails with current, expected, and diff artifacts
- **THEN** baseline updates require explicit review

### Requirement: IME accessibility and platform smoke are mandatory
Release acceptance SHALL include macOS, Windows, and Linux smoke; macOS SHALL include Chinese IME, and available platform coverage SHALL include Japanese/Korean composition, keyboard-only navigation, focus order, and screen-reader-oriented accessibility assertions.

#### Scenario: Platform remains unverified
- **WHEN** a required platform or IME scenario has not run successfully
- **THEN** the phase remains incomplete
- **THEN** the missing gate MUST NOT be converted to deferred acceptance in the same release

### Requirement: Editor performance budgets are enforced
Normal document local input commit p95 SHALL be at most 16 ms on the reference machine; confirmed projection p95 SHALL be at most 50 ms for normal documents and 100 ms for large documents. Documents over 1 MiB MUST NOT create whole-document widgets, and a 10 MiB document SHALL remain editable, scrollable, saveable, and switchable to Source Mode. A versioned benchmark manifest SHALL define reference hardware and software, build profile, fixtures, measurement start/end points, warm-up, sample count, repetition count, and noise policy before these budgets become release gates.

#### Scenario: Performance budget regression
- **WHEN** the benchmark exceeds an enforced p95 budget or performs an unbounded full-document render
- **THEN** the release gate fails with trace and fixture identity

### Requirement: Stable observation is an archive gate
The final removal and archive phase SHALL complete at least seven consecutive calendar days and twenty cumulative active-editing hours of observation using the exact release-candidate revision. It SHALL execute every canonical workflow at least three times on each required platform and retain complete, privacy-safe logs. It SHALL verify absence of silent fallback, revision divergence, lost input, wrong-session projection, wrong-window result, hidden save failure, and legacy editor truth paths.

#### Scenario: Observation evidence is stale or incomplete
- **WHEN** available logs predate the implementation under review or omit required scenarios
- **THEN** archive and merge remain blocked
- **THEN** the task cannot be checked by relabeling it as follow-up or deferred acceptance

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
