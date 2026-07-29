## ADDED Requirements

### Requirement: Core documentation reflects archived stage state
Core 重构 stage docs SHALL distinguish archived/completed stages, current implementation facts, and future planning items.

#### Scenario: Completed stage is no longer described as pending
- **WHEN** a Core stage change has been archived and validated
- **THEN** stage docs and migration matrices SHALL NOT describe that stage as pending, in progress, or awaiting baseline freeze
- **AND** they SHALL include enough evidence or checklist references for a reader to understand completion status

### Requirement: Archived delta specs are synchronized into source-of-truth specs
OpenSpec archive output SHALL be reflected in `openspec/specs/` before a follow-up documentation cleanup claims the source-of-truth specs are current.

#### Scenario: Archived change contains delta specs
- **WHEN** an archived change under `openspec/changes/archive/` contains `specs/**/spec.md`
- **THEN** the corresponding main specs SHALL include the accepted delta requirements or an explicit documented reason why the delta is not applicable
- **AND** archive sync validation SHALL pass before completion

### Requirement: Legacy architecture specs are clearly marked
Specs that describe ProseMirror/Tiptap behavior retained only for migration or regression context SHALL include a Legacy notice.

#### Scenario: Spec references legacy editor internals
- **WHEN** a spec references ProseMirror, Tiptap, `editor.serializer.ts`, or legacy WYSIWYG internals that are planned to be replaced by Core-backed stages
- **THEN** the spec SHALL identify whether the requirement is current legacy behavior, historical context, or pending migration work
- **AND** the notice SHALL avoid implying that the behavior has already been removed
