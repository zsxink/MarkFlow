// Lossless Live Preview feature flag.
//
// P3 decision (issue #254 umbrella): `codemirrorLivePreview` is now default-ON
// alongside `losslessCoreSession` — the lossless path opens with Live Preview
// reachable by default. It is a MODE switch ON TOP of an active lossless Core
// session, never an independent session: Live Preview is only reachable when
// `losslessCoreSession` is also ON. Explicit opt-out is available via
// `localStorage['markflow.codemirrorLivePreview']==='0'`.

let enabled = true;

/**
 * Opt-out: `localStorage['markflow.codemirrorLivePreview']==='0'` disables the
 * flag at boot. Absent / any other value keeps it ON. Nothing in the product
 * sets this key.
 */
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('markflow.codemirrorLivePreview') === '0') {
    enabled = false;
  }
} catch {
  // localStorage unavailable (SSR/test) — keep default on.
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
