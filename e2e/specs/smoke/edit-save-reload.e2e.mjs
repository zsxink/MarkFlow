import path from 'node:path';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

export function registerEditSaveTests() {
  describe('MarkFlow smoke: edit save reload', () => {
    const TEST_MARKER = 'E2E 保存测试内容';

    it('edits content, saves to disk, and persists', async () => {
      await waitForAppReady();

      await openFileInTree('welcome.md');

      await (await app.sourceMode()).click();
      await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');

      const sourceContent = await app.sourceContent();
      await sourceContent.click();
      await sourceContent.addValue(`\n\n${TEST_MARKER}`);

      await expect(sourceContent).toHaveText(expect.stringContaining(TEST_MARKER));

      await (await app.save()).click();
      await (await app.toast()).waitForDisplayed({ timeout: 10_000 });

      const workspace = process.env.MARKFLOW_E2E_WORKSPACE;
      expect(workspace).toBeTruthy();
      const filePath = path.join(workspace, 'welcome.md');
      const fileContent = await browser.tauri.execute(
        ({ core }, fp) => core.invoke('read_file', { path: fp }),
        filePath,
      );
      expect(fileContent).toContain(TEST_MARKER);

      await (await app.wysiwygMode()).click();
      await expect(await app.wysiwyg()).toHaveText(expect.stringContaining(TEST_MARKER));
    });
  });
}
