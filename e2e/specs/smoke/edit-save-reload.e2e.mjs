import path from 'node:path';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

describe('MarkFlow edit save reload smoke', () => {
  const TEST_MARKER = 'E2E 保存测试内容';

  it('edits content, saves to disk, and persists across modes', async () => {
    await waitForAppReady();

    // Open welcome.md
    await openFileInTree('welcome.md');

    // Switch to source mode and append content
    await (await app.sourceMode()).click();
    await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');

    const sourceContent = await app.sourceContent();
    await sourceContent.click();
    await sourceContent.addValue(`\n\n${TEST_MARKER}`);

    // Verify content visible in source editor
    await expect(sourceContent).toHaveText(expect.stringContaining(TEST_MARKER));

    // Click save and wait for toast confirmation
    await (await app.save()).click();
    await (await app.toast()).waitForDisplayed({ timeout: 10_000 });

    // Verify disk content via Tauri invoke read_file
    const workspace = process.env.MARKFLOW_E2E_WORKSPACE;
    expect(workspace).toBeTruthy();
    const filePath = path.join(workspace, 'welcome.md');
    const fileContent = await browser.tauri.execute(
      ({ core }, fp) => core.invoke('read_file', { path: fp }),
      filePath,
    );
    expect(fileContent).toContain(TEST_MARKER);

    // Switch to WYSIWYG and verify content rendered
    await (await app.wysiwygMode()).click();
    await expect(await app.wysiwyg()).toHaveText(expect.stringContaining(TEST_MARKER));
  });
});
