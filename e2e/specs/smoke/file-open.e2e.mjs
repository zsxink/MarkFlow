import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

export function registerFileOpenTests() {
  describe('MarkFlow smoke: file open', () => {
    it('opens welcome.md and displays structured content in WYSIWYG editor', async () => {
      await waitForAppReady();

      await openFileInTree('welcome.md');

      await browser.waitUntil(async () => {
        const text = await (await app.wysiwyg()).getText();
        return text.includes('MarkFlow E2E Testing');
      }, { timeout: 10_000, timeoutMsg: 'Expected WYSIWYG editor to show welcome.md content' });

      await expect(await app.wysiwyg()).toHaveText(expect.stringContaining('段落内容'));
    });
  });
}
