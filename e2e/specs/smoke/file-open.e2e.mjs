import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

describe('MarkFlow file open smoke', () => {
  it('opens welcome.md and displays structured content in WYSIWYG editor', async () => {
    await waitForAppReady();

    // Open welcome.md from the file tree
    await openFileInTree('welcome.md');

    // Wait for the WYSIWYG editor to show the file content
    await browser.waitUntil(async () => {
      const text = await (await app.wysiwyg()).getText();
      return text.includes('MarkFlow E2E Testing');
    }, { timeout: 10_000, timeoutMsg: 'Expected WYSIWYG editor to show welcome.md content' });

    // Verify heading and paragraph content are rendered
    await expect(await app.wysiwyg()).toHaveText(expect.stringContaining('段落内容'));
  });
});
