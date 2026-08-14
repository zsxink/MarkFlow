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

/**
 * Dev/test-only manual opt-in: `localStorage['markflow.losslessCoreSession']==='1'`
 * enables the flag at boot. Production default stays OFF; nothing in the product
 * sets this key. Used for the P1B manual desktop acceptance.
 */
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('markflow.losslessCoreSession') === '1') {
    enabled = true;
  }
} catch {
  // localStorage unavailable (SSR/test) — keep default off.
}

/** Enable/disable the lossless Core session path (tests/E2E only). */
export function setLosslessCoreSessionEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the lossless Core session path is active. */
export function isLosslessCoreSessionEnabled(): boolean {
  return enabled;
}

// E2E-only hook: the desktop E2E (WebDriver) enables the flag on the real app.
if (import.meta.env.MODE === 'e2e') {
  (window as unknown as { __setLosslessCoreSession?: (v: boolean) => void }).__setLosslessCoreSession =
    setLosslessCoreSessionEnabled;
}
