import { app, openSettings, closeSettings, waitForAppReady } from '../../page-objects/app.mjs';

export function registerSettingsPanelTests() {
  describe('MarkFlow smoke: settings panel', () => {
    it('opens settings, switches tabs, toggles theme, and persists state on reopen', async () => {
      await waitForAppReady();

      // ── Open settings ──
      await openSettings();

      await expect(await app.settingsPanel('general')).toBeDisplayed();
      await expect(await app.settingsPanel('appearance')).not.toBeDisplayed();

      // ── Switch to appearance tab ──
      await (await app.settingsTab('appearance')).click();

      await browser.waitUntil(async () => {
        const tab = await app.settingsTab('appearance');
        const className = await tab.getAttribute('class');
        return className?.includes('active');
      }, { timeout: 5_000 });

      await expect(await app.settingsPanel('appearance')).toBeDisplayed();
      await expect(await app.settingsPanel('general')).not.toBeDisplayed();

      // ── Switch to dark theme ──
      await expect(await app.themeSwatch('light')).toHaveElementClass('selected');
      await expect(await app.themeSwatch('dark')).not.toHaveElementClass('selected');

      await (await app.themeSwatch('dark')).click();

      await expect(await app.themeSwatch('dark')).toHaveElementClass('selected');
      await expect(await app.themeSwatch('light')).not.toHaveElementClass('selected');

      // ── Close and reopen ──
      await closeSettings();

      await openSettings();

      await (await app.settingsTab('appearance')).click();
      await browser.waitUntil(async () => {
        const tab = await app.settingsTab('appearance');
        const className = await tab.getAttribute('class');
        return className?.includes('active');
      }, { timeout: 5_000 });

      await expect(await app.themeSwatch('dark')).toHaveElementClass('selected');
      await expect(await app.themeSwatch('light')).not.toHaveElementClass('selected');

      await closeSettings();
    });
  });
}
