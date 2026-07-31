## ADDED Requirements

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
