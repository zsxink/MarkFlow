// Lossless Core session feature flag.
//
// P1B constraint: `losslessCoreSession` MUST be default-off. Any byte-fixture
// failure keeps it off. Only E2E/test harnesses may enable it (the product
// build never does).
//
// Isolation: when the flag is ON, a document opened through the lossless path
// must NOT be owned by the ProseMirror WYSIWYG editor (design P1B §5 reviewer
// checklist). Switching the flag off must safely flush/close any open lossless
// document before the legacy path takes over.

let enabled = false;

/** Enable/disable the lossless Core session path (tests/E2E only). */
export function setLosslessCoreSessionEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the lossless Core session path is active. */
export function isLosslessCoreSessionEnabled(): boolean {
  return enabled;
}
