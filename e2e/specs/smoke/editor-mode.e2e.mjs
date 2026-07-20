import { app, waitForAppReady } from '../../page-objects/app.mjs';

describe('MarkFlow editor smoke', () => {
  it('edits content and preserves it across WYSIWYG and source modes', async () => {
    await waitForAppReady();

    await (await app.sourceMode()).click();
    await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');
    await expect(await app.source()).toBeDisplayed();
    const sourceContent = await app.sourceContent();
    await sourceContent.click();
    await sourceContent.addValue('E2E editor content');
    await expect(sourceContent).toHaveText(expect.stringContaining('E2E editor content'));

    await (await app.wysiwygMode()).click();
    await expect(await app.wysiwygMode()).toHaveAttribute('aria-pressed', 'true');
    await expect(await app.wysiwyg()).toHaveText(expect.stringContaining('E2E editor content'));
  });
});
