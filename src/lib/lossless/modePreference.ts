// Lossless preferred-mode persistence — P2 corrective.
//
// The user's chosen editor mode (Source vs Live Preview) must survive document
// switches. Each `openLosslessDocument` creates a NEW EditorSurfaceBinding, so
// the mode cannot live on the binding (it would be reset every open). This
// module holds the preference OUTSIDE any binding and persists it to
// localStorage so a restart keeps the same mode.
//
// The Live Preview flag still gates the preference: when `codemirrorLivePreview`
// is off, `getPreferredMode` always returns 'source' (Source-only), matching the
// existing P2 behavior.

const STORAGE_KEY = 'markflow.losslessPreferredMode';
const DEFAULT_MODE = 'preview' as const;

let preferred: 'source' | 'preview' = readStored();

function readStored(): 'source' | 'preview' {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_MODE;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'source' || stored === 'preview' ? stored : DEFAULT_MODE;
  } catch {
    // localStorage unavailable (SSR/test) — keep the default.
    return DEFAULT_MODE;
  }
}

function writeStored(mode: 'source' | 'preview'): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Non-persistent environment — the in-memory value still applies for this
    // session, so document switches keep working.
  }
}

/** Remember the user's chosen mode (called only on a successful switch). */
export function setPreferredMode(mode: 'source' | 'preview'): void {
  if (mode !== 'source' && mode !== 'preview') return;
  preferred = mode;
  writeStored(mode);
}

/**
 * The mode a new lossless document should open in. `livePreviewEnabled` gates
 * the preview choice: with the Live Preview flag off the mode is forced back to
 * Source (Source-only, matching the P2 flag contract).
 */
export function getPreferredMode(livePreviewEnabled: boolean): 'source' | 'preview' {
  return livePreviewEnabled ? preferred : 'source';
}

/** Test-only: reset to the default (mirrors a fresh session). */
export function resetPreferredMode(): void {
  preferred = DEFAULT_MODE;
  writeStored(DEFAULT_MODE);
}
