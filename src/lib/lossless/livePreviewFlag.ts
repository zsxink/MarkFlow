// Lossless Live Preview feature flag.
//
// P2 constraint: `codemirrorLivePreview` MUST be default-off. It is a MODE
// switch ON TOP of an active lossless Core session, never an independent
// session: Live Preview is only reachable when `losslessCoreSession` is also
// ON. Turning `codemirrorLivePreview` off rolls back to the SAME lossless
// Source/Core session (no serializer save, no PM ownership), matching
// design P2 §9. Only E2E/test harnesses may enable it (the product build
// never does).

let enabled = false;

/**
 * Dev/test-only manual opt-in: `localStorage['markflow.codemirrorLivePreview']==='1'`
 * enables the flag at boot. Production default stays OFF; nothing in the product
 * sets this key. Used for the P2 manual desktop acceptance.
 */
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('markflow.codemirrorLivePreview') === '1') {
    enabled = true;
  }
} catch {
  // localStorage unavailable (SSR/test) — keep default off.
}

/** Enable/disable the lossless Live Preview path (tests/E2E only). */
export function setLivePreviewEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the lossless Live Preview path is active. */
export function isLivePreviewEnabled(): boolean {
  return enabled;
}

// E2E-only hook: the desktop E2E (WebDriver) enables the flag on the real app.
if (import.meta.env.MODE === 'e2e') {
  (window as unknown as { __setLivePreview?: (v: boolean) => void }).__setLivePreview =
    setLivePreviewEnabled;
}
