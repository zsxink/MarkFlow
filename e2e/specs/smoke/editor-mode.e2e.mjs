import { app, waitForAppReady } from '../../page-objects/app.mjs';

export function registerEditorModeTests() {
  describe('MarkFlow smoke: editor mode', () => {
    it('edits content and preserves it across Source and Live Preview modes', async () => {
      await waitForAppReady();

      // P3 default-on: documents open on the lossless single CodeMirror EditorView
      // in Source mode, so the Source button is already armed.
      await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');
      await expect(await app.source()).toBeDisplayed();
      const sourceContent = await app.sourceContent();
      await sourceContent.click();
      await sourceContent.addValue('E2E editor content');
      await expect(sourceContent).toHaveText(expect.stringContaining('E2E editor content'));

      // "所见即所得" in the lossless path is Live Preview: a compartment
      // reconfigure on the SAME EditorView — the source characters stay present.
      await (await app.wysiwygMode()).click();
      await expect(await app.wysiwygMode()).toHaveAttribute('aria-pressed', 'true');
      await expect(await app.source()).toBeDisplayed();
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('E2E editor content'));
    });
  });
}
