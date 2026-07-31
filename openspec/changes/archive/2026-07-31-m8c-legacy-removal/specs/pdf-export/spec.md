## ADDED Requirements

### Requirement: PDF 导出输入绑定 Export IR
PDF export SHALL consume HTML rendered from Core Export IR for the initiating `sessionId`, `revision`, `exportRequestId`, `clientId`, and `windowLabel`. The PDF backend MAY continue to use platform WebView/native APIs for final PDF generation, but MUST NOT read the live editor DOM, active path, active selection, or current window content as document truth.

#### Scenario: PDF export remains bound after document switch
- **WHEN** session A starts PDF export
- **AND** the active window switches to session B before PDF generation completes
- **THEN** PDF output SHALL use session A's Export IR snapshot
- **AND** no DOM, path, or selection from session B SHALL be read

#### Scenario: PDF export fails instead of falling back
- **WHEN** Export IR cannot be built or the request identity cannot be validated
- **THEN** PDF export SHALL fail with a stable export error
- **AND** the backend MUST NOT open a live editor DOM print/export fallback

### Requirement: PDF removal evidence
PDF export changes that participate in M8C removal SHALL record platform smoke results and job cleanup evidence in the M8C evidence document.

#### Scenario: Platform smoke is recorded
- **WHEN** a removal PR changes PDF export code
- **THEN** the M8C evidence SHALL record macOS, Windows, and Linux smoke status
- **AND** unverified platforms SHALL be marked `未验证` rather than passed
