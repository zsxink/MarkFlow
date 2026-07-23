import path from 'node:path';
import { app, showFiles, waitForAppReady } from '../../page-objects/app.mjs';

export function registerLaunchTests() {
  describe('MarkFlow smoke: launch', () => {
    it('starts a real Tauri window with an isolated workspace', async () => {
      await waitForAppReady();

      const workspace = await browser.tauri.execute(({ core }) => core.invoke('get_workspace'));
      expect(workspace).toBe(process.env.MARKFLOW_E2E_WORKSPACE);

      await showFiles();
      const welcomeFile = await browser.$('[data-testid="file-tree-item"][data-path$="/welcome.md"]');
      await welcomeFile.waitForDisplayed({ timeout: 10_000 });
    });
  });
}
