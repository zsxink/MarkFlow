/**
 * Default-flag rollback drill — task 5.10 §9.
 *
 * The gate: `losslessCoreSession` and `codemirrorLivePreview` must NOT be
 * treated as approved-release until minimum parity is signed. The explicit
 * opt-out (`localStorage==='0'`) is the rollback escape hatch that must ship
 * alongside the default-on product path. This test proves the rollback works:
 * with the opt-out set, a boot always resolves to the LEGACY ProseMirror path;
 * without it, the lossless path is the default.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('default-flag rollback drill (task 5.10)', () => {
  const MODULE_CACHE: Array<[string, string]> = [];
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  async function loadFlags() {
    const flag = await import('./flag');
    const live = await import('./livePreviewFlag');
    return { losslessOn: flag.isLosslessCoreSessionEnabled(), stripOff: live.isLivePreviewEnabled() };
  }

  it('default (no localStorage) resolves to lossless ON + live preview ON', async () => {
    const { losslessOn, stripOff } = await loadFlags();
    expect(losslessOn).toBe(true);
    expect(stripOff).toBe(true);
  });

  it('opt-out `losslessCoreSession==0` rolls back to the legacy ProseMirror path', async () => {
    localStorage.setItem('markflow.losslessCoreSession', '0');
    const { losslessOn } = await loadFlags();
    expect(losslessOn).toBe(false);
  });

  it('opt-out `codemirrorLivePreview==0` keeps the lossless Core session but disables Live Preview', async () => {
    localStorage.setItem('markflow.codemirrorLivePreview', '0');
    const { losslessOn, stripOff } = await loadFlags();
    expect(losslessOn).toBe(true);   // Core session stays
    expect(stripOff).toBe(false);    // Live Preview is off → Source-only lossless
  });

  it('opt-out for BOTH flags → fully legacy (no lossless at all)', async () => {
    localStorage.setItem('markflow.losslessCoreSession', '0');
    localStorage.setItem('markflow.codemirrorLivePreview', '0');
    const { losslessOn, stripOff } = await loadFlags();
    expect(losslessOn).toBe(false);
    expect(stripOff).toBe(false);
  });
});
