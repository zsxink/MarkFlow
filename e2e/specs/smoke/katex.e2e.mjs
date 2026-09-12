import path from 'node:path';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

/**
 * KaTeX integration e2e — verifies the full formula link:
 * 1. Creating a document with $..$ and $$..$$ formulas
 * 2. Switching source ↔ WYSIWYG preserves the formula syntax (round-trip)
 * 3. Saving to disk and reloading keeps formulas intact
 * 4. The editor does not crash or show blank content
 */
export function registerKatexTests() {
  describe('MarkFlow: KaTeX math formula integration', () => {
    const INLINE_FORMULA = 'E=mc^2';
    const BLOCK_FORMULA = '\\frac{a}{b}';

    it('preserves inline and block formulas through source/wysiwyg round-trip and save', async () => {
      await waitForAppReady();

      await openFileInTree('welcome.md');

      // Switch to source mode and append formulas
      await (await app.sourceMode()).click();
      await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');

      const sourceContent = await app.sourceContent();
      await sourceContent.click();
      await sourceContent.addValue(`\n\nMath: $${INLINE_FORMULA}$ and block \n\n$$\n${BLOCK_FORMULA}\n$$\n`);

      await expect(sourceContent).toHaveText(expect.stringContaining(`$${INLINE_FORMULA}$`));
      await expect(sourceContent).toHaveText(expect.stringContaining(`$${BLOCK_FORMULA}`));

      // Switch to WYSIWYG — formula source must be preserved, editor must not crash
      await (await app.wysiwygMode()).click();

      // Save
      await (await app.save()).click();
      await (await app.toast()).waitForDisplayed({ timeout: 10_000 });

      // Verify persisted markdown keeps formulas (round-trip to disk)
      const workspace = process.env.MARKFLOW_E2E_WORKSPACE;
      expect(workspace).toBeTruthy();
      const filePath = path.join(workspace, 'welcome.md');
      const fileContent = await browser.tauri.execute(
        ({ core }, fp) => core.invoke('read_file', { path: fp }),
        filePath,
      );
      expect(fileContent).toContain(`$${INLINE_FORMULA}$`);
      expect(fileContent).toContain(BLOCK_FORMULA);

      // Switch back to source mode to confirm in-memory round-trip
      await (await app.sourceMode()).click();
      const sourceAfter = await app.sourceContent();
      await expect(sourceAfter).toHaveText(expect.stringContaining(`$${INLINE_FORMULA}$`));
      await expect(sourceAfter).toHaveText(expect.stringContaining(BLOCK_FORMULA));
    });

    it('editor remains functional (no crash/blank) with formula content present', async () => {
      await waitForAppReady();
      // After formulas were introduced, the WYSIWYG editor should still be
      // interactive and not blank.
      await (await app.wysiwygMode()).click();
      await expect(await app.wysiwyg()).toBeDisplayed();
    });
  });
}
