import { app, openSettings, closeSettings, waitForAppReady } from '../../page-objects/app.mjs';

describe('MarkFlow settings panel smoke', () => {
  it('opens settings, switches tabs, toggles theme, and persists state on reopen', async () => {
    await waitForAppReady();

    // ── Open settings ──────────────────────────────────────────────
    await openSettings();

    // Default tab should be "通用" (general)
    await expect(await app.settingsPanel('general')).toBeDisplayed();
    await expect(await app.settingsPanel('appearance')).not.toBeDisplayed();

    // ── Switch to "外观" (appearance) tab ──────────────────────────
    await (await app.settingsTab('appearance')).click();

    // Wait for active tab class to update
    await browser.waitUntil(async () => {
      const tab = await app.settingsTab('appearance');
      const className = await tab.getAttribute('class');
      return className?.includes('active');
    }, { timeout: 5_000 });

    await expect(await app.settingsPanel('appearance')).toBeDisplayed();
    await expect(await app.settingsPanel('general')).not.toBeDisplayed();

    // ── Switch to dark theme ───────────────────────────────────────
    // Initially light theme is selected
    await expect(await app.themeSwatch('light')).toHaveElementClass('selected');
    await expect(await app.themeSwatch('dark')).not.toHaveElementClass('selected');

    await (await app.themeSwatch('dark')).click();

    // Verify dark theme swatch is now selected
    await expect(await app.themeSwatch('dark')).toHaveElementClass('selected');
    await expect(await app.themeSwatch('light')).not.toHaveElementClass('selected');

    // ── Close settings ─────────────────────────────────────────────
    await closeSettings();

    // ── Reopen settings and verify theme state is preserved ────────
    await openSettings();

    // Navigate back to appearance tab
    await (await app.settingsTab('appearance')).click();
    await browser.waitUntil(async () => {
      const tab = await app.settingsTab('appearance');
      const className = await tab.getAttribute('class');
      return className?.includes('active');
    }, { timeout: 5_000 });

    // Dark theme should still be selected
    await expect(await app.themeSwatch('dark')).toHaveElementClass('selected');
    await expect(await app.themeSwatch('light')).not.toHaveElementClass('selected');

    // ── Cleanup: close settings ────────────────────────────────────
    await closeSettings();
  });
});
