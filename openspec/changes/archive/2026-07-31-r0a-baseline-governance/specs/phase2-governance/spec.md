## ADDED Requirements

### Requirement: Phase 2 capability matrix is machine-readable
The repository SHALL maintain a machine-readable capability matrix (`openspec/capabilities/matrix.json`) with a JSON schema that records each capability's owner, child change, feature flag, and per-layer states (notStarted, implemented, automatedVerified, desktopVerified, visualVerified, imeVerified, platformVerified, productAccepted). Each capability SHALL reference evidence URIs for unit, integration, desktop, visual, IME, platform, and observation layers. The matrix SHALL be parseable by `scripts/check-capability-matrix.sh` and the states vocabulary SHALL match the phase-2 acceptance manual.

#### Scenario: Matrix schema validates
- **WHEN** running `scripts/check-capability-matrix.sh` against `openspec/capabilities/matrix.json`
- **THEN** the script SHALL validate the JSON against `matrix.schema.json` and exit 0 if valid
- **THEN** unknown state values or missing required fields SHALL fail the check

#### Scenario: Capability set is synced from specs
- **WHEN** `openspec/specs/` contains a capability not present in the matrix
- **THEN** `scripts/check-capability-matrix.sh` SHALL fail and print the missing capability

#### Scenario: Product acceptance requires prior layers
- **WHEN** a capability has `productAccepted` set to true
- **THEN** `automatedVerified`, `desktopVerified`, `visualVerified`, `imeVerified`, `platformVerified` SHALL also be true, otherwise the check fails

### Requirement: Every umbrella task has a unique child owner
The repository SHALL maintain `openspec/capabilities/requirements.json` mapping every phase-2 umbrella task ID (`1.1`-`12.10`) to exactly one child change and owner. A task ID SHALL NOT appear more than once as an owner. Cross-child dependencies SHALL be expressed with `dependsOn` rather than a second owner.

#### Scenario: Task has unique owner
- **WHEN** running `scripts/check-capability-matrix.sh` and a task ID appears twice as an owner
- **THEN** the check SHALL fail and print the duplicate task ID

#### Scenario: R0A task mapping is complete
- **WHEN** checking `requirements.json` for tasks `1.1` through `1.7` and `2.10`
- **THEN** each SHALL map to `r0a-baseline-governance` with a unique owner

### Requirement: Evidence directory layout is fixed and indexed
The repository SHALL record implementation and manual acceptance evidence under `docs/markflow-core-phase2/evidence/<stage>/<case>/<platform>/<revision>/<timestamp>/`. Each entry SHALL include `evidence.json` with case ID, result, operator, commit SHA, build profile, feature flags, environment (OS, WebView, IME, locale, theme, scale, viewport), fixture name and initial hash, timestamps, and artifact paths. `docs/markflow-core-phase2/evidence/INDEX.json` SHALL index all evidence entries.

#### Scenario: Evidence entry references existing files
- **WHEN** running `scripts/check-evidence-honesty.sh` and an `INDEX.json` entry references a file that does not exist
- **THEN** the check SHALL fail and print the missing path

#### Scenario: Evidence schema is validated
- **WHEN** `evidence.json` does not conform to the evidence schema
- **THEN** `scripts/check-evidence-honesty.sh` SHALL fail and print the offending fields

### Requirement: Archive honesty check rejects fabricated completion
Before archiving, `scripts/check-evidence-honesty.sh` SHALL reject completion claims where evidence is empty, the recorded revision does not match the current HEAD, or a required gate marked PASS has no corresponding evidence URI.

#### Scenario: Empty evidence for a passed state
- **WHEN** a capability state is `true` but its evidence URI list is empty
- **THEN** the honesty check SHALL fail and name the capability and state

#### Scenario: Stale revision evidence
- **WHEN** an evidence entry's `revision` does not equal the current HEAD SHA
- **THEN** the honesty check SHALL fail and mark the evidence stale

#### Scenario: Honesty check passes for complete R0A
- **WHEN** tasks `1.1`-`1.7` and `2.10` all have non-empty, current-revision evidence
- **THEN** `scripts/check-evidence-honesty.sh` SHALL exit 0

### Requirement: Phase 2 docs distinguish charter, implementation, and acceptance status
`docs/markflow-core-phase2/**` SHALL distinguish archived charter status, current implementation facts, and future planning items. The README SHALL reference `openspec/capabilities/matrix.json` as the machine-readable tracking source and SHALL NOT describe an archived charter as product acceptance.

#### Scenario: README references matrix
- **WHEN** reading `docs/markflow-core-phase2/README.md`
- **THEN** it SHALL link to `openspec/capabilities/matrix.json` as the tracking source

#### Scenario: Charter archived is not product accepted
- **WHEN** `docs/markflow-core-phase2/04-traceability-matrix.md` describes the umbrella charter
- **THEN** it SHALL state that archived status means planning complete only, not product acceptance
- **THEN** it SHALL reference `requirements.json` for unique task ownership
