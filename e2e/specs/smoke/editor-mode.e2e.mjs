import { app, waitForAppReady } from '../../page-objects/app.mjs';

export function registerEditorModeTests() {
  describe('MarkFlow smoke: editor mode', () => {
    it('edits content and preserves it across Source and Live Preview modes', async () => {
      await waitForAppReady();

      // Do not rely on the persisted mode preference: explicitly arm Source
      // before editing and wait for the mode button to report it.
      await (await app.sourceMode()).click();
      await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');
      await expect(await app.source()).toBeDisplayed();
      const sourceContent = await app.sourceContent();
      const editorCountBefore = await browser.execute(() =>
        document.querySelectorAll('.source-editor-wrapper .cm-editor').length,
      );
      await sourceContent.click();
      await sourceContent.addValue('E2E editor content');
      await expect(sourceContent).toHaveText(expect.stringContaining('E2E editor content'));

      // "所见即所得" in the lossless path is Live Preview: a compartment
      // reconfigure on the SAME EditorView — the source characters stay present.
      await (await app.wysiwygMode()).click();
      await expect(await app.wysiwygMode()).toHaveAttribute('aria-pressed', 'true');
      await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'false');
      await expect(await app.source()).toBeDisplayed();
      const editorCountAfter = await browser.execute(() =>
        document.querySelectorAll('.source-editor-wrapper .cm-editor').length,
      );
      expect(editorCountAfter).toBe(editorCountBefore);
      await expect(await app.sourceContent()).toHaveText(expect.stringContaining('E2E editor content'));
    });
  });
}
