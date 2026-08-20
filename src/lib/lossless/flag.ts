// Lossless Core session feature flag.
//
// P3 decision (issue #254 umbrella): `losslessCoreSession` is now default-ON —
// the product opens documents through the lossless Core path by default, with
// ProseMirror retained only as an explicit rollback. Explicit opt-out is still
// available via `localStorage['markflow.losslessCoreSession']==='0'` (kept so a
// data-integrity rollback can ship without a code release).
//
// Isolation: when the flag is ON, a document opened through the lossless path
// must NOT be owned by the ProseMirror WYSIWYG editor (design P1B §5 reviewer
// checklist). Switching the flag off must safely flush/close any open lossless
// document before the legacy path takes over.

let enabled = true;

/**
 * Opt-out: `localStorage['markflow.losslessCoreSession']==='0'` disables the
 * flag at boot (rollback path). Absent / any other value keeps it ON. Nothing
 * in the product sets this key; it is a data-integrity escape hatch.
 */
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('markflow.losslessCoreSession') === '0') {
    enabled = false;
  }
} catch {
  // localStorage unavailable (SSR/test) — keep default on.
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
