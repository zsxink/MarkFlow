import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

export function registerFileOpenTests() {
  describe('MarkFlow smoke: file open', () => {
    it('opens welcome.md and displays structured content in the lossless editor', async () => {
      await waitForAppReady();

      await openFileInTree('welcome.md');

      // P3 default-on: the document opens on the lossless CodeMirror surface.
      await browser.waitUntil(async () => {
        const text = await (await app.sourceContent()).getText();
        return text.includes('MarkFlow E2E Testing');
      }, { timeout: 10_000, timeoutMsg: 'Expected lossless editor to show welcome.md content' });

      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('段落内容'));
    });
  });
}
