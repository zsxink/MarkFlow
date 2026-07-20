import { showFiles, waitForAppReady } from '../../page-objects/app.mjs';

describe('MarkFlow desktop smoke', () => {
  it('starts a real Tauri window with an isolated workspace', async () => {
    await waitForAppReady();

    const workspace = await browser.tauri.execute(({ core }) => core.invoke('get_workspace'));
    expect(workspace).toBe(process.env.MARKFLOW_E2E_WORKSPACE);

    await showFiles();
    const welcomeFile = await browser.$('[data-testid="file-tree-item"][data-path$="/welcome.md"]');
    await welcomeFile.waitForDisplayed({ timeout: 10_000 });
  });
});
