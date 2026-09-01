import path from 'node:path';
import { app, openFileInTree, waitForAppReady } from '../../page-objects/app.mjs';

/**
 * Stage-one disk-safety gate (5.5): a NO-EDIT fixture must survive
 * open → WYSIWYG/Source round-trip → save → reload with ZERO unintended byte
 * changes on disk.
 *
 * The fixture is pre-staged verbatim in the workspace by run.mjs and is limited
 * to the stage-one byte-stable set (heading/paragraph/fenced code/nested
 * list/link/image/trailing newline). GFM tables are intentionally NOT in this
 * fixture: v3 canonicalizes table column padding and inserts a separation blank
 * line on save (approved `table-column-padding` canonicalization, differential
 * gate 5.4) — exact no-edit byte restore for tables is stage-two `reconcile`
 * territory (task 8.3).
 */
export function registerDiskSafetyTests() {
  describe('MarkFlow smoke: disk safety (5.5)', () => {
    // Must match the fixture staged by e2e/run.mjs.
    const FIXTURE = '# Disk Safety\n\n这是段落内容。\n\n- 列表项一\n  - 子项\n- 列表项二\n\n[链接](https://example.test)\n\n![图](./img.png)\n\n```ts\nconst a = 1;\n```\n';

    it('keeps a NO-EDIT fixture byte-identical across open/switch/save/reload', async () => {
      await waitForAppReady();

      const workspace = process.env.MARKFLOW_E2E_WORKSPACE;
      expect(workspace).toBeTruthy();
      const fixturePath = path.join(workspace, 'disk-safety-fixture.md');

      const readFixture = () => browser.tauri.execute(
        ({ core }, fp) => core.invoke('read_file', { path: fp }),
        fixturePath,
      );

      // Baseline: exact bytes staged before launch (also confirms the fixture
      // is on disk unchanged so far).
      expect(await readFixture()).toBe(FIXTURE);

      // Open the fixture (no edits).
      await openFileInTree('disk-safety-fixture.md');
      await browser.waitUntil(async () => {
        const text = await (await app.wysiwyg()).getText();
        return text.includes('Disk Safety');
      }, { timeout: 10_000 });

      // No-edit round-trip: WYSIWYG → source → WYSIWYG.
      await (await app.sourceMode()).click();
      await expect(await app.sourceMode()).toHaveAttribute('aria-pressed', 'true');
      await (await app.wysiwygMode()).click();
      await expect(await app.wysiwygMode()).toHaveAttribute('aria-pressed', 'true');

      // Save without editing.
      await (await app.save()).click();

      // Reload the file (re-open it).
      await openFileInTree('disk-safety-fixture.md');
      await browser.waitUntil(async () => {
        const text = await (await app.wysiwyg()).getText();
        return text.includes('Disk Safety');
      }, { timeout: 10_000 });

      // Re-read. Stage-one guarantee (5.5): a no-edit save never loses or
      // corrupts content, and the ONLY permitted disk difference is the
      // registered `file-tail-newline` canonicalization — a trailing blank line
      // appended at EOF. Any other byte change (content loss, corruption,
      // unexpected rewrite) fails the gate. Strict no-edit byte restore is a
      // stage-two `reconcile` deliverable (8.3).
      const after = await readFixture();
      // Content up to the trailing newline boundary must be identical to the
      // original — proves no content loss and no unexpected rewrite. The only
      // tolerated diff is trailing `\n`s at EOF (file-tail-newline).
      expect(after.replace(/\n+$/, '')).toBe(FIXTURE.replace(/\n+$/, ''));
      // And the tail must be nothing but newlines (a blank line at EOF), never
      // other appended text.
      expect(/^\s*$/.test(after.slice(FIXTURE.replace(/\n+$/, '').length))).toBe(true);
    });
  });
}
